import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';
import { save } from '../storage.js';

/*
 * The local provider. Renders a real, playable artefact with ffmpeg so the
 * whole product flow - queue, poll, preview, download - works with no API key.
 *
 * Everything it produces is watermarked SIMULATED and flagged simulated:true
 * by the API. It is a stand-in for a model, never a pretend one.
 */

const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

/* Deterministic colour per prompt, so the same prompt looks the same twice. */
function paletteFor(prompt) {
  const digest = crypto.createHash('sha256').update(prompt).digest();
  const hue = digest[0] * 360 / 256;
  return {
    hue,
    hex: hslToHex(hue, 0.55, 0.28),
    accentHex: hslToHex((hue + 40) % 360, 0.9, 0.6),
  };
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `${f(0)}${f(8)}${f(4)}`;
}

/* ffmpeg's drawtext needs these escaped or the filtergraph fails to parse. */
function escapeDrawText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "’")
    .replace(/%/g, '\\%')
    .replace(/\n/g, ' ');
}

function wrap(text, width) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

/*
 * `-nostdin` matters: without it ffmpeg opens stdin for interactive keys, and
 * a spawned pipe that is never written to can leave it waiting.
 *
 * The kill timer matters more. This promise is awaited by the job worker
 * while holding one of its concurrency slots; if ffmpeg ever hung, the
 * promise would never settle, the slot would never be released, and after
 * JOB_CONCURRENCY hangs the queue would stop forever.
 */
function runFfmpeg(args, { timeoutMs = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, ['-nostdin', ...args], { windowsHide: true });
    let stderr = '';
    let settled = false;

    const finish = fn => (...a) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(...a);
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(reject)(new Error(`The renderer timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    child.stderr.on('data', chunk => { stderr += chunk.toString(); });

    child.on('error', finish(err => {
      reject(new Error(
        err.code === 'ENOENT'
          ? 'ffmpeg was not found on PATH. Set FFMPEG_PATH or install ffmpeg.'
          : `ffmpeg failed to start: ${err.message}`
      ));
    }));

    child.on('close', finish(code => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-600)}`));
    }));
  });
}

function dimensionsFor(aspect) {
  if (aspect === '9:16') return { w: 720, h: 1280 };
  if (aspect === '1:1') return { w: 1024, h: 1024 };
  return { w: 1280, h: 720 };
}

/*
 * Text is drawn line by line rather than with one multi-line drawtext,
 * because a literal newline inside a filtergraph argument is not portable
 * across ffmpeg builds.
 */
function textFilters(lines, { startY, size, colour, alphaExpr }) {
  return lines.map((line, i) => {
    const parts = [
      `text='${escapeDrawText(line)}'`,
      `fontcolor=${colour}`,
      `fontsize=${size}`,
      `x=(w-text_w)/2`,
      `y=${startY + i * Math.round(size * 1.35)}`,
    ];
    if (alphaExpr) parts.push(`alpha='${alphaExpr}'`);
    return `drawtext=${parts.join(':')}`;
  });
}

/*
 * `gradients` is a SOURCE filter, so it is the input (-f lavfi -i) and not a
 * link in a -vf chain. Chaining it after a `color` input left the colour
 * source unconnected and let ffmpeg pick the frame count itself, which is why
 * a 6-second request produced a 5-second file.
 *
 * There is deliberately no `noise` filter: film grain is the single most
 * expensive thing you can hand H.264, and it pushed a 5-second 720p clip to
 * 47MB. The gradient's own `speed` supplies the motion.
 */
async function renderVideo({ prompt, params, outFile }) {
  const { w, h } = dimensionsFor(params.aspectRatio);
  const duration = Math.min(Math.max(Number(params.duration) || 6, 2), 12);
  const { hex, accentHex } = paletteFor(prompt);
  const lines = wrap(prompt, 34).slice(0, 4);

  const filters = [
    ...textFilters(lines, {
      startY: Math.round(h / 2 - (lines.length * (w / 26) * 1.35) / 2),
      size: Math.round(w / 26),
      colour: 'white',
      alphaExpr: 'if(lt(t,0.6),t/0.6,1)',
    }),
    `drawtext=text='SIMULATED · 8xBuildAI':fontcolor=0x${accentHex}:fontsize=${Math.round(w / 44)}:x=${Math.round(w / 24)}:y=h-th-${Math.round(h / 18)}`,
    'format=yuv420p',
  ].join(',');

  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', `gradients=s=${w}x${h}:c0=0x${hex}:c1=0x0E0E0E:d=${duration}:speed=0.05:r=30`,
    '-vf', filters,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '28',
    '-movflags', '+faststart',
    '-t', String(duration),
    outFile,
  ]);
}

async function renderImage({ prompt, params, outFile }) {
  const { w, h } = dimensionsFor(params.aspectRatio);
  const { hex, accentHex } = paletteFor(prompt);
  const lines = wrap(prompt, 30).slice(0, 5);

  const filters = [
    ...textFilters(lines, {
      startY: Math.round(h / 2 - (lines.length * (w / 24) * 1.35) / 2),
      size: Math.round(w / 24),
      colour: 'white',
    }),
    `drawtext=text='SIMULATED · 8xBuildAI':fontcolor=0x${accentHex}:fontsize=${Math.round(w / 40)}:x=${Math.round(w / 22)}:y=h-th-${Math.round(h / 16)}`,
  ].join(',');

  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi',
    '-i', `gradients=s=${w}x${h}:c0=0x${hex}:c1=0x0A0A0A:d=1`,
    '-vf', filters,
    '-frames:v', '1',
    outFile,
  ]);
}

/*
 * Audio: a short tone bed whose pitch is derived from the script, so different
 * scripts sound different. It is explicitly not speech - there is no local TTS
 * engine assumed - and the UI labels it as a placeholder.
 */
async function renderAudio({ prompt, params, outFile }) {
  const seconds = Math.min(Math.max(Math.round(String(prompt).split(/\s+/).length / 2.5), 3), 30);
  const digest = crypto.createHash('sha256').update(prompt).digest();
  const base = 180 + (digest[1] % 120);
  const third = Math.round(base * 1.25);

  await runFfmpeg([
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=${base}:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=${third}:duration=${seconds}`,
    '-filter_complex',
    `[0:a][1:a]amix=inputs=2:duration=shortest,tremolo=f=4.5:d=0.6,afade=t=in:d=0.4,afade=t=out:st=${Math.max(seconds - 0.6, 0.1)}:d=0.6`,
    '-ar', '44100', '-b:a', '128k',
    outFile,
  ]);
}

export const simulator = {
  id: 'simulator',

  async start(job) {
    // Nothing remote to call: the work happens in poll() so the job still
    // moves through QUEUED -> PROCESSING -> COMPLETED like a real provider.
    return { providerJobId: `sim_${crypto.randomUUID()}` };
  },

  async run(job) {
    // Render to a scratch directory, not to the storage location: in
    // production storage is a remote blob store, not a path on this machine.
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), '8x-'));
    const ext = job.kind === 'video' ? 'mp4' : job.kind === 'image' ? 'png' : 'm4a';
    const filename = `${job.id}.${ext}`;
    const outFile = path.join(workDir, filename);
    const params = job.params || {};

    if (job.kind === 'video') await renderVideo({ prompt: job.prompt, params, outFile });
    else if (job.kind === 'image') await renderImage({ prompt: job.prompt, params, outFile });
    else await renderAudio({ prompt: job.prompt, params, outFile });

    if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
      throw new Error('The renderer produced no output.');
    }

    // ffmpeg can only write to a real path, so the render lands in a temp
    // directory and is then handed to whichever storage backend is active.
    const outputUrl = await save(filename, fs.readFileSync(outFile));

    let thumbnailUrl = null;
    if (job.kind === 'video') {
      const thumbName = `${job.id}.jpg`;
      const thumbFile = path.join(workDir, thumbName);
      try {
        await runFfmpeg([
          '-y', '-hide_banner', '-loglevel', 'error',
          '-i', outFile, '-frames:v', '1', '-ss', '1', thumbFile,
        ]);
        thumbnailUrl = await save(thumbName, fs.readFileSync(thumbFile));
      } catch {
        // A missing poster is cosmetic; the generation still succeeded.
      }
    } else if (job.kind === 'image') {
      thumbnailUrl = outputUrl;
    }

    return { outputUrl, thumbnailUrl, simulated: true };
  },
};
