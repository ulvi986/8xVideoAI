/*
 * Smoke test against the deployed site, in a real browser.
 *
 * Separate from flow.mjs because that suite pins the sim-* models, which are
 * disabled in production (ffmpeg is not available in the serverless runtime).
 * This one uses the real models, so it spends credits and takes a minute.
 *
 *   node qa/production.mjs
 *   QA_SITE=https://... node qa/production.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SITE = process.env.QA_SITE || 'https://8xbuildai.vercel.app';
const SHOTS = path.join(import.meta.dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const PROMPT = 'textarea[aria-label="Prompt"]';
const SEND = 'button[aria-label="Generate"]';
const MODEL = 'select[title="Model"]';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', e => consoleErrors.push(`pageerror: ${e.message}`));

try {
  await page.goto(SITE, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(PROMPT, { timeout: 20000 });
  check('Home loads on the deployed site', true);

  // The local renderer cannot run here, so the catalogue must say so rather
  // than offering a model that will fail at generate time.
  // Wait for the catalogue: the select is rendered empty first.
  await page.waitForFunction(
    sel => (document.querySelector(sel)?.options.length ?? 0) > 0,
    MODEL,
    { timeout: 20000 }
  );
  const models = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    return [...(el?.options ?? [])].map(o => ({ text: o.textContent.trim(), disabled: o.disabled }));
  }, MODEL);
  check(
    'Local models are marked unavailable in production',
    models.some(m => m.disabled && /Sim/i.test(m.text)),
    models.map(m => `${m.text}${m.disabled ? ' (disabled)' : ''}`).join(', ')
  );

  const email = `prodqa_${Date.now()}@8xbuild.ai`;
  await page.goto(`${SITE}/signin?next=/image`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="Name"]', 'Prod QA');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'supersecret123');
  await page.click('button[type=submit]');
  await page.waitForURL('**/image', { timeout: 30000 });
  check('Signup works against the deployed API', true);

  await page.waitForSelector('nav >> text=/10 credits/', { timeout: 20000 });
  check('Credits granted on signup', true);

  // A real Gemini image, end to end through the UI.
  await page.waitForSelector(PROMPT);
  await page.fill(PROMPT, 'a quiet harbour at dawn, 35mm film');
  await page.waitForFunction(sel => !document.querySelector(sel)?.disabled, SEND, { timeout: 15000 });
  await page.click(SEND);
  await page.waitForSelector('text=/Queued|Generating/', { timeout: 20000 });
  check('Generation starts', true);

  await page.waitForSelector('article img', { timeout: 180000 });
  const src = await page.locator('article img').first().getAttribute('src');
  check('Real image generated and displayed', Boolean(src), src?.slice(0, 60));

  // The media must actually load in the browser, not just have a src.
  const loaded = await page.evaluate(async () => {
    const img = document.querySelector('article img');
    if (!img) return false;
    if (img.complete) return img.naturalWidth > 0;
    await new Promise(r => {
      img.addEventListener('load', r, { once: true });
      img.addEventListener('error', r, { once: true });
      setTimeout(r, 10000);
    });
    return img.naturalWidth > 0;
  });
  check('Blob-hosted media loads in the page', loaded);
  await page.screenshot({ path: path.join(SHOTS, 'prod-01-result.png') });

  await page.goto(`${SITE}/community`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  check('Community page renders', (await page.locator('h1').innerText()).includes('Community'));
  await page.screenshot({ path: path.join(SHOTS, 'prod-02-community.png') });

  check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
} catch (err) {
  check('Production smoke test completed', false, err.message);
  await page.screenshot({ path: path.join(SHOTS, 'prod-zz-failure.png') });
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
