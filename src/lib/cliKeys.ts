/**
 * Licence keys for the tokenticks CLI and MCP server.
 *
 * A key exists in plain text exactly once: in the result of create_cli_key,
 * which the UI shows until the dialog closes. The table holds a SHA-256 and a
 * six-character prefix for recognising a key in a list or a CI log.
 */

import { supabase } from './supabase';

export interface CliKey {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export const KEY_LABEL_MAX = 60;
export const MAX_ACTIVE_KEYS = 10;

export async function listKeys(): Promise<CliKey[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('cli_keys')
    .select('id, label, key_prefix, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    label: r.label,
    prefix: r.key_prefix,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    revokedAt: r.revoked_at,
  }));
}

/** Postgres codes the functions raise, translated for a person. */
function explain(error: { code?: string; message: string }): Error {
  if (error.code === '54000') return new Error(`${MAX_ACTIVE_KEYS} active keys is the limit. Revoke one you no longer use first.`);
  if (error.code === '23514') return new Error('Give the key a name, up to 60 characters.');
  return new Error(error.message);
}

/** Returns the new key. It cannot be retrieved again. */
export async function createKey(label: string): Promise<string> {
  if (!supabase) throw new Error('No backend configured.');
  const { data, error } = await supabase.rpc('create_cli_key', { p_label: label.trim() });
  if (error) throw explain(error);
  return data;
}

export async function revokeKey(id: string): Promise<boolean> {
  if (!supabase) throw new Error('No backend configured.');
  const { data, error } = await supabase.rpc('revoke_cli_key', { p_id: id });
  if (error) throw explain(error);
  return data;
}
