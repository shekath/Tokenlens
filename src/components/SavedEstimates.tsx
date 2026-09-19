import { useCallback, useEffect, useState } from 'react';
import {
  SaveLimitError,
  deleteEstimate,
  listEstimates,
  saveEstimate,
  setPublic,
  shareUrl,
  type NewEstimate,
  type SavedEstimate,
} from '../lib/estimates';
import { MODELS_BY_ID } from '../lib/models';
import { num, usd } from '../lib/format';
import { hasBackend } from '../lib/supabase';

export function SavedEstimates({
  userId,
  maxSaved,
  canShare,
  draft,
  onUpgrade,
  onSignIn,
}: {
  userId: string | null;
  maxSaved: number;
  canShare: boolean;
  draft: NewEstimate | null;
  onUpgrade: () => void;
  onSignIn: () => void;
}) {
  const [items, setItems] = useState<SavedEstimate[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [atLimit, setAtLimit] = useState(false);

  const reload = useCallback(async () => {
    if (!userId) {
      setItems([]);
      return;
    }
    try {
      setItems(await listEstimates(userId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load saved estimates.');
    }
  }, [userId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!hasBackend) {
    return (
      <div className="card">
        <div className="empty">
          Saving estimates needs a backend. This deployment has none configured, so the
          dashboard runs entirely in your browser.
        </div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="card">
        <div className="gate">
          <h4 className="gate__title">Sign in to save estimates</h4>
          <p className="gate__pitch">
            Keep a named record of a projection and come back to it. Token counts and costs
            are stored — never the prompt itself.
          </p>
          <button type="button" className="btn btn--primary" onClick={onSignIn}>
            Sign in or create an account
          </button>
        </div>
      </div>
    );
  }

  const full = Number.isFinite(maxSaved) && items.length >= maxSaved;

  const save = async () => {
    if (!draft || !userId) return;
    setBusy(true);
    setError(null);
    setAtLimit(false);
    try {
      await saveEstimate(userId, { ...draft, projectTitle: title.trim() || draft.projectTitle });
      setTitle('');
      await reload();
    } catch (err) {
      if (err instanceof SaveLimitError) setAtLimit(true);
      else setError(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Save the current estimate</h3>
          <div className="card__tools">
            <span className="muted" style={{ fontSize: 12 }}>
              {Number.isFinite(maxSaved) ? `${items.length} of ${maxSaved} used` : `${items.length} saved`}
            </span>
          </div>
        </div>
        <p className="card__note">
          Stores the model, token counts and cost — plus a short excerpt so you can
          recognise it. The prompt itself is never uploaded.
        </p>
        <div className="row">
          <input
            className="input"
            style={{ flex: '1 1 240px' }}
            placeholder={draft?.projectTitle ?? 'Analyse a prompt first'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!draft || full}
          />
          <button type="button" className="btn btn--primary" onClick={() => void save()} disabled={!draft || busy || full}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>

        {full || atLimit ? (
          <p className="notice notice--warn" style={{ marginTop: 12 }}>
            Your plan allows {maxSaved} saved estimates.{' '}
            <button type="button" className="btn btn--ghost" onClick={onUpgrade} style={{ minHeight: 0, padding: '0 4px' }}>
              Upgrade for unlimited
            </button>
            , or delete one below.
          </p>
        ) : null}
        {error ? (
          <p className="notice notice--error" style={{ marginTop: 12 }}>
            {error}
          </p>
        ) : null}
      </section>

      <section className="card">
        <div className="card__head">
          <h3 className="card__title">Your estimates</h3>
        </div>
        {items.length === 0 ? (
          <div className="empty">Nothing saved yet.</div>
        ) : (
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Model</th>
                  <th>Input</th>
                  <th>Output</th>
                  <th>Cost</th>
                  <th>Saved</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {items.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <span className="cell-name">
                        {e.projectTitle}
                        {e.promptPreview ? (
                          <span className="cell-vendor" title={e.promptPreview}>
                            {e.promptPreview.slice(0, 32)}…
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td>{MODELS_BY_ID[e.modelId]?.label ?? e.modelId}</td>
                    <td>{num(e.inputTokens)}</td>
                    <td>{num(e.outputTokens)}</td>
                    <td>{usd(e.estimatedCostUsd)}</td>
                    <td>{new Date(e.createdAt).toISOString().slice(0, 10)}</td>
                    <td>
                      <span className="row" style={{ gap: 4, justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                        {canShare ? (
                          <button
                            type="button"
                            className="btn btn--ghost"
                            title={e.isPublic ? 'Copy share link' : 'Create a share link'}
                            onClick={() => {
                              void (async () => {
                                try {
                                  const updated = e.isPublic ? e : await setPublic(e.id, true);
                                  if (updated.shareSlug) {
                                    await navigator.clipboard.writeText(shareUrl(updated.shareSlug));
                                  }
                                  await reload();
                                } catch (err) {
                                  setError(err instanceof Error ? err.message : 'Could not share.');
                                }
                              })();
                            }}
                          >
                            {e.isPublic ? 'Copy link' : 'Share'}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            void (async () => {
                              try {
                                await deleteEstimate(e.id);
                                await reload();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : 'Could not delete.');
                              }
                            })();
                          }}
                        >
                          Delete
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {canShare ? (
          <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
            A share link exposes the project title, model and cost only. The excerpt, your
            account and the prompt metadata stay private.
          </p>
        ) : null}
      </section>
    </>
  );
}
