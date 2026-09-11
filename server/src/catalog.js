import { hasGemini, config } from './config.js';

export const CREDIT_COST = { video: 5, image: 1, audio: 2 };

/*
 * The model catalogue. `provider` decides which adapter runs the job.
 * Gemini-backed entries are reported unavailable when no key is configured,
 * so the UI can disable them with a reason instead of failing at generate time.
 */
const MODELS = [
  // ---- video ----
  {
    id: 'veo-3.1-fast',
    label: 'Veo 3.1 Fast',
    kind: 'video',
    provider: 'gemini',
    providerModel: 'veo-3.1-fast-generate-preview',
    cost: 5,
    badge: 'TOP',
    blurb: 'Fast cinematic motion, 8s clips with audio.',
  },
  {
    id: 'veo-3.1',
    label: 'Veo 3.1',
    kind: 'video',
    provider: 'gemini',
    providerModel: 'veo-3.1-generate-preview',
    cost: 9,
    blurb: 'Highest fidelity. Slower, more credits.',
  },
  {
    id: 'sim-motion-1',
    label: 'Motion Sim 1.0',
    kind: 'video',
    provider: 'simulator',
    cost: 5,
    badge: 'LOCAL',
    blurb: 'Renders locally with ffmpeg. No API key needed.',
  },

  // ---- image ----
  {
    id: 'gemini-image',
    label: 'Gemini 2.5 Flash Image',
    kind: 'image',
    provider: 'gemini',
    providerModel: 'gemini-2.5-flash-image',
    cost: 1,
    badge: 'TOP',
    blurb: 'High-quality stills and edits.',
  },
  {
    id: 'sim-image-1',
    label: 'Still Sim 1.0',
    kind: 'image',
    provider: 'simulator',
    cost: 1,
    badge: 'LOCAL',
    blurb: 'Locally composed poster frame. No API key needed.',
  },

  // ---- audio ----
  {
    id: 'gemini-tts',
    label: 'Gemini 2.5 Flash TTS',
    kind: 'audio',
    provider: 'gemini',
    providerModel: 'gemini-2.5-flash-preview-tts',
    cost: 2,
    blurb: 'Lifelike speech from any script.',
  },
  {
    id: 'sim-voice-1',
    label: 'Voice Sim 1.0',
    kind: 'audio',
    provider: 'simulator',
    cost: 2,
    badge: 'LOCAL',
    blurb: 'Locally synthesised tone bed. No API key needed.',
  },
];

export const VOICES = [
  { id: 'kore', name: 'Kore', description: 'Neutral female, warm' },
  { id: 'puck', name: 'Puck', description: 'Bright male, upbeat' },
  { id: 'charon', name: 'Charon', description: 'Deep male, documentary' },
  { id: 'fenrir', name: 'Fenrir', description: 'Gravelly male, intense' },
  { id: 'aoede', name: 'Aoede', description: 'Soft female, intimate' },
];

export const ASPECT_RATIOS = ['16:9', '9:16', '1:1'];

function availability(model) {
  if (model.provider === 'gemini' && !hasGemini()) {
    return { available: false, reason: 'GEMINI_API_KEY is not configured on the server.' };
  }
  if (model.provider === 'simulator' && !config.allowSimulator) {
    return { available: false, reason: 'The local simulator is disabled (ALLOW_SIMULATOR=false).' };
  }
  return { available: true, reason: null };
}

export function listModels(kind) {
  return MODELS.filter(m => !kind || m.kind === kind).map(m => ({
    id: m.id,
    label: m.label,
    kind: m.kind,
    provider: m.provider,
    cost: m.cost,
    badge: m.badge || null,
    blurb: m.blurb,
    simulated: m.provider === 'simulator',
    ...availability(m),
  }));
}

export function getModel(id) {
  return MODELS.find(m => m.id === id) || null;
}

export function defaultModelFor(kind) {
  const usable = listModels(kind).find(m => m.available);
  return usable ? usable.id : null;
}

export const PLANS = [
  {
    id: 'starter',
    name: 'STARTER',
    tagline: 'For first-time AI creators',
    credits: 200,
    monthly: 15,
    annual: 15,
    was: null,
    cta: 'Get Starter',
    style: 'plain',
    note: 'No difference compared to monthly',
    highlights: ['100 image generations', '~11 fast videos', 'Fixed 200 credits/mo'],
    unlimited: [
      { name: 'Still Sim 1.0', included: false },
      { name: 'Gemini 2.5 Flash Image', included: false },
      { name: 'Veo 3.1', included: false },
    ],
  },
  {
    id: 'plus',
    name: 'PLUS',
    tagline: 'For everyday AI creation',
    credits: 1000,
    monthly: 49,
    annual: 39,
    was: 49,
    discount: '20% OFF',
    cta: 'Get Plus',
    style: 'accent',
    note: 'Save $120 compared to monthly',
    highlights: ['500 image generations', '~44 videos', 'Fixed 1,000 credits/mo'],
    unlimited: [
      { name: 'Still Sim 1.0', included: true, tag: '7-day unlimited' },
      { name: 'Gemini 2.5 Flash Image', included: true, tag: '7-day unlimited' },
      { name: 'Veo 3.1', included: false },
    ],
  },
  {
    id: 'ultra',
    name: 'ULTRA',
    tagline: 'For ambitious AI projects',
    credits: 3000,
    monthly: 129,
    annual: 99,
    was: 129,
    discount: '23% OFF',
    badge: 'BEST VALUE',
    cta: 'Get Ultra',
    style: 'hot',
    note: 'Save $360 compared to monthly',
    highlights: ['1500 image generations', '~133 videos', 'Scales to 9,000 credits'],
    unlimited: [
      { name: 'Still Sim 1.0', included: true, tag: '7-day unlimited' },
      { name: 'Gemini 2.5 Flash Image', included: true, tag: '7-day unlimited' },
      { name: 'Veo 3.1', included: true, tag: '7-day unlimited' },
    ],
  },
];
