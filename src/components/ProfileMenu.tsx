import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Dialog } from './Dialog';
import { countryOptions } from '../lib/countries';
import {
  billingPortalUrl,
  changeSubscription,
  deleteAccount,
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
import { DELETE_PHRASE, deleteConfirmed } from '../lib/deleteAccount';
import { browserContext } from '../lib/support';
import {
  MESSAGE_MAX,
  listTickets,
  submitTicket,
  ticketProblem,
  type Ticket,
} from '../lib/tickets';
import { KEY_LABEL_MAX, createKey, listKeys, revokeKey, type CliKey } from '../lib/cliKeys';
import { ACCOUNT_EVENT, type AccountSection } from '../lib/accountEvents';
import type { Profile } from '../lib/subscription';
import { listPrice, type Tier } from '../lib/entitlements';

type Section = AccountSection;

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

  // Other pages (the Docs guide's "Open CLI & MCP keys") ask for a section by
  // event; see lib/accountEvents.ts.
  useEffect(() => {
    const onAsk = (e: Event) => {
      const want = (e as CustomEvent<AccountSection>).detail;
      if (want) openSection(want);
    };
    // Following a link to another page (the Keys panel links to the Docs
    // guide) should not leave the dialog open on top of it.
    const onRoute = () => setSection(null);
    window.addEventListener(ACCOUNT_EVENT, onAsk);
    window.addEventListener('hashchange', onRoute);
    return () => {
      window.removeEventListener(ACCOUNT_EVENT, onAsk);
      window.removeEventListener('hashchange', onRoute);
    };
  }, []);

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
          <button type="button" role="menuitem" className="pmenu__item" onClick={() => openSection('keys')}>
            CLI &amp; MCP keys
          </button>

          {/* An anchor, not a button: a mail client is a navigation, and this
              way the address is visible on hover and copyable on right-click
              for anyone whose machine has no mail client configured. */}
          {/* Signed in, so the in-app form is reachable and records the request
              where both sides can see it. The mailto stays in the footer for
              people who are not signed in - which includes anyone who cannot
              sign in, the one case a form behind sign-in cannot serve. */}
          <button
            type="button"
            role="menuitem"
            className="pmenu__item"
            onClick={() => openSection('support')}
          >
            Contact support
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

          {/* Last, behind its own rule, and the only item in the menu that is
              not reversible. Nothing here should sit next to Sign out by
              accident: the two are one careless click apart otherwise. */}
          <div className="pmenu__sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="pmenu__item pmenu__item--danger"
            onClick={() => openSection('delete')}
          >
            Delete account
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
  // 'delete' is always last: it is the one panel here that cannot be undone,
  // and the tab order is the only ranking a segmented control has.
  const sections: Section[] = profile?.hasSubscription
    ? ['details', 'password', 'subscription', 'keys', 'support', 'delete']
    : ['details', 'password', 'keys', 'support', 'delete'];

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
            {t === 'details'
              ? 'Details'
              : t === 'password'
                ? 'Password'
                : t === 'subscription'
                  ? 'Subscription'
                  : t === 'keys'
                    ? 'Keys'
                    : t === 'support'
                      ? 'Support'
                      : 'Delete'}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <DetailsForm profile={profile} email={email} userId={user.id} onSaved={onSaved} />
      ) : tab === 'password' ? (
        <PasswordForm user={user} />
      ) : tab === 'subscription' ? (
        <SubscriptionPanel profile={profile} onChanged={onSaved} />
      ) : tab === 'keys' ? (
        <KeysPanel tier={profile?.tier ?? 'free'} />
      ) : tab === 'support' ? (
        <SupportPanel profile={profile} email={email} />
      ) : (
        <DeletePanel profile={profile} email={email} />
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
  // Until an invoice arrives there is no charged amount to show. The published
  // price is the honest stand-in, as long as it is labelled as the published
  // price and not as what this account was charged.
  const listed = amount ? null : listPrice(profile.tier);
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
          <dd>
            {amount ?? listed ?? 'Not recorded'}
            {listed ? <span className="factlist__qualifier">list price</span> : null}
          </dd>
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
          : listed
            ? 'No invoice has reached us for this subscription yet, so this is the published price rather than what you were charged — tax, currency and any discount can move it. Your receipts are with Lemon Squeezy, the merchant of record, and the exact figure appears here after the next payment.'
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

/**
 * Deleting the account.
 *
 * Three things stand between a stray click and an irreversible delete, and
 * each does a different job: the panel is last, the consequences are spelled
 * out before the input rather than after it, and the button stays disabled
 * until the word is typed. A confirm() dialog would be one click - and people
 * dismiss those without reading by reflex.
 *
 * The subscription warning is not decoration. Deleting an account with a live
 * subscription is the case where getting this wrong costs real money, so the
 * panel says plainly that it will be cancelled, and the Edge Function cancels
 * it first and refuses to delete anything if that fails.
 */
function DeletePanel({ profile, email }: { profile: Profile | null; email: string }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const live = profile?.status === 'active' || profile?.status === 'trialing' || profile?.status === 'past_due';
  const ready = deleteConfirmed(typed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    setError(null);
    setBusy(true);
    try {
      await deleteAccount(typed.trim());
      // The account is gone, so there is no session left to refresh and
      // nothing on this page that still makes sense. A reload lands on the
      // signed-out dashboard, which is the truthful state.
      window.location.assign(import.meta.env.BASE_URL);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete your account.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
      <div className="danger">
        <p className="danger__title">Deleting your account is permanent</p>
        <p className="danger__text">
          This removes <b>{email}</b> and everything stored against it: your profile, your
          saved estimates and share links, and your subscription record. It cannot be undone,
          and the same email can sign up again afterwards only as a new, empty account.
        </p>
        {live ? (
          <p className="danger__text">
            <b>Your {titleCase(profile?.tier ?? 'paid')} subscription will be cancelled</b> at
            Lemon Squeezy first, so you are not charged again. If that cancellation fails,
            nothing is deleted — you would rather keep an account than keep a bill.
          </p>
        ) : null}
        <p className="danger__text">
          Your prompts were never uploaded, so there is nothing of them to delete. Invoices
          stay with Lemon Squeezy, the merchant of record.
        </p>
        <p className="danger__prompt">
          To confirm, type <code>{DELETE_PHRASE}</code> below.
        </p>
      </div>

      <div className="field">
        <label className="field__label" htmlFor="delete-confirm">
          Confirmation
        </label>
        <input
          id="delete-confirm"
          className="input"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={DELETE_PHRASE}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          aria-describedby="delete-help"
        />
        <span id="delete-help" className="muted" style={{ fontSize: 11 }}>
          The button stays disabled until this matches exactly.
        </span>
      </div>

      <button type="submit" className="btn btn--danger" disabled={!ready || busy}>
        {busy ? 'Deleting…' : 'Delete my account permanently'}
      </button>

      {error ? <p className="notice notice--error">{error}</p> : null}
    </form>
  );
}

/**
 * Raising a support request, and seeing the ones already raised.
 *
 * This exists because a mailto: does nothing at all on a machine with no mail
 * client configured - a Chromebook, a locked-down work laptop, anyone living
 * in webmail. The click appears to work and no message is ever sent, and
 * neither side finds out. A row in a table cannot fail that way, and the list
 * below it is the part a mailto can never offer: proof it was sent.
 *
 * The context block is shown, not hidden. Nothing is attached that the sender
 * could not read off their own account page, and showing it is the difference
 * between diagnostics and telemetry.
 */
function SupportPanel({ profile, email }: { profile: Profile | null; email: string }) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ quiet: boolean } | null>(null);
  const [past, setPast] = useState<Ticket[] | null>(null);

  useEffect(() => {
    let live = true;
    listTickets()
      .then((rows) => live && setPast(rows))
      // A failure to list past requests must not stop someone raising a new
      // one - that would turn a cosmetic problem into an unreachable support
      // channel.
      .catch(() => live && setPast([]));
    return () => {
      live = false;
    };
  }, [sent]);

  const context = { build: typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'unknown', ...browserContext() };
  const problem = ticketProblem(subject, message);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    try {
      const { notified } = await submitTicket({
        subject,
        message,
        tier: profile?.tier ?? 'free',
        publicId: profile?.publicId ?? '',
        context,
      });
      setSubject('');
      setMessage('');
      setSent({ quiet: !notified });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your request.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack" style={{ marginTop: 16 }}>
      {sent ? (
        <p className={sent.quiet ? 'notice' : 'notice notice--ok'}>
          {sent.quiet
            ? 'Recorded — but the notification did not go out, so chase us if it stays quiet. ' +
              'Your request is listed below either way.'
            : 'Sent. We reply by email, usually within a working day.'}
        </p>
      ) : null}

      <form onSubmit={submit} className="stack">
        <div className="field">
          <label className="field__label" htmlFor="ticket-subject">
            Subject
          </label>
          <input
            id="ticket-subject"
            className="input"
            value={subject}
            maxLength={200}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Batch upload fails"
          />
        </div>

        <div className="field">
          <label className="field__label" htmlFor="ticket-message">
            What happened
          </label>
          <textarea
            id="ticket-message"
            className="input"
            rows={5}
            maxLength={MESSAGE_MAX}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="What you did, what you expected, and what happened instead."
            style={{ resize: 'vertical', padding: '8px 9px', minHeight: 96 }}
          />
          <span className="muted" style={{ fontSize: 11 }}>
            {message.trim().length.toLocaleString()} / {MESSAGE_MAX.toLocaleString()}
          </span>
        </div>

        <details className="ticketcontext">
          <summary>What is sent with it</summary>
          <dl className="factlist" style={{ marginTop: 8 }}>
            <div>
              <dt>Account</dt>
              <dd>{profile?.publicId ?? '—'}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{profile?.tier ?? 'free'}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{email}</dd>
            </div>
            <div>
              <dt>Build</dt>
              <dd>{context.build}</dd>
            </div>
            <div>
              <dt>Viewport</dt>
              <dd>{context.viewport}</dd>
            </div>
          </dl>
          <p className="muted" style={{ fontSize: 11, margin: '8px 0 0' }}>
            Nothing here that is not already on your account page. Your prompts are not
            included — they never leave this browser.
          </p>
        </details>

        <button type="submit" className="btn" disabled={busy || problem !== null}>
          {busy ? 'Sending…' : 'Send request'}
        </button>

        {error ? <p className="notice notice--error">{error}</p> : null}
      </form>

      {past && past.length > 0 ? (
        <section className="stack" style={{ marginTop: 8 }}>
          <h3 className="card__title">Your requests</h3>
          <ul className="ticketlist">
            {past.map((t) => (
              <li key={t.id}>
                <span className="ticketlist__subject">{t.subject}</span>
                {/* Only shown once something has actually moved it off 'open'.
                    Nothing writes this column yet - the helpdesk is reached by
                    email and does not report back - so a badge on every row
                    would say "open" forever and mean nothing. No badge is the
                    honest rendering of "no update yet"; a badge appears the day
                    a status really is set. */}
                {t.status !== 'open' ? (
                  <span className={`ticketlist__status is-${t.status}`}>{t.status}</span>
                ) : null}
                <span className="ticketlist__date">{formatBillingDate(new Date(t.createdAt))}</span>
              </li>
            ))}
          </ul>
          <p className="muted" style={{ fontSize: 11, margin: 0 }}>
            We reply by email, to {email}. This list is what you have sent us.
          </p>
        </section>
      ) : null}
    </div>
  );
}

/**
 * Licence keys for the tokenticks CLI and MCP server.
 *
 * The one moment that needs care is creation: the key is shown once, here, and
 * cannot be recovered - only its hash is stored. So it stays on screen with a
 * copy button until the person dismisses it, rather than vanishing on the next
 * render, and the list below only ever shows the six-character prefix.
 */
function KeysPanel({ tier }: { tier: Tier }) {
  const [keys, setKeys] = useState<CliKey[] | null>(null);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ key: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    listKeys()
      .then((rows) => live && setKeys(rows))
      .catch((err: unknown) => {
        if (!live) return;
        setKeys([]);
        setError(err instanceof Error ? err.message : 'Could not load your keys.');
      });
    return () => {
      live = false;
    };
  }, [reload]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = label.trim();
    if (!name) {
      setError('Name the key after where it will live, e.g. "GitHub Actions" or "Laptop".');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const key = await createKey(name);
      setFresh({ key, label: name });
      setCopied(false);
      setLabel('');
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a key.');
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    setError(null);
    try {
      await revokeKey(id);
      setConfirming(null);
      setReload((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not revoke that key.');
    }
  };

  const active = keys?.filter((k) => !k.revokedAt) ?? [];
  const revoked = keys?.filter((k) => k.revokedAt) ?? [];
  const unlocks =
    tier === 'team'
      ? 'Trimmer and cache-order checks, your own rule levels, and pull-request cost diffs'
      : tier === 'pro'
        ? 'Trimmer and cache-order checks in CI and in your editor'
        : 'nothing beyond the free commands yet — upgrade to Pro or Team and the same key picks up the new plan';

  return (
    <div className="stack" style={{ marginTop: 16 }}>
      <p className="card__note" style={{ margin: 0 }}>
        The <code>tokenticks</code> command-line tool and MCP server run on your machine and
        never upload a prompt. A key tells them your plan (<b>{titleCase(tier)}</b>): it unlocks{' '}
        {unlocks}. Token counts and free-model pricing work without one.
      </p>

      {fresh ? (
        <div className="notice notice--ok keyreveal">
          <p style={{ margin: 0 }}>
            <b>{fresh.label}</b> — copy it now. This is the only time the key is shown; we store a
            hash, not the key.
          </p>
          <div className="keyreveal__row">
            <code className="keyreveal__key">{fresh.key}</code>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void navigator.clipboard.writeText(fresh.key).then(() => setCopied(true));
              }}
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="codeblock keyreveal__use">{`# CI: a repository secret named TOKENTICKS_KEY
# Terminal:
export TOKENTICKS_KEY=<the key>
npx tokenticks whoami
# Claude Code:
claude mcp add tokenticks -e TOKENTICKS_KEY=<the key> -- npx -y tokenticks mcp`}</pre>
          <button type="button" className="btn btn--ghost" onClick={() => setFresh(null)}>
            I have saved it
          </button>
        </div>
      ) : null}

      <form className="row keyform" onSubmit={create}>
        <label className="sr-only" htmlFor="key-label">
          Key name
        </label>
        <input
          id="key-label"
          className="input"
          value={label}
          maxLength={KEY_LABEL_MAX}
          placeholder="Where it will be used, e.g. GitHub Actions"
          onChange={(e) => setLabel(e.target.value)}
        />
        <button type="submit" className="btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {error ? <p className="notice notice--error">{error}</p> : null}

      {keys === null ? (
        <p className="muted">Loading your keys…</p>
      ) : active.length === 0 && revoked.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          No keys yet. One per place it runs — a CI secret, a laptop — so each can be revoked alone.
        </p>
      ) : (
        <ul className="keylist">
          {[...active, ...revoked].map((k) => (
            <li key={k.id} className={k.revokedAt ? 'is-revoked' : undefined}>
              <span className="keylist__label">{k.label}</span>
              <span className="keylist__detail">
                <code className="keylist__prefix">{k.prefix}…</code> ·{' '}
                {k.revokedAt
                  ? `revoked ${formatBillingDate(new Date(k.revokedAt))}`
                  : k.lastUsedAt
                    ? `last used ${formatBillingDate(new Date(k.lastUsedAt))}`
                    : `created ${formatBillingDate(new Date(k.createdAt))}, not used yet`}
              </span>
              {k.revokedAt ? null : confirming === k.id ? (
                <span className="row" style={{ gap: 6 }}>
                  <button type="button" className="btn btn--danger" onClick={() => void revoke(k.id)}>
                    Revoke
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => setConfirming(null)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button type="button" className="btn btn--ghost" onClick={() => setConfirming(k.id)}>
                  Revoke…
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ fontSize: 12, margin: 0 }}>
        New to the CLI?{' '}
        <a href="#/devtools">
          Read the setup guide
        </a>{' '}
        — commands, CI workflow and MCP config, ready to copy.
      </p>
      <p className="muted" style={{ fontSize: 11, margin: 0 }}>
        Revoking takes effect at the tool&apos;s next check (within 12 hours, or at once on a fresh
        CI runner). A revoked key falls back to the free plan; it never fails a build.
      </p>
    </div>
  );
}
