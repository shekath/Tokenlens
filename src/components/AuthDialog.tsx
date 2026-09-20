import { useState } from 'react';
import { Dialog } from './Dialog';
import { emailProblem, passwordProblem } from '../lib/auth';
import { hasBackend, backendStatus } from '../lib/supabase';

type Mode = 'signin' | 'signup' | 'magic';

export function AuthDialog({
  open,
  onClose,
  signIn,
  signUp,
  signInWithMagicLink,
  signInWithGoogle,
}: {
  open: boolean;
  onClose: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reset = () => {
    setError(null);
    setNotice(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    reset();

    const emailErr = emailProblem(email);
    if (emailErr) {
      setError(emailErr);
      return;
    }
    if (mode !== 'magic') {
      const pwErr = mode === 'signup' ? passwordProblem(password) : null;
      if (pwErr) {
        setError(pwErr);
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
        onClose();
      } else if (mode === 'signup') {
        await signUp(email, password, fullName);
        setNotice('Check your inbox to confirm the address, then sign in.');
      } else {
        await signInWithMagicLink(email);
        setNotice('Sign-in link sent. Check your inbox.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, string> = {
    signin: 'Sign in',
    signup: 'Create an account',
    magic: 'Email me a link',
  };

  return (
    <Dialog open={open} onClose={onClose} title={titles[mode]}>
      {!hasBackend ? (
        <p className="notice notice--warn">{backendStatus}</p>
      ) : (
        <>
          <button
            type="button"
            className="btn btn--oauth"
            disabled={busy}
            onClick={() => {
              reset();
              setBusy(true);
              // On success the browser navigates to Google, so this promise
              // never resolves here; only a failure to start needs handling.
              signInWithGoogle().catch((err) => {
                setBusy(false);
                setError(err instanceof Error ? err.message : 'Could not start Google sign-in.');
              });
            }}
          >
            <GoogleMark />
            Continue with Google
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="segmented" role="tablist" aria-label="Authentication mode">
            {(['signin', 'signup', 'magic'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={mode === m ? 'segmented__btn is-on' : 'segmented__btn'}
                onClick={() => {
                  setMode(m);
                  reset();
                }}
              >
                {m === 'signin' ? 'Sign in' : m === 'signup' ? 'Sign up' : 'Magic link'}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
            {mode === 'signup' ? (
              <div className="field">
                <label className="field__label" htmlFor="auth-name">
                  Name
                </label>
                <input
                  id="auth-name"
                  className="input"
                  value={fullName}
                  autoComplete="name"
                  onChange={(e) => setFullName(e.target.value)}
                />
              </div>
            ) : null}

            <div className="field">
              <label className="field__label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className="input"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {mode !== 'magic' ? (
              <div className="field">
                <label className="field__label" htmlFor="auth-password">
                  Password
                </label>
                <input
                  id="auth-password"
                  className="input"
                  type="password"
                  required
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'signup' ? (
                  <span className="muted" style={{ fontSize: 11 }}>
                    At least 10 characters, mixed case, with a digit.
                  </span>
                ) : null}
              </div>
            ) : null}

            {error ? <p className="notice notice--error">{error}</p> : null}
            {notice ? <p className="notice notice--ok">{notice}</p> : null}

            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? 'Working…' : titles[mode]}
            </button>

            <p className="muted" style={{ fontSize: 11, margin: 0 }}>
              Your prompts are never uploaded. An account stores saved estimates — token
              counts and costs, never the prompt text.
            </p>
          </form>
        </>
      )}
    </Dialog>
  );
}

/** Google's four-colour mark, as their branding guidelines require. */
function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.96 10.71a5.41 5.41 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}
