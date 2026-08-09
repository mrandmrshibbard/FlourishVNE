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
      },
      server: {
        port: 5000,
        host: '0.0.0.0',
        allowedHosts: true,
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      /* The machine-translation worker dynamically imports transformers.js, which means the worker
       * bundle has to be code-split — and Vite's default worker format (`iife`) cannot split, so
       * the build fails outright. ES-module workers are supported everywhere this app runs
       * (Electron and modern browsers). */
      worker: {
        format: 'es',
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
