import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { Dialog } from './Dialog';
import { countryOptions } from '../lib/countries';
import { hasPassword, saveProfile, setPassword } from '../lib/profile';
import {
  countryProblem,
  displayNameProblem,
  fullNameProblem,
  greetingName,
  initialsOf,
  phoneProblem,
} from '../lib/profileFields';
import { passwordProblem } from '../lib/auth';
import type { Profile } from '../lib/subscription';
import type { Tier } from '../lib/entitlements';

type Section = 'details' | 'password';

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
  const trigger = useRef<HTMLButtonElement>(null);

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
        <div className="pmenu__panel" role="menu" aria-label="Account">
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

          <div className="pmenu__sep" role="separator" />

          <button type="button" role="menuitem" className="pmenu__item" onClick={() => openSection('details')}>
            Profile details
          </button>
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

  return (
    <Dialog open={section !== null} onClose={onClose} title="Your account">
      <div className="segmented" role="tablist" aria-label="Account settings">
        {(['details', 'password'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'segmented__btn is-on' : 'segmented__btn'}
            onClick={() => setTab(t)}
          >
            {t === 'details' ? 'Details' : 'Password'}
          </button>
        ))}
      </div>

      {tab === 'details' ? (
        <DetailsForm profile={profile} email={email} userId={user.id} onSaved={onSaved} />
      ) : (
        <PasswordForm user={user} />
      )}
    </Dialog>
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
