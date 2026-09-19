import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { checkoutBase, supabase, variantId } from './supabase';
import {
  entitlementsFor,
  type Entitlements,
  type Feature,
  type Plan,
  type SubscriptionStatus,
  type Tier,
} from './entitlements';

export interface Profile {
  id: string;
  email: string;
  fullName: string | null;
  tier: Tier;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
}

export interface SubscriptionState {
  profile: Profile | null;
  entitlements: Entitlements;
  tier: Tier;
  /** Set when the tier comes from ?preview=, not from a real subscription. */
  preview: Tier | null;
  isPro: boolean;
  isTeam: boolean;
  loading: boolean;
  error: string | null;
  can: (feature: Feature) => boolean;
  refresh: () => Promise<void>;
  openCheckout: (plan: Plan, period: 'monthly' | 'annual') => void;
}

/**
 * The signed-in user's plan and what it unlocks.
 *
 * The tier is read from the `profiles` row, which only the Lemon Squeezy webhook
 * writes (through the service role). A client cannot promote itself: the RLS
 * policy grants users SELECT on their own profile and UPDATE on their display
 * name only. What this hook returns is therefore a mirror of billing state, not a
 * claim the client can forge - and the database enforces the same limits again on
 * every write.
 */
/**
 * A local preview tier, set with ?preview=pro or ?preview=team.
 *
 * This exists so the product can be demonstrated and reviewed without live
 * billing, and it is deliberately not hidden: the banner it raises says plainly
 * that no entitlement has been granted. It is safe to ship because it cannot
 * grant anything real - every paid feature here computes in the browser, so the
 * gate was always a purchasing prompt rather than a lock, and the limits that do
 * matter (the saved-estimate cap, the tier itself) are enforced by Postgres RLS
 * against the signed-in user's actual profile row, which this does not touch.
 */
export function previewTier(): Tier | null {
  try {
    const v = new URLSearchParams(window.location.search).get('preview');
    return v === 'pro' || v === 'team' ? v : null;
  } catch {
    return null;
  }
}

export function useSubscription(user: User | null): SubscriptionState {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, full_name, tier, subscription_status, current_period_end')
      .eq('id', user.id)
      .maybeSingle();

    if (err) {
      setError(err.message);
      setProfile(null);
    } else if (data) {
      setProfile({
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        tier: data.tier,
        status: data.subscription_status,
        currentPeriodEnd: data.current_period_end,
      });
    } else {
      // The row is created by an auth trigger; a brief gap right after sign-up is
      // expected rather than an error. Treat it as the free tier until it lands.
      setProfile(null);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Billing state changes out of band, when the webhook writes the row. Listening
  // to it means the UI unlocks on return from checkout without a manual reload.
  useEffect(() => {
    const client = supabase;
    if (!client || !user) return;
    const channel = client
      .channel(`profile:${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void client.removeChannel(channel);
    };
  }, [user, load]);

  const preview = previewTier();
  const tier: Tier = preview ?? profile?.tier ?? 'free';
  const entitlements = entitlementsFor(tier);

  const openCheckout = useCallback(
    (plan: Plan, period: 'monthly' | 'annual') => {
      const envKey = period === 'annual' ? plan.variantEnv.annual : plan.variantEnv.monthly;
      const variant = variantId(envKey);
      if (!checkoutBase || !variant) {
        setError(
          'Checkout is not configured for this deployment. Set VITE_LEMON_CHECKOUT_URL and the plan variant ids.',
        );
        return;
      }
      const url = new URL(`${checkoutBase.replace(/\/$/, '')}/${variant}`);
      // custom[user_id] is what the webhook reads back to find the account to
      // upgrade; without it a completed payment cannot be matched to a user.
      if (profile?.id) url.searchParams.set('checkout[custom][user_id]', profile.id);
      if (profile?.email) url.searchParams.set('checkout[email]', profile.email);
      url.searchParams.set('embed', '0');
      window.open(url.toString(), '_blank', 'noopener,noreferrer');
    },
    [profile],
  );

  return {
    profile,
    entitlements,
    tier,
    preview,
    isPro: tier === 'pro' || tier === 'team',
    isTeam: tier === 'team',
    loading,
    error,
    can: (feature: Feature) => entitlements.features[feature],
    refresh: load,
    openCheckout,
  };
}
