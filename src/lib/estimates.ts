/**
 * Saved estimates.
 *
 * What is stored is deliberately narrow. The prompt itself is never persisted -
 * only its derived numbers and, optionally, a 280-character preview so a saved
 * row is recognisable in a list. That keeps the product's "your prompt stays in
 * your browser" claim true even for signed-in users, and it means a shared link
 * cannot leak a customer's prompt.
 */

import { supabase } from './supabase';

export interface SavedEstimate {
  id: string;
  projectTitle: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  promptPreview: string | null;
  promptMetadata: Record<string, unknown>;
  isPublic: boolean;
  shareSlug: string | null;
  createdAt: string;
}

export interface NewEstimate {
  projectTitle: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  promptPreview: string | null;
  promptMetadata: Record<string, unknown>;
}

/** Postgres error raised when the free-tier cap policy rejects an insert. */
const RLS_VIOLATION = '42501';

export class SaveLimitError extends Error {
  constructor() {
    super('You have reached the saved-estimate limit for your plan.');
    this.name = 'SaveLimitError';
  }
}

export async function listEstimates(userId: string): Promise<SavedEstimate[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('saved_estimates')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

export async function saveEstimate(userId: string, e: NewEstimate): Promise<SavedEstimate> {
  if (!supabase) throw new Error('No backend configured.');
  const { data, error } = await supabase
    .from('saved_estimates')
    .insert({
      user_id: userId,
      project_title: e.projectTitle,
      model_id: e.modelId,
      input_tokens: Math.round(e.inputTokens),
      output_tokens: Math.round(e.outputTokens),
      cached_tokens: Math.round(e.cachedTokens),
      estimated_cost_usd: e.estimatedCostUsd,
      prompt_metadata: e.promptMetadata,
      prompt_preview: e.promptPreview ? e.promptPreview.slice(0, 280) : null,
      is_public: false,
    })
    .select('*')
    .single();

  if (error) {
    // The cap is enforced by an RLS policy, so hitting it surfaces as a generic
    // permission error. Translate it into something the UI can act on.
    if ((error as { code?: string }).code === RLS_VIOLATION) throw new SaveLimitError();
    throw error;
  }
  return fromRow(data);
}

export async function deleteEstimate(id: string): Promise<void> {
  if (!supabase) throw new Error('No backend configured.');
  const { error } = await supabase.from('saved_estimates').delete().eq('id', id);
  if (error) throw error;
}

/** Toggling this mints or clears the share slug via a database trigger. */
export async function setPublic(id: string, isPublic: boolean): Promise<SavedEstimate> {
  if (!supabase) throw new Error('No backend configured.');
  const { data, error } = await supabase
    .from('saved_estimates')
    .update({ is_public: isPublic })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return fromRow(data);
}

function fromRow(row: {
  id: string;
  project_title: string;
  model_id: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens: number;
  estimated_cost_usd: number;
  prompt_preview: string | null;
  prompt_metadata: Record<string, unknown>;
  is_public: boolean;
  share_slug: string | null;
  created_at: string;
}): SavedEstimate {
  return {
    id: row.id,
    projectTitle: row.project_title,
    modelId: row.model_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    promptPreview: row.prompt_preview,
    promptMetadata: row.prompt_metadata,
    isPublic: row.is_public,
    shareSlug: row.share_slug,
    createdAt: row.created_at,
  };
}

export function shareUrl(slug: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/shared/${slug}`;
}

export interface SharedEstimate {
  shareSlug: string;
  projectTitle: string;
  modelId: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
}

/**
 * Fetches one shared estimate by slug.
 *
 * Goes through a lookup function rather than selecting the view directly: the
 * view is not readable by anon, so holding the link is the only way to read a
 * row and shared estimates cannot be enumerated.
 */
export async function fetchShared(slug: string): Promise<SharedEstimate | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('get_shared_estimate', { slug });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  return {
    shareSlug: row.share_slug,
    projectTitle: row.project_title,
    modelId: row.model_id,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedTokens: row.cached_tokens,
    estimatedCostUsd: Number(row.estimated_cost_usd),
    createdAt: row.created_at,
  };
}
