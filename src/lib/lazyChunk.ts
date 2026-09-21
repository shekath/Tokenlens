/**
 * Loading a code-split tab, and surviving a stale one.
 *
 * The paid tabs are dynamic imports, so the browser fetches their chunk when
 * the tab is first opened. Every deploy gives those chunks new content hashes,
 * and a browser holding the previous index.html asks for files that no longer
 * exist. The import rejects, React unwinds, and with no boundary above it the
 * whole app disappears - a blank page, on the features someone has just paid
 * for, with nothing in the UI to say what happened.
 *
 * Two answers, because they cover different failures: retry once for a blip,
 * then reload the page, which is the only thing that can fix a stale document.
 */

const RELOAD_FLAG = 'tokenticks.chunkReload.';

/** Browsers word this differently; all of them mean "that file is not there". */
export function looksStale(err: unknown): boolean {
  const text = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|error loading dynamic|ChunkLoadError|Failed to fetch/i.test(
    text,
  );
}

/**
 * One reload per chunk, for the life of the tab.
 *
 * Per chunk, because a reload fixes a stale document and a second failure for
 * the same chunk means reloading is not the answer - that one belongs in front
 * of the user. And not cleared on startup: the first version did clear it
 * there, reasoning that a running app has put the reload behind it. It has
 * not. The failure recurs the moment the tab is clicked again, so clearing the
 * flag simply re-armed the reload, and every click bounced the page instead of
 * ever showing what was wrong.
 *
 * sessionStorage, so it dies with the tab and a genuinely new session can try
 * again.
 */
function mayReload(name: string): boolean {
  const key = RELOAD_FLAG + name;
  try {
    if (sessionStorage.getItem(key)) return false;
    sessionStorage.setItem(key, String(Date.now()));
    return true;
  } catch {
    // Private mode, blocked storage: without somewhere to record the attempt
    // there is no way to bound it, so do not start.
    return false;
  }
}

export function retryImport<T>(load: () => Promise<T>, name: string): Promise<T> {
  return load().catch(async () => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      return await load();
    } catch (second) {
      if (looksStale(second) && mayReload(name)) {
        window.location.reload();
        // Never settles: the document is going away, and resolving either way
        // would flash an error the user has no time to read.
        return new Promise<T>(() => {});
      }
      throw new Error(
        `The ${name} tab could not be loaded. This usually means the app was updated ` +
          'while the page was open — reloading will fix it.',
        { cause: second },
      );
    }
  });
}
