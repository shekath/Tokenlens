import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { REDIRECT_PARAMS, redirectProblem } from './authRedirect';

export interface AuthState {
  user: User | null;
  session: Session | null;
  /** False until the first session check resolves, so the UI does not flash. */
  ready: boolean;
  /**
   * Why a redirect-based sign-in (OAuth, magic link, email confirmation) came
   * back without a session. Null when nothing came back or it worked.
   */
  redirectError: string | null;
}

export interface AuthActions {
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  dismissRedirectError: () => void;
}

/**
 * Where an auth flow should return to.
 *
 * Supabase only honours a redirect that is on the project's allow list; anything
 * else is silently replaced by the Site URL, and the user lands wherever that
 * points (localhost, on a project whose URL configuration was never changed)
 * with the one-time code in the address bar of a page that cannot spend it.
 *
 * Built from BASE_URL rather than the current pathname so it is the same string
 * on every page of the app - /Tokenlens/ in a production build, / in dev. One
 * value to allow-list, not one per route the user happened to sign in from.
 */
function redirectTarget(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}

/**
 * Session state from Supabase Auth.
 *
 * With no backend configured this settles immediately at "ready, signed out" and
 * every action rejects with an explanatory error, so callers need no special case.
 */
export function useAuth(): AuthState & AuthActions {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    ready: !supabase,
    redirectError: null,
  });

  useEffect(() => {
    if (!supabase) return;
    let live = true;

    // Read before getSession(): the client strips `code` from the URL itself
    // once it has exchanged it, so afterwards there is no way to tell a return
    // from a plain page load.
    const params = new URLSearchParams(window.location.search);
    const returned = REDIRECT_PARAMS.some((k) => params.has(k));

    // getSession() waits on the client's own initialisation, which is what
    // consumes the code in the URL. So by the time this resolves the exchange
    // has either happened or failed, and a missing session is a real answer.
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setState({
        user: data.session?.user ?? null,
        session: data.session,
        ready: true,
        redirectError: returned ? redirectProblem(params, data.session) : null,
      });
      if (!returned) return;
      const url = new URL(window.location.href);
      for (const key of REDIRECT_PARAMS) url.searchParams.delete(key);
      window.history.replaceState({}, '', url.toString());
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      setState((prev) => ({
        user: session?.user ?? null,
        session,
        ready: true,
        redirectError: session ? null : prev.redirectError,
      }));
    });

    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const guard = () => {
    if (!supabase) {
      throw new Error('Accounts are unavailable: this deployment has no Supabase backend configured.');
    }
    return supabase;
  };

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    const client = guard();
    const { error } = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTarget(),
      },
    });
    if (error) throw error;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = guard();
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signInWithMagicLink = useCallback(async (email: string) => {
    const client = guard();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTarget() },
    });
    if (error) throw error;
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const client = guard();
    // This navigates away to Google and returns to redirectTarget(), where the
    // client picks the session out of the URL (detectSessionInUrl). Nothing
    // after this line runs on the success path.
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTarget(),
        // Ask for a refresh token and let the user pick an account rather than
        // being silently signed in as whoever the browser saw last.
        queryParams: { access_type: 'offline', prompt: 'select_account' },
      },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const client = guard();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, []);

  const dismissRedirectError = useCallback(() => {
    setState((prev) => (prev.redirectError ? { ...prev, redirectError: null } : prev));
  }, []);

  return {
    ...state,
    signUp,
    signIn,
    signInWithMagicLink,
    signInWithGoogle,
    signOut,
    dismissRedirectError,
  };
}

/** Password rules, enforced here so the form can explain them before submitting. */
export function passwordProblem(password: string): string | null {
  if (password.length < 10) return 'Use at least 10 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) {
    return 'Mix upper and lower case.';
  }
  if (!/\d/.test(password)) return 'Include at least one digit.';
  return null;
}

export function emailProblem(email: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return 'Enter a valid email address.';
  return null;
}
