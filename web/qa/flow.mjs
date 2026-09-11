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

/* Local, free, deterministic - see the note at the first selectOption. */
const SIM_MODELS = { video: 'sim-motion-1', image: 'sim-image-1', audio: 'sim-voice-1' };
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
  // ---- Landing ------------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('Landing headline renders', (await page.locator('text=Watch').first().count()) > 0);

  // The hero words animate in; if the animation never runs they stay at
  // opacity 0 and the page looks empty.
  await page.waitForTimeout(900);
  const heroVisible = await page.evaluate(() => {
    const el = document.querySelector('.rise');
    return el ? Number(getComputedStyle(el).opacity) : 0;
  });
  check('Hero animation settles visible', heroVisible > 0.9, `opacity=${heroVisible}`);

  // .rise is applied to blocks and grids as well as headline words. If it ever
  // forces inline-block again, the stats collapse into one column and the CTA
  // row wraps alongside the paragraph.
  const heroLayout = await page.evaluate(() => {
    const stats = document.querySelector('dl.rise');
    const para = document.querySelector('p.rise');
    return {
      statsDisplay: stats ? getComputedStyle(stats).display : 'missing',
      paraDisplay: para ? getComputedStyle(para).display : 'missing',
      statColumns: stats ? getComputedStyle(stats).gridTemplateColumns.split(' ').length : 0,
    };
  });
  check(
    'Hero stats stay a 3-column grid',
    heroLayout.statsDisplay === 'grid' && heroLayout.statColumns === 3,
    JSON.stringify(heroLayout)
  );
  check('Hero paragraph stays a block', heroLayout.paraDisplay === 'block');

  await shot(page, '01-landing');

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
  // Pin the local renderer. With a Gemini key configured the first available
  // model is Veo, and this suite runs often enough that letting it bill real
  // video generations on every pass would be indefensible. Real providers are
  // exercised separately by qa/real-providers.mjs.
  await page.selectOption('select', SIM_MODELS.video);
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
  await page.selectOption('select', SIM_MODELS.image);
  await page.fill('input[placeholder="Describe the scene you imagine"]', 'portrait in red neon rain');
  await page.click('button[type=submit]');
  await page.waitForSelector('img[alt="portrait in red neon rain"]', { timeout: 120000 });
  check('Image generates and previews', true);
  await shot(page, '06-image');

  // ---- Audio studio --------------------------------------------------
  await page.goto(`${BASE}/audio`, { waitUntil: 'networkidle' });
  await page.selectOption('select', SIM_MODELS.audio);
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

  // ---- Prompt enhancement (real Azure call) --------------------------
  await page.goto(`${BASE}/video`, { waitUntil: 'networkidle' });
  await page.selectOption('select', SIM_MODELS.video);
  await page.fill('textarea', 'a cat in a city');
  const before = await page.inputValue('textarea');
  await page.click('button:has-text("Enhance prompt")');
  await page.waitForFunction(
    original => document.querySelector('textarea')?.value !== original,
    before,
    { timeout: 90000 }
  );
  const after = await page.inputValue('textarea');
  check(
    'Azure rewrites the prompt into something longer',
    after.length > before.length * 3,
    `${before.length} -> ${after.length} chars`
  );
  await shot(page, '12-enhanced');

  check('Undo is offered after a rewrite', (await page.locator('button:has-text("Undo")').count()) > 0);
  await page.click('button:has-text("Undo")');
  check('Undo restores the original prompt', (await page.inputValue('textarea')) === before);

  // ---- Community ------------------------------------------------------
  // Publish the completed video from the History strip.
  await page.click('button:has-text("History")').catch(() => {});
  await page.waitForSelector('button:has-text("Share to community")', { timeout: 15000 });
  await page.click('button:has-text("Share to community")');
  await page.waitForSelector('button:has-text("In community")', { timeout: 15000 });
  check('Generation can be shared to the community', true);

  await page.goto(`${BASE}/community`, { waitUntil: 'networkidle' });
  await page.waitForSelector('article', { timeout: 15000 });
  const postCount = await page.locator('article').count();
  check('Community feed shows the shared post', postCount > 0, `${postCount} post(s)`);
  await shot(page, '13-community');

  // Like it, then confirm the count moved.
  const likeButton = page.locator('article button[aria-label="Like"]').first();
  await likeButton.click();
  await page.waitForSelector('article button[aria-label="Unlike"]', { timeout: 10000 });
  check('Liking a post works', true);

  // Reload: the like must have persisted server-side, not just locally.
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('article', { timeout: 15000 });
  check(
    'Like persists across a reload',
    (await page.locator('article button[aria-label="Unlike"]').count()) > 0
  );

  // The landing marquee is fed by the community feed.
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('Landing marquee picks up community work', (await page.locator('.marquee-track a').count()) > 0);

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
  // The redirect is a client-side <Navigate>, so it can land a tick after
  // the network goes idle. Wait for it rather than sampling the URL once.
  let redirected = true;
  try {
    await page.waitForURL('**/signin**', { timeout: 10000 });
  } catch {
    redirected = false;
  }
  check('Signed-out user is redirected to sign in', redirected, page.url());

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
