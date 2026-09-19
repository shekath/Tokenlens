import type { ReactNode } from 'react';
import { requiredTier, type Feature } from '../lib/entitlements';

/**
 * The paywall wrapper.
 *
 * The blueprint asks for the gated content rendered behind `blur-sm`. It is not
 * built that way, for a reason worth stating: a CSS blur leaves the real content
 * in the DOM, so the "paywall" is defeated by the element inspector, and for a
 * tool whose output is a number that is the whole product. Locked features
 * therefore render a description of what is behind the gate, not the thing
 * itself.
 *
 * None of this is security. Every gated calculation here runs client-side, so
 * client-side gating is a purchasing prompt and nothing more. The limits that
 * have to hold - the saved-estimate cap, the tier itself - are enforced in
 * Postgres by RLS, where the client cannot reach them.
 */
export function ProGatekeeper({
  feature,
  title,
  pitch,
  bullets,
  unlocked,
  onUpgrade,
  children,
  compact = false,
}: {
  feature: Feature;
  title: string;
  pitch: string;
  bullets?: string[];
  unlocked: boolean;
  onUpgrade: () => void;
  children: ReactNode;
  compact?: boolean;
}) {
  if (unlocked) return <>{children}</>;

  const tier = requiredTier(feature);
  const label = tier === 'team' ? 'Team' : 'Pro';

  return (
    <div className={compact ? 'gate gate--compact' : 'gate'}>
      <div className="gate__badge">
        <LockIcon />
        {label}
      </div>
      <h4 className="gate__title">{title}</h4>
      <p className="gate__pitch">{pitch}</p>
      {bullets && bullets.length > 0 ? (
        <ul className="gate__list">
          {bullets.map((b) => (
            <li key={b}>
              <CheckIcon />
              {b}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="btn btn--primary" onClick={onUpgrade}>
        See {label} plans
      </button>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="2.4" y="5.2" width="7.2" height="5.4" rx="1.4" />
      <path d="M4.2 5.2V3.9a1.8 1.8 0 0 1 3.6 0v1.3" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="var(--success-text)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.4 6.3 4.7 8.6 9.6 3.6" />
    </svg>
  );
}
