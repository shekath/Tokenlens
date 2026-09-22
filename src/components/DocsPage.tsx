import { FEATURE_DOCS } from '../lib/featureDocs';
import { PLANS } from '../lib/entitlements';
import { MODELS, PRICING_AS_OF } from '../lib/models';
import { Banner } from './Banner';
import { Shot } from './Shot';

/**
 * The product documentation.
 *
 * One page rather than a nest of them: there are six features to explain, and
 * a reader who can scroll past the two they do not care about is better served
 * than one navigating a tree to find out which page they want.
 */
export function DocsPage({ onPricing, onBack }: { onPricing: () => void; onBack: () => void }) {
  return (
    <main className="shell page">
      <header className="pagehead pagehead--tall">
        <Banner motif="cache" id="docs" />
        <div className="pagehead__text">
          <p className="pagehead__eyebrow">Documentation</p>
          <h1 className="pagehead__title">Every feature, and what it is for</h1>
          <p className="pagehead__lede">
            TokenTicks counts the tokens in a prompt and prices it across {MODELS.length} models,
            in your browser, without the prompt ever leaving it. This is what each paid feature
            does, how it works, and when it earns its place.
          </p>
        </div>
      </header>

      <nav className="docnav" aria-label="On this page">
        {FEATURE_DOCS.map((f) => (
          <a key={f.id} className="docnav__link" href={`#/docs`} onClick={(e) => {
            e.preventDefault();
            document.getElementById(`doc-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}>
            {f.title}
          </a>
        ))}
      </nav>

      {FEATURE_DOCS.map((feature) => (
        <article key={feature.id} id={`doc-${feature.id}`} className="doc">
          <div className="doc__banner">
            <Banner motif={feature.art} id={`doc-${feature.id}`} />
            <span className={`doc__tier doc__tier--${feature.tier}`}>{feature.tier}</span>
          </div>

          <h2 className="doc__title">{feature.title}</h2>
          <p className="doc__tagline">{feature.tagline}</p>

          {feature.what.map((p) => (
            <p key={p} className="doc__body">
              {p}
            </p>
          ))}

          {feature.shot ? <Shot name={feature.shot} alt={`${feature.title} in TokenTicks`} /> : null}

          <h3 className="doc__sub">How it works</h3>
          <ol className="doc__steps">
            {feature.how.map((s) => (
              <li key={s.step}>
                <strong>{s.step}.</strong> {s.detail}
              </li>
            ))}
          </ol>

          <h3 className="doc__sub">When to reach for it</h3>
          <ul className="doc__when">
            {feature.when.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </article>
      ))}

      <section className="doc" aria-labelledby="doc-plans">
        <h2 id="doc-plans" className="doc__title">
          What each plan includes
        </h2>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Plan</th>
                <th>Price</th>
                <th>For</th>
              </tr>
            </thead>
            <tbody>
              {PLANS.map((p) => (
                <tr key={p.tier}>
                  <td>{p.name}</td>
                  <td>
                    {p.monthly === 0 ? 'Free' : `$${p.monthly}/mo`}
                    {p.annual ? ` · $${p.annual}/yr` : ''}
                  </td>
                  <td>{p.audience}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="doc__body" style={{ marginTop: 14 }}>
          Rates as published on {PRICING_AS_OF}. Vendors change prices without much notice, so
          check theirs before committing a budget.
        </p>
        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" className="btn btn--primary" onClick={onPricing}>
            See plans and billing
          </button>
          <button type="button" className="btn btn--ghost" onClick={onBack}>
            Back to the dashboard
          </button>
        </div>
      </section>
    </main>
  );
}
