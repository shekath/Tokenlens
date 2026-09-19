/**
 * Layout checks that a unit test cannot make: they need a real browser doing real
 * text layout. Run against a built preview server:
 *
 *   npm run build && npm run preview &
 *   node scripts/visual-check.mjs [outputDir]
 *
 * Fails (exit 1) on a horizontal page scroll at any tested width, on an SVG label
 * that spills outside its own chart, and on any console or page error. Writes a
 * full-page screenshot per configuration when an output directory is given.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const URL = process.env.PREVIEW_URL ?? 'http://localhost:4173/';
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

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.fill('#prompt', SAMPLE);
  // Exercise the caching sliders so the three-way cost split renders too.
  await page.locator('#cached').fill('70');
  await page.locator('#hit').fill('85');
  await page.waitForTimeout(1100);

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

  if (OUT) await page.screenshot({ path: `${OUT}/${cfg.name}.png`, fullPage: true });
  console.log(`${cfg.name.padEnd(14)} ${cfg.width}x${cfg.height}  ${problems.length ? 'see below' : 'ok'}`);
  await ctx.close();
}

await browser.close();

if (problems.length) {
  console.error('\nProblems:\n' + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log('\nNo layout, overflow or console problems.');
