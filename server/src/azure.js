import { config } from './config.js';

/*
 * Prompt enhancement, served by Azure OpenAI's deployment surface.
 *
 * The user writes "a cat in a city"; a video model wants shot type, lens,
 * motion, lighting and mood. This turns one into the other.
 *
 * The deployment surface is used rather than an Azure AI Foundry agent for the
 * reason already recorded in the repo's .env: an agent carries its own tool
 * list, and a tool the model does not support fails the whole request.
 */

export class AzureError extends Error {
  constructor(message, { status, retryable = false } = {}) {
    super(message);
    this.name = 'AzureError';
    this.status = status;
    this.retryable = retryable;
  }
}

const GUIDANCE = {
  video: `You rewrite prompts for a text-to-video model.
Return ONE paragraph, 40-70 words. Include, in natural prose:
- the subject and what it is doing
- camera framing and movement (e.g. slow dolly in, handheld tracking shot)
- lens and depth of field
- lighting and time of day
- colour palette and mood
Never invent brand names, real people, or text overlays. Never use bullet
points, headings, or quotation marks.`,

  image: `You rewrite prompts for a text-to-image model.
Return ONE paragraph, 30-60 words. Include, in natural prose:
- the subject and composition
- lens or medium (e.g. 85mm portrait, oil on canvas)
- lighting and colour palette
- texture and level of detail
- overall mood
Never invent brand names, real people, or text overlays. Never use bullet
points, headings, or quotation marks.`,

  audio: `You rewrite scripts for a text-to-speech model.
Keep the speaker's meaning and intent exactly. Improve only rhythm, clarity and
natural spoken phrasing. Return ONLY the spoken words - no stage directions, no
speaker labels, no quotation marks. Keep it within 20% of the original length.`,
};

function endpointUrl() {
  const base = (config.azureEndpoint || '').replace(/\/+$/, '');
  return `${base}/openai/deployments/${config.azureModel}/chat/completions?api-version=${config.azureApiVersion}`;
}

export const hasAzure = () =>
  Boolean(config.azureEndpoint && config.azureApiKey && config.azureModel);

export async function enhancePrompt({ kind, prompt }) {
  if (!hasAzure()) {
    throw new AzureError('Prompt enhancement is not configured on the server.');
  }
  const guidance = GUIDANCE[kind];
  if (!guidance) throw new AzureError(`Cannot enhance a "${kind}" prompt.`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.azureTimeoutMs);

  let response;
  try {
    response = await fetch(endpointUrl(), {
      method: 'POST',
      headers: { 'api-key': config.azureApiKey, 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        messages: [
          { role: 'system', content: guidance },
          { role: 'user', content: prompt },
        ],
        // This deployment is a reasoning model: reasoning tokens are drawn
        // from the same budget, so a tight cap returns an empty message
        // with finish_reason "length" rather than a short answer.
        max_completion_tokens: 2000,
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new AzureError('The rewriter took too long. Try again.', { retryable: true });
    }
    throw new AzureError(`Could not reach the rewriter: ${err.message}`, { retryable: true });
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }

  if (!response.ok) {
    const detail = payload?.error?.message || `HTTP ${response.status}`;
    if (response.status === 401 || response.status === 403) {
      throw new AzureError(`Azure rejected the API key: ${detail}`, { status: response.status });
    }
    if (response.status === 429) {
      throw new AzureError('Azure rate limit reached. Try again shortly.', {
        status: 429,
        retryable: true,
      });
    }
    throw new AzureError(detail, { status: response.status });
  }

  const choice = payload?.choices?.[0];
  const enhanced = choice?.message?.content?.trim();

  if (!enhanced) {
    throw new AzureError(
      choice?.finish_reason === 'length'
        ? 'The rewriter ran out of budget before answering. Try a shorter prompt.'
        : 'The rewriter returned nothing.'
    );
  }

  // Models like to wrap prose in quotes despite being told not to.
  const cleaned = enhanced.replace(/^["'“”]+|["'“”]+$/g, '').trim();

  return {
    enhanced: cleaned,
    model: config.azureModel,
    usage: payload?.usage ?? null,
  };
}
