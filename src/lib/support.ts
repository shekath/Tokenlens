/**
 * The support mailto, and the context block that makes a ticket answerable.
 *
 * Pure, so the formatting can be tested without a browser. It matters more
 * than it looks: the difference between a ticket you can act on and one that
 * costs three emails is whether it arrives carrying the account id, the plan
 * and the build. People do not know those things, and asking is a round trip
 * that loses a day.
 *
 * Support is deliberately NOT gated by tier. A free user with a problem is a
 * prospect, and a product that will not talk to you until you pay reads badly.
 * The plan goes in the subject as a tag instead, so a mail rule or a helpdesk
 * view can put paying customers at the top of the queue - "priority support"
 * means answered first, not reachable only if you pay.
 */

import type { Tier } from './entitlements';

export interface SupportContext {
  /** The account's public id - what support quotes back. Null when signed out. */
  accountId: string | null;
  tier: Tier | null;
  status: string | null;
  /** The signed-in address, so a reply reaches them even if they mail from another. */
  email: string | null;
  /** Commit the bundle was built from, for "works on my machine" tickets. */
  build: string;
  /** Anything the browser can say about itself that narrows a rendering bug. */
  agent: string;
  viewport: string;
}

/** Label used in the subject tag and the context block. */
function planLabel(tier: Tier | null, status: string | null): string {
  if (!tier) return 'signed out';
  return status && status !== 'active' ? `${tier} · ${status}` : tier;
}

/**
 * The lines appended under the message.
 *
 * Fenced off with a rule and a heading so the person can see exactly what is
 * being sent before they press send. Nothing here is hidden from them, and
 * nothing is collected that they could not read off their own account page.
 */
export function contextBlock(ctx: SupportContext): string {
  const rows: Array<[string, string]> = [
    ['Account', ctx.accountId ?? '(signed out)'],
    ['Plan', planLabel(ctx.tier, ctx.status)],
    ['Email', ctx.email ?? '(not signed in)'],
    ['Build', ctx.build],
    ['Browser', ctx.agent],
    ['Viewport', ctx.viewport],
  ];
  const width = Math.max(...rows.map(([k]) => k.length));
  return [
    '',
    '',
    '— sent from TokenTicks, so support can see your account —',
    ...rows.map(([k, v]) => `${k.padEnd(width)}  ${v}`),
  ].join('\n');
}

/**
 * The subject line.
 *
 * The plan tag is first and in brackets so it is filterable: a Zoho view or a
 * Gmail rule matching "[team]" needs no integration to sort the queue. The
 * account id is at the end where it does not crowd the summary but is still
 * greppable across a mailbox.
 */
export function supportSubject(ctx: SupportContext, topic: string): string {
  const tag = ctx.tier ?? 'free';
  const what = topic.trim() || 'Support request';
  return ctx.accountId
    ? `[TokenTicks][${tag}] ${what} (${ctx.accountId})`
    : `[TokenTicks][${tag}] ${what}`;
}

/**
 * The mailto: URL, or null when no support address was built in.
 *
 * Null rather than a broken link. A mailto with an empty recipient opens an
 * empty compose window, which looks like the app working and is not - the
 * caller hides the control instead.
 */
export function supportMailto(
  ctx: SupportContext,
  topic: string,
  /**
   * The support address. Passed in rather than read from import.meta.env here,
   * because this module is imported directly by the node test suite, which has
   * no Vite env - the same reason checkoutTarget takes its return URL.
   */
  to: string | undefined= VITE_SUPPORT_EMAIL
): string | null {
  const address = (to ?? '').trim();
  if (!address) return null;
  const params = new URLSearchParams({
    subject: supportSubject(ctx, topic),
    body: contextBlock(ctx),
  });
  // URLSearchParams encodes spaces as '+', which mail clients render literally
  // in a subject line. Percent-encoding is what mailto: wants.
  return `mailto:${address}?${params.toString().replace(/\+/g, '%20')}`;
}

/** What the browser can say about itself, gathered at the moment of asking. */
export function browserContext(win: Window = window): Pick<SupportContext, 'agent' | 'viewport'> {
  return {
    agent: win.navigator?.userAgent ?? 'unknown',
    viewport: `${win.innerWidth}×${win.innerHeight}`,
  };
}
