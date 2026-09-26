import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { MODEL_DATA, PRICING_AS_OF } from './src/lib/models.data.ts';
import { modelPath, renderIndex, renderModelPage, renderSitemap } from './scripts/modelPages.ts';

/**
 * Writes the static model pricing pages (/models/, /models/<id>/) and
 * sitemap.xml into the build. See scripts/modelPages.ts for why they exist.
 */
function modelPages(): Plugin {
  return {
    name: 'tokenticks-model-pages',
    apply: 'build',
    generateBundle() {
      const emit = (fileName: string, source: string) => this.emitFile({ type: 'asset', fileName, source });
      for (const m of MODEL_DATA) emit(`${modelPath(m)}index.html`, renderModelPage(m, MODEL_DATA, PRICING_AS_OF));
      emit('models/index.html', renderIndex(MODEL_DATA, PRICING_AS_OF));
      emit('sitemap.xml', renderSitemap(MODEL_DATA, PRICING_AS_OF));
    },
  };
}

/**
 * Which commit this bundle was built from.
 *
 * It goes into the support mail so a bug report says which code the person was
 * actually running - "works for me" is usually "you are on a different build",
 * and asking someone to find that out is a wasted round trip. GITHUB_SHA is
 * there in Actions; git is there locally; neither is guaranteed, so a missing
 * answer is 'unknown' rather than a failed build.
 */
function buildStamp(): string {
  const fromCi = process.env.GITHUB_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(buildStamp()),
  },
  plugins: [react(), modelPages()],
  base: '/Tokenlens/',
  build: {
    target: 'es2022',
    // The BPE rank tables are megabytes of static data and are pulled in with
    // dynamic imports (see lib/tokenize.ts), so they land in their own chunks
    // after the shell has painted. The warning threshold is raised to match:
    // those chunks are meant to be large, and shrinking them is not an option
    // without giving up exact counts.
    chunkSizeWarningLimit: 3200,
  },
});
