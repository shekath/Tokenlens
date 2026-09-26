/**
 * `?model=<id>` on the app's address preselects that model - the static model
 * pricing pages (scripts/modelPages.ts) link in this way. Unknown ids are
 * ignored, and the parameter is removed once read so a reload or a shared
 * address does not keep overriding the person's own choice.
 */
export function modelFromSearch(search: string, known: (id: string) => boolean): string | null {
  const id = new URLSearchParams(search).get('model');
  return id && known(id) ? id : null;
}

/** The same address without the `model` parameter (hash kept). */
export function withoutModelParam(href: string): string {
  const u = new URL(href);
  u.searchParams.delete('model');
  return u.pathname + u.search + u.hash;
}
