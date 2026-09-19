import { useEffect, useState } from 'react';
import { loadPrimary, loadSecondary } from './tokenize';

export interface EncoderState {
  /** The primary encoder has loaded and counting is live. */
  ready: boolean;
  /** The secondary encoder has loaded; the two legacy OpenAI counts are now exact. */
  secondary: boolean;
  error: string | null;
}

/**
 * Pulls the BPE rank tables in after first paint. The shell renders immediately;
 * the primary encoder arrives, then the secondary follows in the background so it
 * never delays a count anyone is waiting on.
 */
export function useEncoders(): EncoderState {
  const [state, setState] = useState<EncoderState>({ ready: false, secondary: false, error: null });

  useEffect(() => {
    let live = true;
    loadPrimary()
      .then(() => {
        if (!live) return;
        setState((s) => ({ ...s, ready: true }));
        return loadSecondary().then(() => {
          if (live) setState((s) => ({ ...s, secondary: true }));
        });
      })
      .catch((err: unknown) => {
        if (live) {
          setState((s) => ({
            ...s,
            error: err instanceof Error ? err.message : 'Failed to load the tokenizer.',
          }));
        }
      });
    return () => {
      live = false;
    };
  }, []);

  return state;
}
