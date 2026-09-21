/**
 * Layout checks that a unit test cannot make: they need a real browser doing real
 * text layout. Run against a built preview server:
 *
 *   npm run build && npm run preview &
 *   node scripts/visual-check.mjs [outputDir]
 *
 * Fails (exit 1) on a horizontal page scroll at any tested width, on an SVG label
 * that spills outside its own chart, on a floating panel that hangs off either
 * edge of the viewport, and on any console or page error. Writes a full-page
 * screenshot per configuration when an output directory is given.
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
    await measure(name.trim());
    if (OUT) {
      const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
      await page.screenshot({ path: `${OUT}/${cfg.name}-${slug}.png`, fullPage: true });
    }
  }
  await page.getByRole('tab', { name: tabs[0], exact: true }).click();
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
