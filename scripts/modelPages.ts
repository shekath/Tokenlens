/**
 * Static pricing pages, one per model, written into the build by the Vite
 * plugin in vite.config.ts:
 *
 *   /models/                 every model, grouped by company
 *   /models/<id>/            one model's prices, worked examples, close alternatives
 *   /sitemap.xml             every page, for search engines
 *
 * The dashboard is a single-page app whose content only exists after its
 * script runs, so a search for "Claude Sonnet 5 pricing" has nothing to find.
 * These pages are plain HTML with the numbers in the markup, generated from
 * the same registry the app prices from, and they link into the app with the
 * model preselected (?model=<id>).
 *
 * Pure functions: models in, HTML strings out.
 */

import type { Model } from '../src/lib/models.ts';

export const SITE_URL = 'https://shekath.github.io/Tokenlens/';

/** Worked examples: typical calls, in tokens, so the page needs no tokenizer. */
export const EXAMPLES: ReadonlyArray<{ label: string; input: number; output: number }> = [
  { label: 'Chat reply', input: 1_000, output: 300 },
  { label: 'Document summary', input: 6_000, output: 400 },
  { label: 'Code change', input: 3_000, output: 1_200 },
];
/** Calls a day used for the monthly column. */
export const EXAMPLE_DAILY_CALLS = 1_000;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const int = new Intl.NumberFormat('en-US');

/** Money at a precision that suits the size, as in the app (lib/format.ts usd). */
export function money(n: number): string {
  if (n === 0) return '$0';
  const abs = Math.abs(n);
  if (abs < 0.000_001) return '<$0.000001';
  if (abs < 0.01) return `$${n.toPrecision(3).replace(/0+$/, '').replace(/\.$/, '')}`;
  if (abs < 1) return `$${n.toFixed(4)}`;
  if (abs < 1_000) return `$${n.toFixed(2)}`;
  return `$${int.format(Math.round(n))}`;
}

/** A per-million rate as it is usually quoted: $3, $0.25, $1.10. */
export function rate(n: number): string {
  if (Number.isInteger(n)) return `$${n}`;
  if (n >= 0.1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4).replace(/0+$/, '')}`;
}

export function perCall(m: Model, input: number, output: number): number {
  return (input * m.inputPerM + output * m.outputPerM) / 1e6;
}

const tokens = (n: number) => (n >= 1_000_000 ? `${int.format(n / 1_000_000)}M` : n >= 1_000 ? `${int.format(Math.round(n / 1_000))}K` : int.format(n));

/** A blended per-call cost used to rank models against each other: the first example. */
const yardstick = (m: Model) => perCall(m, EXAMPLES[0]!.input, EXAMPLES[0]!.output);

/** Up to `n` models priced closest to `m` (by the yardstick), cheaper ones first on ties. */
export function alternatives(m: Model, all: readonly Model[], n = 5): Model[] {
  const y = yardstick(m);
  return all
    .filter((o) => o.id !== m.id)
    .map((o) => ({ o, d: Math.abs(Math.log(yardstick(o) / y)) }))
    .sort((a, b) => a.d - b.d || yardstick(a.o) - yardstick(b.o) || a.o.id.localeCompare(b.o.id))
    .slice(0, n)
    .map((x) => x.o);
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f7f7f8;--card:#fff;--ink:#18181b;--ink2:#52525b;--line:#e4e4e7;--accent:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0d;--card:#141417;--ink:#f4f4f5;--ink2:#a1a1aa;--line:#27272a;--accent:#60a5fa}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:860px;margin:0 auto;padding:28px 16px 64px}a{color:var(--accent)}
.top{display:flex;align-items:center;gap:10px;font-weight:700;text-decoration:none;color:var(--ink);margin-bottom:24px}
h1{font-size:30px;line-height:1.2;letter-spacing:-.02em;margin:0 0 6px}h2{font-size:19px;margin:32px 0 10px}
.lead{color:var(--ink2);margin:0 0 20px}.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 16px;overflow-x:auto}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}tr:last-child td,tr:last-child th{border-bottom:0}
th{font-size:12.5px;color:var(--ink2);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
.cta{display:inline-block;margin:8px 0 4px;padding:10px 16px;border-radius:9px;background:var(--accent);color:#fff;text-decoration:none;font-weight:600}
@media (prefers-color-scheme:dark){.cta{color:#0b1220}}
.muted{color:var(--ink2);font-size:13px}ul.alt{padding-left:18px}footer{margin-top:40px;color:var(--ink2);font-size:13px}
`;

const LOGO = `<svg width="22" height="22" viewBox="0 0 24 24" fill="#2563eb" aria-hidden="true"><rect x="2.5" y="4.5" width="7" height="6" rx="1.8"/><rect x="11.5" y="4.5" width="10" height="6" rx="1.8" opacity=".45"/><rect x="2.5" y="13.5" width="10.5" height="6" rx="1.8" opacity=".45"/><rect x="15" y="13.5" width="6.5" height="6" rx="1.8"/></svg>`;

function shell(o: { title: string; description: string; path: string; body: string; jsonLd?: object }): string {
  const url = SITE_URL + o.path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.description)}">
<link rel="canonical" href="${esc(url)}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.description)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:type" content="website">
<style>${STYLE}</style>
${o.jsonLd ? `<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, '\\u003c')}</script>\n` : ''}</head>
<body>
<main>
<a class="top" href="${SITE_URL}">${LOGO}TokenTicks</a>
${o.body}
</main>
</body>
</html>
`;
}

export function modelPath(m: Model): string {
  return `models/${m.id}/`;
}

export function renderModelPage(m: Model, all: readonly Model[], asOf: string): string {
  const name = esc(m.label);
  const rows: Array<[string, string]> = [
    ['Input', `${rate(m.inputPerM)} per 1M tokens`],
    ['Output', `${rate(m.outputPerM)} per 1M tokens`],
  ];
  if (m.cacheReadPerM !== undefined) rows.push(['Cached input (read)', `${rate(m.cacheReadPerM)} per 1M tokens`]);
  if (m.cacheWritePerM !== undefined) rows.push(['Cache write', `${rate(m.cacheWritePerM)} per 1M tokens`]);
  if (m.batchDiscount) rows.push(['Batch / async', `${Math.round(m.batchDiscount * 100)}% off`]);
  rows.push(['Context window', `${tokens(m.context)} tokens`]);
  if (m.maxOutput) rows.push(['Longest answer', `${tokens(m.maxOutput)} tokens`]);

  const examples = EXAMPLES.map((e) => {
    const c = perCall(m, e.input, e.output);
    return `<tr><td>${esc(e.label)}</td><td class="n">${int.format(e.input)}</td><td class="n">${int.format(e.output)}</td><td class="n">${money(c)}</td><td class="n">${money(c * EXAMPLE_DAILY_CALLS * 30)}</td></tr>`;
  }).join('');

  const alts = alternatives(m, all)
    .map((o) => {
      const ratio = yardstick(o) / yardstick(m);
      const rel = Math.abs(ratio - 1) < 0.03 ? 'about the same' : ratio < 1 ? `${(1 / ratio).toFixed(1)}× cheaper` : `${ratio.toFixed(1)}× more`;
      return `<li><a href="${SITE_URL}${modelPath(o)}">${esc(o.label)}</a> (${esc(o.vendor)}): ${rel}</li>`;
    })
    .join('');

  const chat = perCall(m, EXAMPLES[0]!.input, EXAMPLES[0]!.output);
  const description = `${m.label} costs ${rate(m.inputPerM)} per million input tokens and ${rate(m.outputPerM)} per million output tokens. See the cost per call and per month, and compare it with ${all.length - 1} other models.`;
  const faq = [
    [`How much does ${m.label} cost?`, `${m.label} costs ${rate(m.inputPerM)} per million input tokens and ${rate(m.outputPerM)} per million output tokens, as of ${asOf}.`],
    [`How much is one ${m.label} call?`, `A call with ${int.format(EXAMPLES[0]!.input)} input tokens and a ${int.format(EXAMPLES[0]!.output)}-token answer costs about ${money(chat)}, or ${money(chat * EXAMPLE_DAILY_CALLS * 30)} a month at ${int.format(EXAMPLE_DAILY_CALLS)} calls a day.`],
    [`How big is the ${m.label} context window?`, `${int.format(m.context)} tokens.`],
  ];
  const body = `
<h1>${name} pricing</h1>
<p class="lead">${esc(m.vendor)} · list prices as of ${esc(asOf)}${m.hostedRate ? ' · open-weight model: a representative hosting rate, not a first-party list price' : ''}</p>
<div class="card"><table><tbody>${rows.map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td class="n">${esc(v)}</td></tr>`).join('')}</tbody></table></div>
${m.note ? `<p class="muted">${esc(m.note)}</p>` : ''}
<h2>What a call costs</h2>
<div class="card"><table><thead><tr><th>Typical call</th><th class="n">Input tokens</th><th class="n">Output tokens</th><th class="n">Per call</th><th class="n">Per month at ${int.format(EXAMPLE_DAILY_CALLS)} a day</th></tr></thead><tbody>${examples}</tbody></table></div>
<p class="muted">No caching or batch discount. Your own prompt will differ: count it exactly below.</p>
<a class="cta" href="${SITE_URL}?model=${encodeURIComponent(m.id)}">Price your own prompt on ${name}</a>
<h2>Similarly priced models</h2>
<ul class="alt">${alts}</ul>
<p><a href="${SITE_URL}models/">All ${all.length} models</a></p>
<h2>Questions</h2>
${faq.map(([q, a]) => `<h3>${esc(q)}</h3><p>${esc(a)}</p>`).join('')}
<footer>Prices come from ${esc(m.vendor)}'s published rates via the open LiteLLM price list, checked daily. Verify on the vendor's pricing page before budgeting.</footer>`;
  return shell({
    title: `${m.label} pricing and cost calculator | TokenTicks`,
    description,
    path: modelPath(m),
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  });
}

export function renderIndex(all: readonly Model[], asOf: string): string {
  const vendors = [...new Set(all.map((m) => m.vendor))];
  const sections = vendors
    .map((v) => {
      const list = all.filter((m) => m.vendor === v).sort((a, b) => a.label.localeCompare(b.label));
      return `<h2>${esc(v)}</h2><div class="card"><table><thead><tr><th>Model</th><th class="n">Input / 1M</th><th class="n">Output / 1M</th><th class="n">Context</th></tr></thead><tbody>${list
        .map((m) => `<tr><td><a href="${SITE_URL}${modelPath(m)}">${esc(m.label)}</a></td><td class="n">${rate(m.inputPerM)}</td><td class="n">${rate(m.outputPerM)}</td><td class="n">${tokens(m.context)}</td></tr>`)
        .join('')}</tbody></table></div>`;
    })
    .join('\n');
  return shell({
    title: `AI model pricing: ${all.length} models compared | TokenTicks`,
    description: `Input and output prices for ${all.length} AI models from ${vendors.length} companies, per million tokens, checked daily.`,
    path: 'models/',
    body: `<h1>AI model pricing</h1><p class="lead">${all.length} models, list prices per million tokens as of ${esc(asOf)}. Pick one for worked examples, or <a href="${SITE_URL}">price your own prompt</a>.</p>\n${sections}\n<footer>Prices come from each company's published rates via the open LiteLLM price list, checked daily.</footer>`,
  });
}

export function renderSitemap(all: readonly Model[], asOf: string): string {
  const urls = ['', 'models/', ...all.map(modelPath)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((p) => `  <url><loc>${SITE_URL}${p}</loc><lastmod>${asOf}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`;
}
