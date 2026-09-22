import { useState } from 'react';
import { Dialog } from './Dialog';
import { COMPARISON, PLANS, type Plan, type Tier } from '../lib/entitlements';
import { hasBackend } from '../lib/supabase';

export function PricingDialog({
  open,
  onClose,
  currentTier,
  signedIn,
  hasSubscription,
  error,
  switching,
  onCheckout,
  onSwitch,
  onNeedAccount,
}: {
  open: boolean;
  onClose: () => void;
  currentTier: Tier;
  signedIn: boolean;
  /** True when a subscription already exists, whatever tier it is on. */
  hasSubscription: boolean;
  /** Why the last checkout attempt did not open, or null. */
  error: string | null;
  onCheckout: (plan: Plan, period: 'monthly' | 'annual') => void;
  onSwitch: (plan: Plan, period: 'monthly' | 'annual') => void;
  switching: boolean;
  onNeedAccount: () => void;
}) {
  const [period, setPeriod] = useState<'monthly' | 'annual'>('monthly');

  return (
    <Dialog open={open} onClose={onClose} title="Plans" wide>
      {error ? (
        <p className="notice notice--error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      <div className="row" style={{ justifyContent: 'center', marginBottom: 18 }}>
        <div className="segmented" role="group" aria-label="Billing period">
          {(['monthly', 'annual'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              className={period === p ? 'segmented__btn is-on' : 'segmented__btn'}
              onClick={() => setPeriod(p)}
            >
              {p === 'monthly' ? 'Monthly' : 'Annual'}
              {p === 'annual' ? <span className="badge badge--exact">save 31%</span> : null}
            </button>
          ))}
        </div>
      </div>

      <div className="plans">
        {PLANS.map((plan) => {
          const current = plan.tier === currentTier;
          const annualUnavailable = period === 'annual' && plan.annual === null;
          const price =
            plan.monthly === 0
              ? 'Free'
              : period === 'annual' && plan.annual
                ? `$${plan.annual}`
                : `$${plan.monthly}`;
          const unit =
            plan.monthly === 0 ? 'forever' : period === 'annual' && plan.annual ? 'per year' : 'per month';

          return (
            <section key={plan.tier} className={plan.tier === 'pro' ? 'plan plan--featured' : 'plan'}>
              {plan.tier === 'pro' ? <span className="plan__flag">Most popular</span> : null}
              <h3 className="plan__name">{plan.name}</h3>
              <p className="plan__audience">{plan.audience}</p>
              <p className="plan__price">
                {price}
                <span className="plan__unit">{unit}</span>
              </p>
              {annualUnavailable ? (
                <p className="muted" style={{ fontSize: 11, marginTop: -6 }}>
                  Billed monthly only.
                </p>
              ) : null}

              <ul className="plan__list">
                {plan.highlights.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ul>

              {current ? (
                <button type="button" className="btn" disabled>
                  Current plan
                </button>
              ) : plan.tier === 'free' ? (
                <button type="button" className="btn" disabled>
                  Always available
                </button>
              ) : !hasBackend ? (
                <button type="button" className="btn" disabled title="No billing backend configured">
                  Unavailable here
                </button>
              ) : !signedIn ? (
                <button type="button" className="btn btn--primary" onClick={onNeedAccount}>
                  Create an account
                </button>
              ) : hasSubscription ? (
                // Never a second checkout. Buying again while a subscription
                // is active creates a SECOND subscription - the customer pays
                // twice, and this app records one subscription id per profile,
                // so the first is silently forgotten and keeps billing with no
                // way to reach it from here. This moves the existing one, and
                // Lemon Squeezy prorates the difference.
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={switching}
                  onClick={() => onSwitch(plan, annualUnavailable ? 'monthly' : period)}
                >
                  {switching ? 'Working…' : `Switch to ${plan.name}`}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => onCheckout(plan, annualUnavailable ? 'monthly' : period)}
                >
                  Upgrade to {plan.name}
                </button>
              )}
            </section>
          );
        })}
      </div>

      <div className="tablewrap" style={{ marginTop: 22 }}>
        <table className="data">
          <caption className="sr-only">Feature comparison across plans</caption>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Hobby</th>
              <th>Pro</th>
              <th>Team</th>
            </tr>
          </thead>
          <tbody>
            {COMPARISON.map((row) => (
              <tr key={row.label}>
                <td>{row.label}</td>
                <td>{row.free}</td>
                <td>{row.pro}</td>
                <td>{row.team}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ fontSize: 11, marginTop: 14 }}>
        Billing runs through Lemon Squeezy as merchant of record, so VAT, GST and sales
        tax are handled at checkout. Cancel any time; access continues to the end of the
        paid period.
      </p>
    </Dialog>
  );
}
