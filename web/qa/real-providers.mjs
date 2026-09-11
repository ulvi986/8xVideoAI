/*
 * Exercises the REAL providers end to end: Veo video, Gemini image, Gemini
 * speech, and the Azure prompt rewriter.
 *
 *   node qa/real-providers.mjs
 *
 * Kept out of qa/flow.mjs on purpose. This one costs money and takes minutes,
 * so it is opt-in; flow.mjs pins the local renderer and runs free.
 *
 * Needs the API on :8787 with GEMINI_API_KEY configured.
 */
const API = process.env.QA_API || 'http://localhost:8787';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

async function call(path, options = {}, token) {
  const response = await fetch(API + path, {
    ...options,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { ok: response.ok, status: response.status, body };
}

const health = await call('/api/health');
if (!health.body?.providers || health.body.providers.gemini !== 'configured') {
  console.log('\n  GEMINI_API_KEY is not configured on the server.');
  console.log('  Run: cd server && npm run check:gemini\n');
  process.exit(1);
}

const email = `real_${Date.now()}@8xbuild.ai`;
const signup = await call('/api/auth/signup', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'supersecret123', displayName: 'Real Provider QA' }),
});
const token = signup.body.token;

/*
 * A fresh account gets 10 credits; video(5) + image(1) + audio(2) = 8, so the
 * run fits without topping up.
 */
async function generate(kind, model, prompt, extra = {}) {
  const created = await call(
    '/api/generations',
    { method: 'POST', body: JSON.stringify({ kind, model, prompt, ...extra }) },
    token
  );
  if (!created.ok) {
    check(`${kind} accepted by the API`, false, JSON.stringify(created.body?.error));
    return null;
  }

  const id = created.body.generation.id;
  const started = Date.now();
  const deadline = started + 6 * 60 * 1000;

  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 4000));
    const { body } = await call(`/api/generations/${id}`, {}, token);
    const g = body.generation;
    if (g.status === 'COMPLETED' || g.status === 'FAILED') {
      const seconds = ((Date.now() - started) / 1000).toFixed(0);
      if (g.status === 'FAILED') {
        check(`${kind} via ${model}`, false, `${g.error} (${seconds}s)`);
        return null;
      }
      check(
        `${kind} via ${model}`,
        !g.simulated,
        `${seconds}s, simulated=${g.simulated}, ${g.outputUrl}`
      );
      return g;
    }
  }
  check(`${kind} via ${model}`, false, 'timed out after 6 minutes');
  return null;
}

// ---- prompt rewriting ------------------------------------------------
const enhanced = await call(
  '/api/enhance',
  { method: 'POST', body: JSON.stringify({ kind: 'video', prompt: 'a cat in a city' }) },
  token
);
check(
  'Azure rewrites a prompt',
  enhanced.ok && enhanced.body.enhanced.length > 60,
  enhanced.ok ? `${enhanced.body.enhanced.length} chars` : JSON.stringify(enhanced.body?.error)
);

// ---- real generations -------------------------------------------------
const image = await generate('image', 'gemini-image', 'a neon-lit ramen bar in Tokyo at night, 35mm photograph', {
  aspectRatio: '1:1',
});
const audio = await generate('audio', 'gemini-tts', 'Welcome to 8xBuildAI. Describe a scene, and watch it come to life.', {
  voice: 'Kore',
});
const video = await generate('video', 'veo-3.1-fast', 'a golden retriever puppy running across a sunny lawn', {
  aspectRatio: '16:9',
});

// ---- the files are real ----------------------------------------------
for (const [label, g, minBytes] of [
  ['image', image, 50_000],
  ['audio', audio, 20_000],
  ['video', video, 500_000],
]) {
  if (!g) continue;
  const response = await fetch(API + g.outputUrl);
  const bytes = (await response.arrayBuffer()).byteLength;
  check(`${label} file downloads and is substantial`, response.ok && bytes > minBytes, `${bytes} bytes`);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
