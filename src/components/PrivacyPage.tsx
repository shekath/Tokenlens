import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LEGAL } from '../lib/legal';
import {
  LANG_STORAGE_KEY,
  POLICIES,
  fill,
  formatEffective,
  pickLang,
  splitLead,
  type Block,
} from '../lib/privacy/index.ts';
import { scrollToSection, sectionFromHash, useSectionLanding } from '../lib/useSectionLanding';
import { Banner } from './Banner';

const SUPPORT_EMAIL = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined) || null;

function langFromLocation(): string | null {
  const q = window.location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get('lang') : null;
}

function storedLang(): string | null {
  try {
    return window.localStorage.getItem(LANG_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** The page's own link, keeping the language so a shared link opens in it. */
function linkFor(lang: string, section?: string): string {
  const q = new URLSearchParams();
  if (lang !== 'en') q.set('lang', lang);
  if (section) q.set('s', section);
  const s = q.toString();
  return s ? `#/privacy?${s}` : '#/privacy';
}

/**
 * The privacy policy, in the reader's language.
 *
 * English governs, and every translation carries the same sections in the same
 * order (tests/privacy.test.mjs). The whole page takes the language's `lang`
 * and `dir`, so Arabic reads right to left and screen readers use the right
 * voice. "#/privacy?lang=hi&s=rights-india" opens a section in a language.
 */
export function PrivacyPage({ onBack }: { onBack: () => void }) {
  const [lang, setLang] = useState(() =>
    pickLang({ query: langFromLocation(), stored: storedLang(), browser: navigator.languages }),
  );
  const policy = POLICIES[lang] ?? POLICIES.en!;
  useSectionLanding('privacy-');

  // Opened from a plain link (the sign-up form, the pricing dialog) rather
  // than the router, the browser would keep the dashboard's scroll position.
  useEffect(() => {
    if (!sectionFromHash(window.location.hash)) window.scrollTo({ top: 0 });
  }, []);

  // A link with ?lang= that arrives while the page is open still switches.
  useEffect(() => {
    const read = () => {
      const q = langFromLocation();
      if (q) setLang(pickLang({ query: q }));
    };
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const choose = (next: string) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Private mode: the choice lasts for this visit only.
    }
    // replaceState, not a hash assignment: no hashchange, so no scroll jump.
    window.history.replaceState(null, '', linkFor(next));
  };

  const values = useMemo(
    () => ({
      operator: LEGAL.operator,
      email: SUPPORT_EMAIL ?? policy.ui.emailFallback,
      grievance: LEGAL.grievanceOfficer ?? policy.ui.grievanceFallback,
      address: LEGAL.postalAddress ?? policy.ui.addressFallback,
      effective: formatEffective(LEGAL.effectiveDate, policy.locale),
    }),
    [policy],
  );

  /** Filled text, with the support address made a link wherever it appears. */
  const text = (s: string): ReactNode => {
    const filled = fill(s, values);
    if (!SUPPORT_EMAIL || !filled.includes(SUPPORT_EMAIL)) return filled;
    return filled.split(SUPPORT_EMAIL).map((part, i) => (
      <Fragment key={i}>
        {i > 0 ? (
          <a href={`mailto:${SUPPORT_EMAIL}`} dir="ltr">
            {SUPPORT_EMAIL}
          </a>
        ) : null}
        {part}
      </Fragment>
    ));
  };

  const block = (b: Block, i: number, leads: boolean) => {
    if (typeof b === 'string') {
      return (
        <p key={i} className="policy__p">
          {text(b)}
        </p>
      );
    }
    if ('list' in b) {
      return (
        <ul key={i} className="policy__list">
          {b.list.map((item) => {
            const lead = leads ? splitLead(item) : null;
            return (
              <li key={item}>
                {lead ? (
                  <>
                    <strong>{lead[0]}</strong> {text(lead[1])}
                  </>
                ) : (
                  text(item)
                )}
              </li>
            );
          })}
        </ul>
      );
    }
    return (
      <div key={i} className="policy__tablewrap">
        <table className="policy__table">
          <thead>
            <tr>
              {b.table.head.map((h) => (
                <th key={h} scope="col">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.table.rows.map((row) => (
              <tr key={row[0]}>
                {row.map((cell, j) =>
                  j === 0 ? (
                    <th key={j} scope="row">
                      {cell}
                    </th>
                  ) : (
                    <td key={j}>{cell}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <main className="shell page policy" lang={policy.locale} dir={policy.dir}>
      <header className="pagehead">
        <Banner motif="share" id="privacy" />
        <div className="pagehead__text">
          <p className="pagehead__eyebrow">{policy.ui.eyebrow}</p>
          <h1 className="pagehead__title">{policy.ui.title}</h1>
          <p className="pagehead__lede">{policy.ui.lede}</p>
          <p className="policy__meta">{fill(policy.ui.effective, values)}</p>
        </div>
      </header>

      <div className="policy__bar">
        <div className="field policy__lang">
          <label className="field__label" htmlFor="privacy-lang">
            {policy.ui.language}
            {lang !== 'en' ? ' · Language' : ''}
          </label>
          <select
            id="privacy-lang"
            className="input"
            value={lang}
            onChange={(e) => choose(e.target.value)}
          >
            {Object.entries(POLICIES).map(([code, p]) => (
              <option key={code} value={code} lang={p.locale} dir={p.dir}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {lang !== 'en' ? (
          <p className="notice policy__note" role="note">
            {policy.ui.translationNote}
          </p>
        ) : null}
      </div>

      <nav className="docnav" aria-label={policy.ui.onThisPage}>
        {policy.sections.map((s, i) => (
          <a
            key={s.id}
            className="docnav__link"
            href={linkFor(lang, s.id)}
            onClick={(e) => {
              e.preventDefault();
              scrollToSection(`privacy-${s.id}`);
            }}
          >
            {(i + 1).toLocaleString(policy.locale)}. {s.title}
          </a>
        ))}
      </nav>

      {policy.sections.map((s, i) => (
        <section key={s.id} id={`privacy-${s.id}`} className="policy__section" aria-labelledby={`privacy-h-${s.id}`}>
          <h2 id={`privacy-h-${s.id}`} className="policy__title">
            <span className="policy__num">{(i + 1).toLocaleString(policy.locale)}.</span> {s.title}
          </h2>
          {s.blocks.map((b, j) => block(b, j, s.id === 'terms'))}
        </section>
      ))}

      <div className="row" style={{ marginTop: 28 }}>
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          {policy.ui.back}
        </button>
      </div>
    </main>
  );
}
