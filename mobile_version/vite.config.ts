import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './',
      define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        // Mobile fork: flips platform.ts IS_MOBILE on, trims desktop-only UI,
        // and statically dead-code-eliminates `!IS_MOBILE` branches.
        __MOBILE__: JSON.stringify(true),
      },
      server: {
        // Distinct port from the desktop dev server (5000) so both can run.
        port: 5100,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;

              // Monaco is huge and self-contained — keep it in its own chunk.
              if (id.includes('monaco-editor')) return 'monaco';

              // ag-psd (the .psd sprite importer) is ~250KB and only loaded when an artist actually
              // imports a Photoshop file — it's a dynamic import(), so give it its own chunk instead
              // of welding it into the startup bundle.
              if (id.includes('ag-psd')) return 'psd';

              // Everything else (React, react-dom, react-i18next, i18next, etc.)
              // goes in a single vendor chunk. Do NOT split React into a separate
              // chunk: `react-i18next` (matches "react") would land with React while
              // its deps (i18next, use-sync-external-store) land elsewhere, creating
              // a circular chunk reference that leaves React undefined at runtime
              // ("Cannot set properties of undefined (setting 'Activity')").
              return 'vendor';
            },
          },
        },
      },
    };
});
