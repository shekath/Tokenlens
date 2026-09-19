import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
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
