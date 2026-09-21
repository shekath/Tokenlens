import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { checkoutBase, supabase, variantId } from './supabase';
import { effectiveTier } from './billing';
import { checkoutTarget, openCheckoutWindow } from './checkout';
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
  /** The account reference shown to the user and quoted by support. */
  publicId: string;
  email: string;
  fullName: string | null;
  displayName: string | null;
  phone: string | null;
  /** ISO 3166-1 alpha-2, or null. */
  country: string | null;
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
  /**
   * Returns false when no checkout could be opened, so the caller can leave
   * the pricing dialog up instead of closing it over a failure.
   */
  openCheckout: (plan: Plan, period: 'monthly' | 'annual') => boolean;
  /** Why the last checkout attempt failed, or null. */
  checkoutError: string | null;
  dismissCheckoutError: () => void;
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
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !user) {
      setProfile(null);
      return;
    }
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('profiles')
      .select(
        'id, public_id, email, full_name, display_name, phone, country, tier, subscription_status, current_period_end',
      )
      .eq('id', user.id)
      .maybeSingle();

    if (err) {
      setError(err.message);
      setProfile(null);
    } else if (data) {
      setProfile({
        id: data.id,
        publicId: data.public_id,
        email: data.email,
        fullName: data.full_name,
        displayName: data.display_name,
        phone: data.phone,
        country: data.country,
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
  // effectiveTier, not profile.tier: a cancelled subscription past its paid
  // period is already free as far as Postgres is concerned, and offering a
  // feature the database will refuse is worse than not offering it.
  const tier: Tier = preview ?? effectiveTier(profile);
  const entitlements = entitlementsFor(tier);

  const openCheckout = useCallback(
    (plan: Plan, period: 'monthly' | 'annual'): boolean => {
      const target = checkoutTarget({
        plan,
        period,
        base: checkoutBase,
        variantFor: variantId,
        profile,
      });

      if (!target.ok) {
        setCheckoutError(target.message);
        return false;
      }

      setCheckoutError(null);
      openCheckoutWindow(target.url);
      return true;
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
    checkoutError,
    dismissCheckoutError: () => setCheckoutError(null),
  };
}
