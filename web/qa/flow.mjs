/*
 * QA pass over the critical flow from .agents/qa.md:
 *   Signup -> Dashboard -> Create -> Prompt -> Generate -> Processing
 *   -> Completed -> Preview -> Download
 *
 * Plus the acceptance criteria in shared/RESEARCH.md for the redesign.
 *
 * Run with both servers up:  node qa/flow.mjs
 * Screenshots land in qa/shots/.
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.QA_BASE || 'http://localhost:5173';

/*
 * Pin the local renderer. With a Gemini key configured the first available
 * model is Veo, and this suite runs often enough that billing a real video
 * generation every pass would be indefensible. Real providers are covered by
 * qa/real-providers.mjs.
 */
const SIM = { video: 'sim-motion-1', image: 'sim-image-1', audio: 'sim-voice-1' };

const SHOTS = path.join(import.meta.dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const consoleErrors = [];

const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, `${name}.png`) });

const PROMPT = 'textarea[aria-label="Prompt"]';
const SEND = 'button[aria-label="Generate"]';
const MODEL = 'select[title="Model"]';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

page.on('console', msg => msg.type() === 'error' && consoleErrors.push(msg.text()));
page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));

/* Waits for the composer to have a model list, which means the catalogue landed. */
async function composerReady() {
  await page.waitForSelector(PROMPT, { timeout: 15000 });
  await page.waitForFunction(
    sel => (document.querySelector(sel)?.options.length ?? 0) > 0,
    MODEL,
    { timeout: 15000 }
  );
}

async function generate(kind, prompt) {
  await composerReady();
  await page.selectOption(MODEL, SIM[kind]);
  await page.fill(PROMPT, prompt);
  await page.waitForFunction(sel => !document.querySelector(sel)?.disabled, SEND, { timeout: 10000 });
  await page.click(SEND);
}

try {
  // ---- Home: one composer, nothing else ------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('Home shows the composer', (await page.locator(PROMPT).count()) === 1);
  check('Home headline renders', (await page.locator('text=Describe anything').count()) > 0);
  await shot(page, '01-home');

  // RESEARCH.md acceptance 3: the content column stays narrow and centred.
  const column = await page.evaluate(sel => {
    const box = document.querySelector(sel)?.closest('form')?.getBoundingClientRect();
    return box ? { width: Math.round(box.width), left: Math.round(box.left) } : null;
  }, PROMPT);
  check('Composer clamps to a narrow column', column && column.width <= 820, JSON.stringify(column));

  /*
   * Focus and growth behaviour. The global :focus-visible ring drew a
   * hard-cornered rectangle across the rounded composer, because an outline
   * follows the focused element's own radius and the textarea has none.
   * The container must show focus instead, and the field must not scroll
   * until the content genuinely exceeds the cap.
   */
  await page.click(PROMPT);
  const focused = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    const box = el.closest('div');
    return {
      fieldOutline: getComputedStyle(el).outlineStyle,
      containerRing: getComputedStyle(box).boxShadow !== 'none',
    };
  }, PROMPT);
  check('Composer field draws no square focus outline', focused.fieldOutline === 'none', focused.fieldOutline);
  check('Composer container shows the focus state instead', focused.containerRing);

  await page.fill(PROMPT, 'a paper boat drifting down a rain gutter at dusk, slow dolly in, 85mm lens, shallow depth of field, amber streetlight and cool teal shadows');
  await page.waitForTimeout(250);
  const grown = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    return {
      overflow: getComputedStyle(el).overflowY,
      scrolls: el.scrollHeight > el.clientHeight,
      height: Math.round(el.getBoundingClientRect().height),
    };
  }, PROMPT);
  check(
    'Composer grows instead of scrolling on ordinary text',
    !grown.scrolls && grown.overflow === 'hidden',
    JSON.stringify(grown)
  );

  // But it must still become scrollable rather than growing without limit.
  await page.fill(PROMPT, Array.from({ length: 40 }, (_, i) => `line ${i + 1} of a very long prompt`).join(' '));
  await page.waitForTimeout(250);
  const capped = await page.evaluate(sel => {
    const el = document.querySelector(sel);
    return {
      overflow: getComputedStyle(el).overflowY,
      scrolls: el.scrollHeight > el.clientHeight,
      height: Math.round(el.getBoundingClientRect().height),
    };
  }, PROMPT);
  check(
    'Composer caps its height and scrolls past that',
    capped.scrolls && capped.overflow === 'auto' && capped.height <= 260,
    JSON.stringify(capped)
  );
  await page.fill(PROMPT, '');

  /*
   * A signed-out visitor must be able to type and send — that is the path to
   * sign-up. Gating them on a credit balance they do not have disabled the
   * button and showed them a warning they could do nothing about.
   */
  await page.fill(PROMPT, 'a paper boat drifting down a rain gutter');
  await page.waitForTimeout(300);
  check(
    'Signed-out visitor is not shown a credit warning',
    (await page.locator('text=/Needs \\d+ credits/').count()) === 0
  );
  check('Signed-out visitor can send', !(await page.locator(SEND).isDisabled()));
  await page.click(SEND);
  await page.waitForURL('**/signin**', { timeout: 10000 });
  check('Sending signed-out leads to sign in', page.url().includes('/signin'));

  // ---- Signup --------------------------------------------------------
  const email = `qa_${Date.now()}@8xbuild.ai`;
  await page.goto(`${BASE}/signin?next=/video`, { waitUntil: 'networkidle' });
  await page.fill('input[placeholder="Name"]', 'QA Runner');
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', 'supersecret123');
  await shot(page, '02-signin');
  await page.click('button[type=submit]');

  await page.waitForURL('**/video', { timeout: 15000 });
  check('Signup lands in the studio', page.url().includes('/video'));

  await page.waitForSelector('nav >> text=/10 credits/', { timeout: 10000 });
  check('Nav shows the starting credits', true);

  // ---- Create --------------------------------------------------------
  await composerReady();
  await page.selectOption(MODEL, SIM.video);
  await page.fill(PROMPT, 'a lone astronaut walking across a neon desert at dusk');
  await page.waitForFunction(sel => !document.querySelector(sel)?.disabled, SEND, { timeout: 10000 });
  check('Send enables once the prompt is valid', !(await page.locator(SEND).isDisabled()));
  await shot(page, '03-composer');
  await page.click(SEND);

  // ---- Processing ----------------------------------------------------
  await page.waitForSelector('text=/Queued|Generating/', { timeout: 15000 });
  check('Processing state is shown', true);

  // The wait must read as bounded: a generation that can be abandoned needs
  // to say so while it runs, not only when it fails.
  const cap = await page.evaluate(async () => {
    const res = await fetch('/api/catalog');
    return (await res.json()).timeouts?.video;
  });
  check('API publishes the video time limit', Number.isFinite(cap) && cap > 0, `${cap}s`);
  check(
    'Running generation shows the limit',
    (await page.locator(`text=/${cap}s max/`).count()) > 0
  );

  await shot(page, '04-processing');

  // ---- Completed -----------------------------------------------------
  await page.waitForSelector('article video', { timeout: 120000 });
  const playable = await page.evaluate(async () => {
    const v = document.querySelector('article video');
    if (!v) return { ok: false };
    if (v.readyState >= 2) return { ok: true, duration: v.duration };
    await new Promise(r => {
      v.addEventListener('loadeddata', r, { once: true });
      setTimeout(r, 8000);
    });
    return { ok: v.readyState >= 2, duration: v.duration };
  });
  check('Video loads and is playable', playable.ok, `duration=${playable.duration}`);
  await shot(page, '05-result');

  // ---- Credits spent --------------------------------------------------
  await page.waitForSelector('nav >> text=/5 credits/', { timeout: 15000 });
  check('Credits decremented to 5', true);

  // ---- Download -------------------------------------------------------
  const href = await page.locator('a:has-text("Download")').first().getAttribute('href');
  const dl = await page.request.get(href.startsWith('http') ? href : BASE + href);
  check('Download serves the file', dl.ok(), `HTTP ${dl.status()}, ${(await dl.body()).length} bytes`);

  // ---- Mode switch lives in the composer ------------------------------
  await page.click('button:has-text("Image")');
  await page.waitForURL('**/image', { timeout: 10000 });
  check('Composer mode switch navigates to image', page.url().includes('/image'));

  await generate('image', 'portrait in red neon rain');
  await page.waitForSelector('article img', { timeout: 120000 });
  check('Image generates and previews', true);
  await shot(page, '06-image');

  await page.click('button:has-text("Voice")');
  await page.waitForURL('**/audio', { timeout: 10000 });
  await generate('audio', 'Welcome to 8xBuildAI. Describe a scene and watch it come to life.');
  await page.waitForSelector('article audio', { timeout: 120000 });
  check('Voice generates and previews', true);
  await shot(page, '07-audio');

  // ---- Prompt rewriting (real Azure call) ------------------------------
  await page.goto(`${BASE}/video`, { waitUntil: 'networkidle' });
  await composerReady();
  await page.fill(PROMPT, 'a cat in a city');
  const before = await page.inputValue(PROMPT);
  await page.click('button:has-text("Enhance")');
  await page.waitForFunction(
    ([sel, original]) => document.querySelector(sel)?.value !== original,
    [PROMPT, before],
    { timeout: 90000 }
  );
  const after = await page.inputValue(PROMPT);
  check('Azure rewrites the prompt', after.length > before.length * 3, `${before.length} -> ${after.length} chars`);
  await shot(page, '08-enhanced');

  await page.click('button:has-text("Undo")');
  check('Undo restores the original prompt', (await page.inputValue(PROMPT)) === before);

  // ---- Insufficient credits -------------------------------------------
  // 10 - 5 (video) - 1 (image) - 2 (audio) = 2, so a 5-credit video is out.
  await page.fill(PROMPT, 'another expensive video');
  await page.selectOption(MODEL, SIM.video);
  await page.waitForTimeout(300);
  const blocked = await page.locator(SEND).isDisabled();
  const shortfall = await page.locator('text=/Needs 5 credits/').count();
  check('Unaffordable generation is blocked before sending', blocked && shortfall > 0);
  await shot(page, '09-insufficient');

  // ---- Community -------------------------------------------------------
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.waitForSelector('button:has-text("Share")', { timeout: 15000 });
  await page.click('button:has-text("Share")');
  await page.waitForSelector('button:has-text("Shared")', { timeout: 15000 });
  check('A result can be shared to the community', true);

  await page.goto(`${BASE}/community`, { waitUntil: 'networkidle' });
  await page.waitForSelector('figure', { timeout: 15000 });
  check('Community feed shows the shared post', (await page.locator('figure').count()) > 0);
  await shot(page, '10-community');

  await page.locator('button[aria-label="Like"]').first().click();
  await page.waitForSelector('button[aria-label="Unlike"]', { timeout: 10000 });
  check('Liking a post works', true);

  /*
   * Wait for the state rather than sampling it once. The feed effect runs
   * twice under StrictMode, so two fetches are in flight after a reload and
   * the first commit can land before the one carrying this viewer's likes.
   * Counting on a single tick made this read as an intermittent product bug;
   * it is a race in the assertion. If the like genuinely did not persist,
   * this still fails — it just waits to be sure first.
   */
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('figure', { timeout: 15000 });

  let persisted = true;
  try {
    await page.waitForSelector('button[aria-label="Unlike"]', { timeout: 10000 });
  } catch {
    persisted = false;
  }

  // On failure, report what the server actually thinks, so the next person
  // does not have to guess whether the bug is storage or rendering.
  let diagnosis = '';
  if (!persisted) {
    diagnosis = await page.evaluate(async () => {
      const token = localStorage.getItem('8xbuildai.token');
      const res = await fetch('/api/community?sort=new', {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      const body = await res.json();
      const posts = body.posts ?? [];
      return [
        `token=${token ? 'present' : 'MISSING'}`,
        `http=${res.status}`,
        `posts=${posts.length}`,
        `likedByMe=${posts.filter(p => p.likedByMe).length}`,
        `firstLikes=${posts[0]?.likes}`,
      ].join(' ');
    }).catch(e => `diagnostic failed: ${e.message}`);
  }
  check('Like persists across a reload', persisted, diagnosis);

  // ---- Library ---------------------------------------------------------
  await page.goto(`${BASE}/library`, { waitUntil: 'networkidle' });
  await page.waitForSelector('article', { timeout: 15000 });
  check('Library lists this account’s work', (await page.locator('article').count()) >= 3);
  await shot(page, '11-library');

  // ---- Pricing ----------------------------------------------------------
  await page.goto(`${BASE}/pricing`, { waitUntil: 'networkidle' });
  await page.waitForSelector('section', { timeout: 15000 });
  check('Pricing renders three plans', (await page.locator('section').count()) >= 3);
  await shot(page, '12-pricing');

  // ---- One accent, one action (RESEARCH.md acceptance 2) ----------------
  await page.goto(`${BASE}/video`, { waitUntil: 'networkidle' });
  await composerReady();
  const accentUse = await page.evaluate(() => {
    const accent = getComputedStyle(document.body).getPropertyValue('--color-accent').trim();
    const toRgb = hex => {
      const n = parseInt(hex.replace('#', ''), 16);
      return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
    };
    const target = accent.startsWith('#') ? toRgb(accent) : accent;
    let filled = 0;
    for (const el of document.querySelectorAll('button, a')) {
      if (getComputedStyle(el).backgroundColor === target) filled++;
    }
    return { accent, filled };
  });
  check(
    'Only the primary action carries a filled accent',
    accentUse.filled <= 1,
    `${accentUse.filled} filled element(s)`
  );

  // ---- Unknown route still 404s ------------------------------------------
  await page.goto(`${BASE}/not-a-real-page`, { waitUntil: 'networkidle' });
  check('Unknown path shows the 404, not the studio', (await page.locator('text=Nothing here').count()) > 0);

  // ---- Signed out ---------------------------------------------------------
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await page.goto(`${BASE}/video`, { waitUntil: 'networkidle' });
  let redirected = true;
  try {
    await page.waitForURL('**/signin**', { timeout: 10000 });
  } catch {
    redirected = false;
  }
  check('Signed-out user is redirected to sign in', redirected, page.url());

  // ---- Responsive ----------------------------------------------------------
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/', '/community', '/pricing']) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    check(`No horizontal scroll at 390px on ${route}`, !overflow);
  }
  await shot(page, '13-mobile');

  // ---- Both themes -----------------------------------------------------
  // The palette is a token swap, so a page that renders in one theme can still
  // be unreadable in the other. Check the real contrast in each.
  await page.setViewportSize({ width: 1280, height: 900 });
  const themeBg = {};
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForSelector(PROMPT, { timeout: 15000 });

    const contrast = await page.evaluate(() => {
      const parse = c => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
      const lum = ([r, g, b]) => {
        const f = v => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const body = getComputedStyle(document.body);
      const a = lum(parse(body.color));
      const b = lum(parse(body.backgroundColor));
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { bg: body.backgroundColor, fg: body.color, ratio: Math.round(ratio * 10) / 10 };
    });

    check(
      `Body text contrast is legible in ${scheme}`,
      contrast.ratio >= 7,
      `${contrast.ratio}:1 (${contrast.fg} on ${contrast.bg})`
    );
    themeBg[scheme] = contrast.bg;
    await shot(page, `14-theme-${scheme}`);
  }

  /*
   * The contrast check alone passes even when both themes render identically,
   * which is exactly how a broken light palette hid here once: `@theme` nested
   * in a media query is hoisted, so dark won in both. Assert they differ.
   */
  check(
    'Light and dark actually render differently',
    themeBg.light !== themeBg.dark,
    `light=${themeBg.light} dark=${themeBg.dark}`
  );
  check(
    'Light theme uses the paper-white ground',
    themeBg.light === 'rgb(251, 250, 244)',
    themeBg.light
  );

  await page.emulateMedia({ colorScheme: null });

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
