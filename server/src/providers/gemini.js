import { config } from '../config.js';
import { save } from '../storage.js';

/*
 * Google Generative Language API adapter.
 *
 * Three different shapes live behind one interface:
 *   video - :predictLongRunning, then poll the returned operation
 *   image - :generateContent, inline base64 image part
 *   audio - :generateContent with a speech config, inline base64 PCM
 *
 * The key is read from config and never leaves the server.
 */

const AUTH_HEADER = 'x-goog-api-key';

class ProviderError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = status;
    this.retryable = retryable;
  }
}

function describeHttpError(status, body) {
  const detail = body?.error?.message || `HTTP ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderError(`Gemini rejected the API key: ${detail}`, { status });
  }
  if (status === 429) {
    return new ProviderError(`Gemini rate limit reached: ${detail}`, { status, retryable: true });
  }
  if (status >= 500) {
    return new ProviderError(`Gemini is unavailable: ${detail}`, { status, retryable: true });
  }
  return new ProviderError(detail, { status });
}

async function call(url, { method = 'POST', body } = {}) {
  if (!config.geminiApiKey) {
    throw new ProviderError('GEMINI_API_KEY is not configured on the server.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.providerTimeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        [AUTH_HEADER]: config.geminiApiKey,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new ProviderError('Gemini did not respond in time.', { retryable: true });
    }
    throw new ProviderError(`Could not reach Gemini: ${err.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }

  if (!response.ok) throw describeHttpError(response.status, payload);
  return payload;
}

const writeBinary = (jobId, ext, buffer) => save(`${jobId}.${ext}`, buffer);

/*
 * Gemini TTS returns raw signed 16-bit PCM, which no browser will play as-is.
 * A 44-byte WAV header makes it a real file without re-encoding.
 */
function pcmToWav(pcm, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const blockAlign = channels * bitsPerSample / 8;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * blockAlign, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function startVideo(job, model) {
  const instance = { prompt: job.prompt };
  if (job.params.imageBase64) {
    instance.image = {
      bytesBase64Encoded: job.params.imageBase64,
      mimeType: job.params.imageMimeType || 'image/png',
    };
  }

  const data = await call(`${config.geminiBaseUrl}/models/${model.providerModel}:predictLongRunning`, {
    body: {
      instances: [instance],
      parameters: {
        aspectRatio: job.params.aspectRatio || '16:9',
        negativePrompt: job.params.negativePrompt || undefined,
      },
    },
  });

  if (!data?.name) throw new ProviderError('Gemini did not return an operation to poll.');
  return { providerJobId: data.name };
}

async function pollVideo(job) {
  const operation = await call(`${config.geminiBaseUrl}/${job.provider_job}`, { method: 'GET' });

  if (!operation?.done) return { status: 'PROCESSING' };

  if (operation.error) {
    throw new ProviderError(operation.error.message || 'Video generation failed.');
  }

  const generated = operation.response?.generateVideoResponse?.generatedSamples?.[0]
    || operation.response?.generatedSamples?.[0];
  const uri = generated?.video?.uri;
  if (!uri) throw new ProviderError('Gemini reported success but returned no video.');

  // The file endpoint needs the same key, so download server-side.
  const download = await fetch(uri, { headers: { [AUTH_HEADER]: config.geminiApiKey } });
  if (!download.ok) {
    throw new ProviderError(`Could not download the generated video (HTTP ${download.status}).`, { retryable: true });
  }
  const buffer = Buffer.from(await download.arrayBuffer());

  return { status: 'COMPLETED', outputUrl: await writeBinary(job.id, 'mp4', buffer), thumbnailUrl: null };
}

async function runImage(job, model) {
  const parts = [{ text: job.prompt }];
  if (job.params.imageBase64) {
    parts.push({
      inlineData: {
        mimeType: job.params.imageMimeType || 'image/png',
        data: job.params.imageBase64,
      },
    });
  }

  const data = await call(`${config.geminiBaseUrl}/models/${model.providerModel}:generateContent`, {
    body: { contents: [{ parts }] },
  });

  const imagePart = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!imagePart) {
    const refusal = data?.candidates?.[0]?.finishReason;
    throw new ProviderError(
      refusal && refusal !== 'STOP'
        ? `Gemini returned no image (${refusal}).`
        : 'Gemini returned no image for this prompt.'
    );
  }

  const buffer = Buffer.from(imagePart.inlineData.data, 'base64');
  const url = await writeBinary(job.id, 'png', buffer);
  return { status: 'COMPLETED', outputUrl: url, thumbnailUrl: url };
}

async function runAudio(job, model) {
  const data = await call(`${config.geminiBaseUrl}/models/${model.providerModel}:generateContent`, {
    body: {
      contents: [{ parts: [{ text: job.prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: job.params.voice || 'Kore' },
          },
        },
      },
    },
  });

  const audioPart = data?.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data);
  if (!audioPart) throw new ProviderError('Gemini returned no audio for this script.');

  const pcm = Buffer.from(audioPart.inlineData.data, 'base64');
  const url = await writeBinary(job.id, 'wav', pcmToWav(pcm));
  return { status: 'COMPLETED', outputUrl: url, thumbnailUrl: null };
}

export const gemini = {
  id: 'gemini',

  async start(job, model) {
    if (job.kind === 'video') return startVideo(job, model);
    return { providerJobId: null }; // image and audio complete in one call
  },

  async run(job, model) {
    if (job.kind === 'image') return runImage(job, model);
    if (job.kind === 'audio') return runAudio(job, model);
    return pollVideo(job); // video: long-running, polled
  },

  isLongRunning: job => job.kind === 'video',
};

export { ProviderError };
