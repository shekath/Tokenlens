import { useState } from 'react';
import { FAQ } from '../lib/faq';
import { Banner } from './Banner';

/**
 * The FAQ, open to everyone.
 *
 * Native <details>, not a hand-rolled accordion: it is keyboard-operable and
 * announced correctly without any of that being written here, and a browser's
 * find-in-page can search inside a closed one. That last part matters more on
 * an FAQ than on anything else.
 */
export function FaqPage({ onBack }: { onBack: () => void }) {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const sections = FAQ.map((section) => ({
    ...section,
    items: needle
      ? section.items.filter(
          (i) =>
            i.q.toLowerCase().includes(needle) ||
            i.a.some((p) => p.toLowerCase().includes(needle)),
        )
      : section.items,
  })).filter((s) => s.items.length > 0);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <main className="shell page">
      <header className="pagehead">
        <Banner motif="models" id="faq" />
        <div className="pagehead__text">
          <p className="pagehead__eyebrow">Answers</p>
          <h1 className="pagehead__title">Frequently asked questions</h1>
          <p className="pagehead__lede">
            What TokenTicks does, how the counting works, and exactly what happens when you
            change a plan.
          </p>
        </div>
      </header>

      <div className="field" style={{ maxWidth: 420, marginTop: 24 }}>
        <label className="field__label" htmlFor="faq-search">
          Search
        </label>
        <input
          id="faq-search"
          className="input"
          type="search"
          value={query}
          placeholder="caching, cancel, tokeniser…"
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {needle && total === 0 ? (
        <p className="notice" style={{ marginTop: 18 }}>
          Nothing here matches “{query}”. If the answer is not on this page, the docs go into
          more detail — or ask support and quote your account ID.
        </p>
      ) : null}

      {sections.map((section) => (
        <section key={section.id} className="faq" aria-labelledby={`faq-${section.id}`}>
          <h2 id={`faq-${section.id}`} className="faq__title">
            {section.title}
          </h2>
          <p className="faq__blurb">{section.blurb}</p>

          {section.items.map((item) => (
            <details key={item.q} className="faq__item" open={Boolean(needle)}>
              <summary className="faq__q">{item.q}</summary>
              <div className="faq__a">
                {item.a.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </details>
          ))}
        </section>
      ))}

      <p className="muted" style={{ fontSize: 12, marginTop: 28 }}>
        Still stuck? Your account ID is in the profile menu — quoting it saves a round trip.{' '}
        <button type="button" className="linkish" onClick={onBack}>
          Back to the dashboard
        </button>
      </p>
    </main>
  );
}
