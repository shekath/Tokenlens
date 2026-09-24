/**
 * Layout checks that a unit test cannot make: they need a real browser doing real
 * text layout. Run against a built preview server:
 *
 *   npm run build && npm run preview &
 *   node scripts/visual-check.mjs [outputDir]
 *
 * Every tab of the dashboard is walked, then the #/docs, #/devtools, #/faq and
 * #/privacy routes (the privacy policy in English, Hindi and right-to-left Arabic).
 *
 * Fails (exit 1) on a horizontal page scroll at any tested width, on an SVG label
 * that spills outside its own chart, on a floating panel that hangs off either
 * edge of the viewport, on a documentation screenshot that did not load, and on
 * any console or page error. Writes a full-page screenshot per configuration
 * when an output directory is given.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.PREVIEW_URL ?? 'http://localhost:4173/';
// ?preview=team unlocks the paid tabs locally so the layout of every one of them
// is checked, not just the free dashboard.
const withPreview = (u) => u + (u.includes('?') ? '&' : '?') + 'preview=team';
const OUT = process.argv[2];
if (OUT) mkdirSync(OUT, { recursive: true });

const SAMPLE = `You are a support agent for Northwind Logistics. You answer questions about shipments, delivery windows, customs paperwork and billing.

Rules:
1. Always confirm the tracking number before giving shipment details.
2. Never quote a delivery date that is not present in the tool output.
3. For customs questions, cite the document code (e.g. CN22, CN23, EX-1).

Tone: direct and warm. Short sentences.`;

const CONFIGS = [
  { name: 'light-desktop', scheme: 'light', width: 1440, height: 1000 },
  { name: 'dark-desktop', scheme: 'dark', width: 1440, height: 1000 },
  { name: 'light-tablet', scheme: 'light', width: 768, height: 1024 },
  { name: 'dark-mobile', scheme: 'dark', width: 390, height: 844 },
  { name: 'light-small', scheme: 'light', width: 320, height: 720 },
];

const problems = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });

for (const cfg of CONFIGS) {
  const ctx = await browser.newContext({
    colorScheme: cfg.scheme,
    viewport: { width: cfg.width, height: cfg.height },
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`${cfg.name}: page error - ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${cfg.name}: console error - ${m.text()}`);
  });

  await page.goto(withPreview(URL), { waitUntil: 'networkidle' });
  await page.fill('#prompt', SAMPLE);
  // Exercise the caching sliders so the three-way cost split renders too.
  await page.locator('#cached').fill('70');
  await page.locator('#hit').fill('85');
  await page.waitForTimeout(1100);

  // Walk every tab: a gated tab that only renders its paywall would otherwise
  // never have its real layout measured.
  const tabs = await page.getByRole('tab').allTextContents();
  const measure = async (where) => {
    const r = await page.evaluate(() => {
      const doc = document.documentElement;
      const spill = [];
      for (const svg of document.querySelectorAll('svg.chart')) {
        const b = svg.getBoundingClientRect();
        for (const t of svg.querySelectorAll('text')) {
          const tb = t.getBoundingClientRect();
          if (tb.width && (tb.right > b.right + 1 || tb.left < b.left - 1)) spill.push(t.textContent);
        }
      }
      // Anything that floats over the page: a dropdown, an open dialog. The
      // page's own scrollWidth does not catch these - it does not grow for
      // overflow to the LEFT, which is how a menu panel sitting at x=-115 on
      // every phone width went unnoticed. So measure them directly.
      const adrift = [];
      for (const el of document.querySelectorAll('[data-floating], dialog[open]')) {
        const b = el.getBoundingClientRect();
        if (b.width === 0 && b.height === 0) continue;
        if (b.left < -1 || b.right > doc.clientWidth + 1) {
          adrift.push(
            `${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''}` +
              ` at ${Math.round(b.left)}..${Math.round(b.right)} in 0..${doc.clientWidth}`,
          );
        }
      }
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, spill, adrift };
    });
    if (r.scrollWidth > r.clientWidth + 1) {
      problems.push(`${cfg.name} / ${where}: horizontal page scroll (${r.scrollWidth} > ${r.clientWidth})`);
    }
    if (r.spill.length) {
      problems.push(`${cfg.name} / ${where}: chart labels outside their SVG - ${r.spill.slice(0, 4).join(', ')}`);
    }
    for (const a of r.adrift) {
      problems.push(`${cfg.name} / ${where}: floating panel outside the viewport - ${a}`);
    }
  };

  for (const name of tabs) {
    await page.getByRole('tab', { name, exact: true }).click();
    await page.waitForTimeout(650);
    // Two tabs are empty states until given something to chew on; measure
    // them with content, which is the layout that can actually overflow.
    if (name.trim() === 'Cache order') {
      await page.fill('#prompt', `Current time: 2026-09-24T10:15:00Z\nRequest id: 3f2c9a1e-8b7d-4c6e-9f10-2a3b4c5d6e7f\n\n${SAMPLE}`);
      await page.waitForTimeout(700);
    }
    if (name.trim() === 'Reconcile') {
      await page.getByRole('button', { name: 'Try a sample' }).click();
      await page.waitForTimeout(500);
    }
    await measure(name.trim());
    if (OUT) {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: `${OUT}/${cfg.name}-${slug}.png`, fullPage: true });
    }
  }
  await page.getByRole('tab', { name: tabs[0], exact: true }).click();
  await page.fill('#prompt', SAMPLE);
  await page.waitForTimeout(400);

  // The Docs and FAQ routes are hash routes over the same document, so they
  // share the topbar and every measurement above applies to them too. Their own
  // risk is different: full-bleed banners and 1200px screenshots are the widest
  // things the app renders, and a broken screenshot path degrades to alt text
  // rather than to an error, so check that the pixels actually arrived.
  for (const route of ['docs', 'devtools', 'faq', 'privacy?lang=en', 'privacy?lang=hi', 'privacy?lang=ar']) {
    await page.evaluate((r) => { window.location.hash = `#/${r}`; }, route);
    await page.waitForTimeout(700);
    // Lazy images below the fold never load at the default scroll position.
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('.shot img')) img.loading = 'eager';
    });
    await page.waitForTimeout(1200);
    await measure(`#/${route}`);

    const page_ = await page.evaluate(() => ({
      heading: document.querySelector('.page h1')?.textContent?.trim() ?? '',
      banners: document.querySelectorAll('svg.banner').length,
      shots: [...document.querySelectorAll('.shot img')].map((i) => ({
        src: i.getAttribute('src'),
        loaded: i.complete && i.naturalWidth > 0,
      })),
      // The route page is itself a <main class="shell page">, so the dashboard is
      // the one that is not it. Two visible <main>s would be the bug here.
      dashboardHidden:
        document.querySelector('main.shell:not(.page)')?.hasAttribute('hidden') ?? false,
      footerLinks: [...document.querySelectorAll('.footer__links button')].map((b) =>
        b.textContent.trim(),
      ),
      dir: document.querySelector('main.page')?.getAttribute('dir') ?? null,
      lang: document.querySelector('main.page')?.getAttribute('lang') ?? null,
    }));
    if (route === 'privacy?lang=ar' && page_.dir !== 'rtl') {
      problems.push(`${cfg.name} / #/${route}: Arabic is not laid out right to left`);
    }
    if (route === 'privacy?lang=hi' && page_.lang !== 'hi-IN') {
      problems.push(`${cfg.name} / #/${route}: the page is not marked as Hindi (${page_.lang})`);
    }
    if (!page_.heading) problems.push(`${cfg.name} / #/${route}: the page rendered no heading`);
    // The footer used to live inside the dashboard's <main>, so it disappeared
    // on both reference pages. It is the way back from the bottom of a long
    // page; if it is missing here, that regressed.
    for (const link of ['Dashboard', 'Docs', 'Dev tools', 'FAQ', 'Privacy Policy']) {
      if (!page_.footerLinks.includes(link)) {
        problems.push(`${cfg.name} / #/${route}: no "${link}" link in the footer`);
      }
    }
    if (!page_.banners) problems.push(`${cfg.name} / #/${route}: no banner rendered`);
    if (!page_.dashboardHidden) {
      problems.push(`${cfg.name} / #/${route}: the dashboard is still visible behind the page`);
    }
    for (const shot of page_.shots.filter((s) => !s.loaded)) {
      problems.push(`${cfg.name} / #/${route}: screenshot did not load - ${shot.src}`);
    }
    if (OUT) await page.screenshot({ path: `${OUT}/${cfg.name}-route-${route.replace(/\W+/g, '-')}.png`, fullPage: true });
  }
  await page.evaluate(() => { window.location.hash = ''; });
  await page.waitForTimeout(400);

  const report = await page.evaluate(() => {
    const doc = document.documentElement;
    const spill = [];
    for (const svg of document.querySelectorAll('svg.chart')) {
      const b = svg.getBoundingClientRect();
      for (const t of svg.querySelectorAll('text')) {
        const tb = t.getBoundingClientRect();
        if (tb.width && (tb.right > b.right + 1 || tb.left < b.left - 1)) {
          spill.push(t.textContent);
        }
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, spill };
  });

  if (report.scrollWidth > report.clientWidth + 1) {
    problems.push(
      `${cfg.name}: horizontal page scroll (${report.scrollWidth} > ${report.clientWidth})`,
    );
  }
  if (report.spill.length) {
    problems.push(`${cfg.name}: chart labels outside their SVG - ${report.spill.slice(0, 5).join(', ')}`);
  }

  console.log(`${cfg.name.padEnd(14)} ${cfg.width}x${cfg.height}  ${problems.length ? 'see below' : 'ok'}`);
  await ctx.close();
}

await browser.close();

if (problems.length) {
  console.error('\nProblems:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('\nNo layout, overflow or console problems.');
