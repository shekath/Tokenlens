import { useState } from 'react';
import type { Model } from '../lib/models';
import { PRICING_AS_OF } from '../lib/models';
import { buildProposal, proposalFilename, type ProposalBranding, type ProposalLine } from '../lib/proposal';
import { num, pct, usd } from '../lib/format';
import type { CostAssumptions } from '../lib/cost';

export function ProposalBuilder({
  lines,
  assumptions,
  defaultModel,
  whiteLabelAllowed,
}: {
  lines: ProposalLine[];
  assumptions: CostAssumptions;
  defaultModel: Model;
  whiteLabelAllowed: boolean;
}) {
  const [branding, setBranding] = useState<ProposalBranding>({
    companyName: '',
    clientName: '',
    projectTitle: 'LLM running costs',
    preparedBy: '',
    notes: '',
    whiteLabel: false,
  });
  const [recommendedId, setRecommendedId] = useState(defaultModel.id);
  const [done, setDone] = useState(false);

  const set = <K extends keyof ProposalBranding>(k: K, v: ProposalBranding[K]) =>
    setBranding((b) => ({ ...b, [k]: v }));

  const recommended = lines.find((l) => l.model.id === recommendedId) ?? null;

  const assumptionText = [
    `${num(assumptions.outputTokens)} output tokens per call.`,
    `${num(assumptions.callsPerDay)} calls per day, billed over 30 days.`,
    assumptions.cachedShare > 0
      ? `${pct(assumptions.cachedShare, 0)} of the prompt treated as a cacheable prefix at a ${pct(assumptions.cacheHitRate, 0)} hit rate.`
      : 'No prompt caching assumed.',
    assumptions.useBatch
      ? 'Processed through the batch/async endpoint where the vendor offers one.'
      : 'Synchronous processing at standard rates.',
    'Token counts are exact for OpenAI models and estimated for other vendors; see the dashboard for per-model detail.',
  ];

  const [busy, setBusy] = useState(false);

  const generate = async () => {
    setBusy(true);
    try {
      const doc = await buildProposal({
        branding,
        lines,
        recommended,
        assumptions: assumptionText,
        pricingAsOf: PRICING_AS_OF,
      });
      doc.save(proposalFilename(branding));
      setDone(true);
      window.setTimeout(() => setDone(false), 2200);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid--halves">
      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Proposal details</h3>
        </div>
        <p className="card__note">
          The PDF is rendered in this browser tab. Nothing about the project leaves the
          machine.
        </p>
        <div className="stack">
          <Field id="p-company" label="Your company" value={branding.companyName} onChange={(v) => set('companyName', v)} placeholder="Northwind Studio" />
          <Field id="p-client" label="Client" value={branding.clientName} onChange={(v) => set('clientName', v)} placeholder="Acme Corp" />
          <Field id="p-title" label="Project title" value={branding.projectTitle} onChange={(v) => set('projectTitle', v)} />
          <Field id="p-by" label="Prepared by" value={branding.preparedBy} onChange={(v) => set('preparedBy', v)} placeholder="Your name" />

          <div className="field">
            <label className="field__label" htmlFor="p-rec">
              Recommended model
            </label>
            <select id="p-rec" className="select" value={recommendedId} onChange={(e) => setRecommendedId(e.target.value)}>
              {lines.map((l) => (
                <option key={l.model.id} value={l.model.id}>
                  {l.model.label} — {usd(l.cachedMonthlyCost ?? l.monthlyCost)}/mo
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label className="field__label" htmlFor="p-notes">
              Notes
            </label>
            <textarea
              id="p-notes"
              className="input"
              rows={4}
              style={{ minHeight: 84, padding: 9, resize: 'vertical' }}
              value={branding.notes}
              placeholder="Why this model, what the volume assumption is based on, what is out of scope…"
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          <label className="switch" title={whiteLabelAllowed ? undefined : 'Team plan'}>
            <input
              type="checkbox"
              checked={branding.whiteLabel}
              disabled={!whiteLabelAllowed}
              onChange={(e) => set('whiteLabel', e.target.checked)}
            />
            Remove the TokenTicks footer
            {!whiteLabelAllowed ? <span className="badge">Team</span> : null}
          </label>

          <button
            type="button"
            className="btn btn--primary"
            onClick={() => void generate()}
            disabled={lines.length === 0 || busy}
          >
            {busy ? 'Rendering…' : done ? 'Downloaded' : 'Download PDF proposal'}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="card__head">
          <h3 className="card__title">What goes in</h3>
        </div>
        <p className="card__note">
          Every model you are currently comparing, at the dashboard&apos;s assumptions.
        </p>
        <div className="tablewrap">
          <table className="data">
            <thead>
              <tr>
                <th>Model</th>
                <th>Monthly</th>
                <th>With caching</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <tr key={l.model.id} className={l.model.id === recommendedId ? 'is-on' : undefined}>
                  <td>{l.model.label}</td>
                  <td>{usd(l.monthlyCost)}</td>
                  <td>{l.cachedMonthlyCost === null ? '—' : usd(l.cachedMonthlyCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="card__note" style={{ marginTop: 14, marginBottom: 0 }}>
          Assumptions printed on the PDF:
        </p>
        <ul className="plan__list" style={{ marginTop: 6 }}>
          {assumptionText.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="input" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
