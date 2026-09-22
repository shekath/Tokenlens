import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Dialog } from './Dialog';
import { countryOptions } from '../lib/countries';
import {
  billingPortalUrl,
  changeSubscription,
  hasPassword,
  saveProfile,
  setPassword,
} from '../lib/profile';
import {
  countryProblem,
  displayNameProblem,
  fullNameProblem,
  greetingName,
  initialsOf,
  phoneProblem,
} from '../lib/profileFields';
import { passwordProblem } from '../lib/auth';
import { panelOffsetLeft } from '../lib/menuPlacement';
import {
  billingNotice,
  formatAmount,
  formatBillingDate,
  formatCard,
  planLabel,
  statusLabel,
  titleCase,
} from '../lib/billing';
import type { Profile } from '../lib/subscription';
import type { Tier } from '../lib/entitlements';

type Section = 'details' | 'password' | 'subscription';

/**
 * Where the dropdown goes. The arithmetic, and why the old rule was wrong, is
 * in lib/menuPlacement.ts; this is the part that has to touch the DOM.
 *
 * Absolute rather than fixed on purpose: .topbar carries a backdrop-filter,
 * which makes it the containing block for fixed descendants, so a fixed panel
 * would silently be positioned against the header instead of the viewport.
 */
function usePanelOffset(open: boolean, wrap: React.RefObject<HTMLDivElement | null>, panel: React.RefObject<HTMLDivElement | null>) {
  const [left, setLeft] = useState<number | null>(null);

  const place = useCallback(() => {
    const w = wrap.current?.getBoundingClientRect();
    const p = panel.current?.getBoundingClientRect();
    if (!w || !p) return;
    setLeft(
      panelOffsetLeft({
        anchorLeft: w.left,
        anchorRight: w.right,
        panelWidth: p.width,
        viewportWidth: window.innerWidth,
      }),
    );
  }, [wrap, panel]);

  // Before paint, so the panel is never shown in the wrong place first.
  useLayoutEffect(() => {
    if (!open) {
      setLeft(null);
      return;
    }
    place();
    // Vertical scroll cannot change this: the panel is absolute, so it moves
    // with the trigger. A resize or a rotation can.
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, place]);

  return left;
}

/**
 * The signed-in user's menu.
 *
 * The account reference sits in the menu itself rather than behind the dialog:
 * it is the one thing here someone needs while they are talking to support, and
 * making them open a settings page to read it out is the wrong way round.
 */
export function ProfileMenu({
  user,
  profile,
  tier,
  onPricing,
  onSignOut,
  onSaved,
}: {
  user: User;
  profile: Profile | null;
  tier: Tier;
  onPricing: () => void;
  onSignOut: () => void;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<Section | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelLeft = usePanelOffset(open, wrap, panel);

  const email = profile?.email ?? user.email ?? '';
  const name = greetingName({
    displayName: profile?.displayName,
    fullName: profile?.fullName,
    email,
  });

  // Close on a click elsewhere or on Escape. Pointerdown rather than click so
  // the menu is gone before whatever was clicked reacts.
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const openSection = (s: Section) => {
    setOpen(false);
    setSection(s);
  };

  return (
    <div className="pmenu" ref={wrap}>
      <button
        type="button"
        ref={trigger}
        className="pmenu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="pmenu__avatar" aria-hidden="true">
          {initialsOf(name)}
        </span>
        <span className="pmenu__name">{name}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
        <span className="sr-only">Account menu for {email}</span>
      </button>

      {open ? (
        <div
          className="pmenu__panel"
          role="menu"
          aria-label="Account"
          data-floating=""
          ref={panel}
          style={
            panelLeft === null
              ? // First layout pass: measured, not yet placed. Hidden rather
                // than parked off-screen, so it cannot flash at the wrong edge.
                { visibility: 'hidden' }
              : { left: panelLeft, right: 'auto' }
          }
        >
          <div className="pmenu__head">
            <span className="pmenu__avatar pmenu__avatar--lg" aria-hidden="true">
              {initialsOf(name)}
            </span>
            <span className="pmenu__ident">
              <strong className="pmenu__identName">{name}</strong>
              <span className="pmenu__identMail" title={email}>
                {email}
              </span>
            </span>
            <span className={`account__tier account__tier--${tier}`}>{tier}</span>
          </div>

          <AccountId publicId={profile?.publicId ?? null} />

          <BillingLine profile={profile} />

          <div className="pmenu__sep" role="separator" />

          <button type="button" role="menuitem" className="pmenu__item" onClick={() => openSection('details')}>
            Profile details
          </button>
          {profile?.hasSubscription ? (
            <button
              type="button"
              role="menuitem"
              className="pmenu__item"
              onClick={() => openSection('subscription')}
            >
              Subscription
            </button>
          ) : null}
          <button type="button" role="menuitem" className="pmenu__item" onClick={() => openSection('password')}>
            {hasPassword(user) ? 'Change password' : 'Create a password'}
          </button>
          <button
            type="button"
            role="menuitem"
            className="pmenu__item"
            onClick={() => {
              setOpen(false);
              onPricing();
            }}
          >
            Plans and billing
          </button>

          <div className="pmenu__sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="pmenu__item pmenu__item--quiet"
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}

      <ProfileDialog
        section={section}
        onClose={() => setSection(null)}
        user={user}
        profile={profile}
        email={email}
        onSaved={onSaved}
      />
    </div>
  );
}

/**
 * The subscription's state in one line.
 *
 * Nothing showed this anywhere before, so a card that had failed or a
 * subscription already cancelled was invisible until the features vanished.
 */
function BillingLine({ profile }: { profile: Profile | null }) {
  const notice = profile
    ? billingNotice({
        tier: profile.tier,
        status: profile.status,
        currentPeriodEnd: profile.currentPeriodEnd,
      })
    : null;
  if (!notice) return null;

  return (
    <p className={notice.tone === 'warn' ? 'pmenu__billing pmenu__billing--warn' : 'pmenu__billing'}>
      {notice.prefix}
      {notice.date ? ` ${formatBillingDate(notice.date)}` : ''}.
    </p>
  );
}

/** The support reference, with the one affordance it needs. */
function AccountId({ publicId, block = false }: { publicId: string | null; block?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (!publicId) return;
    try {
      await navigator.clipboard.writeText(publicId);
      setCopied(true);
    } catch {
      // Clipboard access can be refused outright; the value is on screen and
      // selectable either way, so this is not worth an error message.
      setCopied(false);
    }
  };

  // Label above rather than beside: the value must never wrap mid-identifier,
  // and inside a 280px menu a single row leaves it nowhere to go.
  return (
    <div className={block ? 'accountId accountId--block' : 'accountId'}>
      <span className="accountId__label">Account ID</span>
      <span className="accountId__row">
        <code className="accountId__value">{publicId ?? '—'}</code>
        <button
          type="button"
          className="btn btn--ghost accountId__copy"
          onClick={() => void copy()}
          disabled={!publicId}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
    </div>
  );
}

function ProfileDialog({
  section,
  onClose,
  user,
  profile,
  email,
  onSaved,
}: {
  section: Section | null;
  onClose: () => void;
  user: User;
  profile: Profile | null;
  email: string;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Section>('details');
  useEffect(() => {
    if (section) setTab(section);
  }, [section]);

  // No Subscription tab on an account that has never had one: an empty panel
  // explaining that there is nothing to manage is worse than no tab.
  const sections: Section[] = profile?.hasSubscription
    ? ['details', 'password', 'subscription']
    : ['details', 'password'];

  useEffect(() => {
    if (!sections.includes(tab)) setTab('details');
  }, [sections, tab]);

  return (
    <Dialog open={section !== null} onClose={onClose} title="Your account">
      <div className="segmented" role="tablist" aria-label="Account settings">
        {sections.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'segmented__btn is-on' : 'segmented__btn'}
            onClick={() => setTab(t)}
          >
            {t === 'details' ? 'Details' : t === 'password' ? 'Password' : 'Subscription'}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <DetailsForm profile={profile} email={email} userId={user.id} onSaved={onSaved} />
      ) : tab === 'password' ? (
        <PasswordForm user={user} />
      ) : (
        <SubscriptionPanel profile={profile} onChanged={onSaved} />
      )}
    </Dialog>
  );
}

/**
 * What the subscription is, and the one thing a subscriber may want to do to it.
 *
 * The amount comes from the last invoice Lemon Squeezy issued, not from our own
 * price list: it is the merchant of record, so it applies the buyer's local tax
 * and whatever price or discount they actually hold. Quoting our list price at
 * someone whose bill differs would be a small lie told confidently.
 */
function SubscriptionPanel({
  profile,
  onChanged,
}: {
  profile: Profile | null;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!profile) return <p className="notice">Loading your subscription…</p>;

  const cancelled = profile.status === 'cancelled';
  const end = profile.currentPeriodEnd ? new Date(profile.currentPeriodEnd) : null;
  const dated = end && Number.isFinite(end.getTime()) ? end : null;
  const amount = formatAmount(profile.amountCents, profile.currency);
  const card = formatCard(profile.cardBrand, profile.cardLastFour);

  const run = async (action: 'cancel' | 'resume') => {
    setError(null);
    setDone(null);
    setBusy(true);
    try {
      const result = await changeSubscription(action);
      const when = result.currentPeriodEnd ? new Date(result.currentPeriodEnd) : null;
      setDone(
        action === 'cancel'
          ? `Cancelled. You keep ${titleCase(profile.tier)} until ${when ? formatBillingDate(when) : 'the end of the period'}.`
          : 'Your subscription will renew as normal again.',
      );
      setConfirming(false);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your subscription.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <dl className="factlist">
        <div>
          <dt>Plan</dt>
          <dd>{planLabel(profile.planName, profile.tier)}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{statusLabel(profile.status)}</dd>
        </div>
        <div>
          <dt>{cancelled ? 'Access until' : 'Next renewal'}</dt>
          <dd>{dated ? formatBillingDate(dated) : 'Not scheduled'}</dd>
        </div>
        <div>
          <dt>Amount</dt>
          <dd>{amount ?? 'Not recorded'}</dd>
        </div>
        {card ? (
          <div>
            <dt>Card</dt>
            <dd>{card}</dd>
          </div>
        ) : null}
      </dl>

      <p className="muted" style={{ fontSize: 11, margin: 0 }}>
        {amount
          ? 'The amount is what Lemon Squeezy last charged, tax included. It is the merchant of record and issues the receipts.'
          : 'No invoice has been recorded against this subscription yet. Lemon Squeezy has the receipts either way — it is the merchant of record.'}
      </p>

      <button
        type="button"
        className="btn btn--ghost"
        disabled={busy}
        onClick={() => {
          setError(null);
          // Changing plan, the card on file and the invoices all live with the
          // merchant of record. The link is signed and short-lived, so it is
          // fetched at the moment it is wanted.
          billingPortalUrl()
            .then((url) => window.location.assign(url))
            .catch((err) =>
              setError(err instanceof Error ? err.message : 'Could not open the billing portal.'),
            );
        }}
      >
        Card and invoices at Lemon Squeezy
      </button>
      <span className="muted" style={{ fontSize: 11 }}>
        Opens Lemon Squeezy's customer portal, which needs the store to be activated.
        Changing plan does not — use Plans and billing for that.
      </span>

      {error ? <p className="notice notice--error">{error}</p> : null}
      {done ? <p className="notice notice--ok">{done}</p> : null}

      {cancelled ? (
        <>
          <p className="notice notice--warn" style={{ margin: 0 }}>
            This subscription will not renew.{' '}
            {dated
              ? `Your ${titleCase(profile.tier)} features stay until ${formatBillingDate(dated)}.`
              : ''}
          </p>
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run('resume')}>
            {busy ? 'Working…' : 'Resume subscription'}
          </button>
        </>
      ) : confirming ? (
        <>
          <p className="notice notice--warn" style={{ margin: 0 }}>
            <strong>Cancel this subscription?</strong> It stops renewing, and you keep every{' '}
            {titleCase(profile.tier)} feature until{' '}
            {dated ? formatBillingDate(dated) : 'the end of the period'}.
            You can resume any time before then.
          </p>
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void run('cancel')}>
              {busy ? 'Cancelling…' : 'Yes, cancel'}
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => setConfirming(false)}>
              Keep it
            </button>
          </div>
        </>
      ) : (
        <button type="button" className="btn btn--ghost" onClick={() => setConfirming(true)}>
          Cancel subscription
        </button>
      )}
    </div>
  );
}

function DetailsForm({
  profile,
  email,
  userId,
  onSaved,
}: {
  profile: Profile | null;
  email: string;
  userId: string;
  onSaved: () => void;
}) {
  const [fullName, setFullName] = useState(profile?.fullName ?? '');
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '');
  const [phone, setPhone] = useState(profile?.phone ?? '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // The row arrives after the first render, and again when the webhook writes
  // to it. Re-seed from it as long as nothing has been typed over.
  const loadedFrom = useRef<string | null>(null);
  useEffect(() => {
    if (!profile || loadedFrom.current === profile.id) return;
    loadedFrom.current = profile.id;
    setFullName(profile.fullName ?? '');
    setDisplayName(profile.displayName ?? '');
    setPhone(profile.phone ?? '');
    setCountry(profile.country ?? '');
  }, [profile]);

  // 249 codes sorted through Intl on every keystroke is waste; do it once.
  const options = useMemo(() => countryOptions(), []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    const problem =
      fullNameProblem(fullName) ??
      displayNameProblem(displayName) ??
      phoneProblem(phone) ??
      countryProblem(country);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    try {
      await saveProfile(userId, { fullName, displayName, phone, country });
      setSaved(true);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
      <div className="field">
        <label className="field__label" htmlFor="pf-full">
          Full name
        </label>
        <input
          id="pf-full"
          className="input"
          value={fullName}
          autoComplete="name"
          maxLength={80}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pf-display">
          Name
        </label>
        <input
          id="pf-display"
          className="input"
          value={displayName}
          autoComplete="nickname"
          maxLength={40}
          placeholder="What we should call you"
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <span className="muted" style={{ fontSize: 11 }}>
          Used in the header and anywhere the app addresses you.
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pf-email">
          Email
        </label>
        {/* readOnly rather than disabled: still selectable, still copyable, and
            still reachable by a screen reader. */}
        <input id="pf-email" className="input input--readonly" value={email} readOnly />
        <span className="muted" style={{ fontSize: 11 }}>
          This is how you sign in, so it is changed through sign-in, not here.
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pf-phone">
          Phone
        </label>
        <input
          id="pf-phone"
          className="input"
          type="tel"
          value={phone}
          autoComplete="tel"
          placeholder="+44 20 7946 0958"
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pf-country">
          Country
        </label>
        <select
          id="pf-country"
          className="select"
          value={country}
          autoComplete="country"
          onChange={(e) => setCountry(e.target.value)}
        >
          <option value="">Not set</option>
          {options.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <AccountId publicId={profile?.publicId ?? null} block />
        <span className="muted" style={{ fontSize: 11 }}>
          Your reference for support and chat. It is issued by us, never changes, and
          cannot be edited — which is what makes it worth quoting. It is not a
          password: showing it to someone grants them nothing.
        </span>
      </div>

      {error ? <p className="notice notice--error">{error}</p> : null}
      {saved ? <p className="notice notice--ok">Saved.</p> : null}

      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </form>
  );
}

function PasswordForm({ user }: { user: User }) {
  const existing = hasPassword(user);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);

    const problem = passwordProblem(next);
    if (problem) {
      setError(problem);
      return;
    }
    if (next !== confirm) {
      setError('The two new passwords do not match.');
      return;
    }

    setBusy(true);
    try {
      await setPassword(user, existing ? current : null, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
      {!existing ? (
        <p className="notice">
          You sign in with Google. Setting a password adds a second way in — Google keeps
          working either way.
        </p>
      ) : null}

      {existing ? (
        <div className="field">
          <label className="field__label" htmlFor="pw-current">
            Current password
          </label>
          <input
            id="pw-current"
            className="input"
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
      ) : null}

      <div className="field">
        <label className="field__label" htmlFor="pw-new">
          New password
        </label>
        <input
          id="pw-new"
          className="input"
          type="password"
          required
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <span className="muted" style={{ fontSize: 11 }}>
          At least 10 characters, mixed case, with a digit.
        </span>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="pw-confirm">
          Confirm new password
        </label>
        <input
          id="pw-confirm"
          className="input"
          type="password"
          required
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </div>

      {error ? <p className="notice notice--error">{error}</p> : null}
      {done ? (
        <p className="notice notice--ok">
          Password {existing ? 'changed' : 'set'}. Use it the next time you sign in.
        </p>
      ) : null}

      <button type="submit" className="btn btn--primary" disabled={busy}>
        {busy ? 'Working…' : existing ? 'Change password' : 'Set password'}
      </button>
    </form>
  );
}
