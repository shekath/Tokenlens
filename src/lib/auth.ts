import { useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthState {
  user: User | null;
  session: Session | null;
  /** False until the first session check resolves, so the UI does not flash. */
  ready: boolean;
}

export interface AuthActions {
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
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
  });

  useEffect(() => {
    if (!supabase) return;
    let live = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      setState({ user: data.session?.user ?? null, session: data.session, ready: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!live) return;
      setState({ user: session?.user ?? null, session, ready: true });
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
        emailRedirectTo: window.location.origin + window.location.pathname,
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
      options: { emailRedirectTo: window.location.origin + window.location.pathname },
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const client = guard();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, []);

  return { ...state, signUp, signIn, signInWithMagicLink, signOut };
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
