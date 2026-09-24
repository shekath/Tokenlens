/**
 * Which plan the CLI runs on.
 *
 * The rule this file exists to keep: a licence problem never fails a build.
 * A cost tool that turns someone's CI red because our backend blinked, their
 * runner had no egress, or a key was mistyped would be uninstalled the same
 * afternoon. Every failure here degrades to free-tier features with a warning
 * on stderr, and the exit code is decided only by the checks themselves.
 *
 * The order of preference:
 *   1. a cached answer for this key under FRESH_MS old - no network at all;
 *   2. the licence server;
 *   3. if the server cannot be reached, a cached answer under GRACE_MS old;
 *   4. free.
 * A key the server positively rejects (unknown or revoked) is free at once, and
 * its cache is cleared: the grace period covers outages, not revocations.
 *
 * Dependencies are injected so the whole decision table is tested without a
 * network, a clock or a filesystem.
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { Tier } from '../../src/lib/entitlements.ts';

export const FRESH_MS = 12 * 60 * 60 * 1000;
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const KEY_SHAPE = /^tt_[0-9a-f]{64}$/;

export type LicenceSource = 'none' | 'online' | 'cache' | 'grace' | 'offline' | 'invalid' | 'unconfigured';

export interface Licence {
  tier: Tier;
  source: LicenceSource;
  publicId: string | null;
  /** Shown on stderr when set. Never a reason to fail. */
  warning: string | null;
}

export interface CacheEntry {
  /** SHA-256 of the key: the cache never holds the key itself. */
  keyHash: string;
  tier: Tier;
  publicId: string | null;
  checkedAt: number;
}

export interface LicenceDeps {
  now(): number;
  hash(key: string): string;
  readCache(): CacheEntry | null;
  writeCache(entry: CacheEntry): void;
  clearCache(): void;
  /** Resolves null for a key the server does not recognise; throws when it cannot be asked. */
  check(key: string): Promise<{ tier: Tier; publicId: string | null } | null>;
  /** False when this build has no licence server configured. */
  configured: boolean;
}

const TIERS: Tier[] = ['free', 'pro', 'team'];

function ago(ms: number): string {
  const h = Math.round(ms / 3_600_000);
  if (h < 1) return 'under an hour ago';
  if (h < 48) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.round(h / 24)} days ago`;
}

export async function resolveLicence(key: string | undefined, deps: LicenceDeps): Promise<Licence> {
  const free = (source: LicenceSource, warning: string | null): Licence => ({
    tier: 'free',
    source,
    publicId: null,
    warning,
  });

  const k = key?.trim();
  if (!k) return free('none', null);
  if (!KEY_SHAPE.test(k)) {
    return free('invalid', 'TOKENTICKS_KEY is not a TokenTicks key (expected tt_ and 64 hex characters). Running with free features.');
  }

  const now = deps.now();
  const hash = deps.hash(k);
  const cached = deps.readCache();
  const mine = cached && cached.keyHash === hash && TIERS.includes(cached.tier) ? cached : null;
  const age = mine ? now - mine.checkedAt : Number.POSITIVE_INFINITY;

  if (mine && age >= 0 && age < FRESH_MS) {
    return { tier: mine.tier, source: 'cache', publicId: mine.publicId, warning: null };
  }

  const fallback = (source: 'offline' | 'unconfigured', why: string): Licence => {
    if (mine && age >= 0 && age < GRACE_MS) {
      return {
        tier: mine.tier,
        source: 'grace',
        publicId: mine.publicId,
        warning: `${why} Using the ${mine.tier} plan confirmed ${ago(age)}.`,
      };
    }
    return free(source, `${why} Running with free features; nothing fails because of this.`);
  };

  if (!deps.configured) {
    return fallback('unconfigured', 'This build of tokenticks has no licence server configured.');
  }

  let answer: Awaited<ReturnType<LicenceDeps['check']>>;
  try {
    answer = await deps.check(k);
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    return fallback('offline', `Could not reach the TokenTicks licence server${detail}.`);
  }

  if (answer === null) {
    deps.clearCache();
    return free('invalid', 'TOKENTICKS_KEY was not recognised or has been revoked. Running with free features.');
  }
  if (!TIERS.includes(answer.tier)) {
    return fallback('offline', 'The licence server gave an answer this version does not understand.');
  }

  deps.writeCache({ keyHash: hash, tier: answer.tier, publicId: answer.publicId, checkedAt: now });
  return { tier: answer.tier, source: 'online', publicId: answer.publicId, warning: null };
}

/* ------------------------------------------------------- node adapters -- */


export function cacheDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TOKENTICKS_CACHE_DIR) return env.TOKENTICKS_CACHE_DIR;
  const base = env.XDG_CACHE_HOME || join(homedir(), '.cache');
  return join(base, 'tokenticks');
}

export function nodeDeps(server: { url: string; key: string } | null, dir: string, timeoutMs = 4_000): LicenceDeps {
  const file = join(dir, 'licence.json');
  return {
    configured: server !== null,
    now: () => Date.now(),
    hash: (key) => createHash('sha256').update(key, 'utf8').digest('hex'),
    readCache: () => {
      try {
        const v = JSON.parse(readFileSync(file, 'utf8')) as CacheEntry;
        return typeof v.keyHash === 'string' && typeof v.checkedAt === 'number' ? v : null;
      } catch {
        return null;
      }
    },
    writeCache: (entry) => {
      try {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        writeFileSync(file, JSON.stringify(entry), { mode: 0o600 });
      } catch {
        // A read-only home directory costs a network call next time, nothing more.
      }
    },
    clearCache: () => {
      try {
        rmSync(file, { force: true });
      } catch {
        /* as above */
      }
    },
    check: async (key) => {
      if (!server) throw new Error('no licence server');
      const res = await fetch(`${server.url}/rest/v1/rpc/check_cli_key`, {
        method: 'POST',
        headers: {
          apikey: server.key,
          Authorization: `Bearer ${server.key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ p_key: key }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = (await res.json()) as Array<{ tier: Tier; public_id: string | null }>;
      const row = Array.isArray(rows) ? rows[0] : undefined;
      return row ? { tier: row.tier, publicId: row.public_id ?? null } : null;
    },
  };
}
