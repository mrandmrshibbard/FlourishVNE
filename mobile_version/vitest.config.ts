import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Absolute path: with the mobile fork nested inside this repo, vitest resolves
// relative setupFiles against the outer workspace root instead of this project.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [resolve(here, 'src/test/setup.ts')],
    include: ['src/**/*.test.{ts,tsx}'],
  },
  define: {
    '__APP_VERSION__': JSON.stringify('test'),
  },
});
