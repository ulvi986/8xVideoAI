/*
 * QA pass over the critical flow from .agents/qa.md:
 *   Signup -> Dashboard -> Create -> Prompt -> Generate -> Processing
 *   -> Completed -> Preview -> Download
 *
 * Run with both servers up:  node qa/flow.mjs
 * Screenshots land in qa/shots/.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QA_BASE || 'http://localhost:5173';
const SHOTS = path.join(import.meta.dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];

const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: false });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', msg => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

try {
  // ---- Explore ------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('Explore renders', (await page.locator('text=Prompt in. Shot out.').count()) > 0);
  await shot(page, '01-explore');

  // ---- Signup -------------------------------------------------------
  const email = `qa_${Date.now()}@8xbuild.ai`;
  await page.goto(`${BASE}/signin?next=/video`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Display name"]', 'QA Runner');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'supersecret123');
  await shot(page, '02-signup');
  await page.click('button[type=submit]');

  await page.waitForURL('**/video', { timeout: 15000 });
  check('Signup lands in the video studio', page.url().includes('/video'));

  // Wait for the credit chip itself rather than reading the header the
  // instant the route changes, which races React's first commit.
  await page.waitForSelector('header >> text=/✦\\s*10/', { timeout: 10000 });
  const credits = await page.locator('header').innerText();
  check('Header shows starting credits', /✦\s*10/.test(credits), credits.replace(/\s+/g, ' ').slice(-24));

  // ---- Create -------------------------------------------------------
  await page.fill('textarea', 'a lone astronaut walking across a neon desert at dusk');
  const button = page.locator('button[type=submit]', { hasText: 'Generate' });
  // Same reason: the button is correctly disabled until the prompt lands.
  await button.waitFor({ state: 'attached' });
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button[type=submit]')].find(x =>
      x.textContent.includes('Generate')
    );
    return b && !b.disabled;
  }, null, { timeout: 10000 });
  check('Generate shows its credit cost', (await button.innerText()).includes('✦ 5'));
  check('Generate enables once the prompt is valid', !(await button.isDisabled()));
  await shot(page, '03-prompt-ready');

  await button.click();

  // ---- Processing ---------------------------------------------------
  await page.waitForSelector('text=/Queued|Generating/', { timeout: 15000 });
  check('Processing state is shown', true);
  await shot(page, '04-processing');

  // ---- Completed ----------------------------------------------------
  await page.waitForSelector('video', { timeout: 120000 });
  check('Video element appears when complete', true);

  const playable = await page.evaluate(async () => {
    const v = document.querySelector('video');
    if (!v) return { ok: false, reason: 'no video element' };
    if (v.readyState >= 2) return { ok: true, duration: v.duration };
    await new Promise(r => {
      v.addEventListener('loadeddata', r, { once: true });
      setTimeout(r, 8000);
    });
    return { ok: v.readyState >= 2, duration: v.duration, readyState: v.readyState };
  });
  check('Video actually loads and is playable', playable.ok, `duration=${playable.duration}`);
  await shot(page, '05-completed');

  // ---- Credits were spent -------------------------------------------
  const afterCredits = await page.locator('header').innerText();
  check('Credits decremented to 5', afterCredits.includes('5'), afterCredits.replace(/\s+/g, ' ').slice(0, 60));

  // ---- Download ------------------------------------------------------
  const href = await page.locator('a:has-text("Download")').getAttribute('href');
  const dl = await page.request.get(href.startsWith('http') ? href : BASE + href);
  check('Download link serves the file', dl.ok(), `HTTP ${dl.status()}, ${(await dl.body()).length} bytes`);

  // ---- History -------------------------------------------------------
  check('History strip has the generation', (await page.locator('img[alt=""]').count()) > 0);

  // ---- Image studio --------------------------------------------------
  await page.goto(`${BASE}/image`, { waitUntil: 'networkidle' });
  check('Image studio empty state', (await page.locator('text=Start creating with').count()) > 0);
  await page.fill('input[placeholder="Describe the scene you imagine"]', 'portrait in red neon rain');
  await page.click('button[type=submit]');
  await page.waitForSelector('img[alt="portrait in red neon rain"]', { timeout: 120000 });
  check('Image generates and previews', true);
  await shot(page, '06-image');

  // ---- Audio studio --------------------------------------------------
  await page.goto(`${BASE}/audio`, { waitUntil: 'networkidle' });
  await page.fill('textarea', 'Welcome to 8xBuildAI. Describe a scene and watch it come to life.');
  await page.click('button[type=submit]');
  await page.waitForSelector('audio', { timeout: 120000 });
  check('Audio generates and previews', true);
  await shot(page, '07-audio');

  // ---- Insufficient credits -----------------------------------------
  // 10 - 5 (video) - 1 (image) - 2 (audio) = 2, so a 5-credit video is unaffordable.
  await page.goto(`${BASE}/video`, { waitUntil: 'networkidle' });
  await page.fill('textarea', 'another expensive video');
  const disabled = await page.locator('button[type=submit]', { hasText: 'Generate' }).isDisabled();
  const shortfall = await page.locator('text=/more credit/').count();
  check('Unaffordable generation is blocked before clicking', disabled && shortfall > 0);
  await shot(page, '08-insufficient-credits');

  // ---- Pricing & profile --------------------------------------------
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
  check('Pricing renders three plans', (await page.locator('text=/STARTER|PLUS|ULTRA/').count()) >= 3);
  await shot(page, '09-pricing');

  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  check('Profile lists the work', (await page.locator('article').count()) >= 3);
  await shot(page, '10-profile');

  // ---- Unauthenticated redirect --------------------------------------
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/video`, { waitUntil: 'networkidle' });
  check('Signed-out user is redirected to sign in', page.url().includes('/signin'));

  // ---- Responsive -----------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  );
  check('Pricing does not scroll horizontally on mobile', !overflow);
  await shot(page, '11-mobile-pricing');

  check('No console errors', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
} catch (err) {
  check('QA run completed without throwing', false, err.message);
  await shot(page, 'zz-failure');
} finally {
  await browser.close();
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);
