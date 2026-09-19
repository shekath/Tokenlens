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
}: {
  open: boolean;
  onClose: () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
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
