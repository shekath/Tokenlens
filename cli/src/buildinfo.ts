/**
 * Values the bundler stamps in (see cli/build.mjs), with fallbacks so the
 * sources also run unbundled under node's test runner.
 *
 * The Supabase URL and publishable key are public by design - they ship in the
 * web app's bundle too - but, as for the web app, they are supplied by the
 * build rather than committed. A build without them runs every command on the
 * free tier and says so.
 */

declare const __TT_VERSION__: string | undefined;
declare const __TT_SUPABASE_URL__: string | undefined;
declare const __TT_SUPABASE_KEY__: string | undefined;

export const VERSION: string = typeof __TT_VERSION__ === 'string' ? __TT_VERSION__ : '0.0.0-dev';

/** Environment overrides exist for testing and for self-hosted backends. */
export function licenceServer(env: NodeJS.ProcessEnv = process.env): { url: string; key: string } | null {
  const url = env.TOKENTICKS_API_URL ?? (typeof __TT_SUPABASE_URL__ === 'string' ? __TT_SUPABASE_URL__ : '');
  const key = env.TOKENTICKS_API_KEY ?? (typeof __TT_SUPABASE_KEY__ === 'string' ? __TT_SUPABASE_KEY__ : '');
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
}

/** Where keys are created and plans are bought. Public, and the same for every build. */
export const APP_URL = 'https://shekath.github.io/Tokenlens/';
