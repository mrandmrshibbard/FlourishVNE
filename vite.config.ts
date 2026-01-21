import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      base: './', // Use relative paths for Electron compatibility
      server: {
        port: 3000,
        host: '0.0.0.0',
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

              if (id.includes('react')) return 'react-vendor';
              if (id.includes('react-dom')) return 'react-vendor';

              if (id.includes('monaco-editor')) return 'monaco';
              if (id.includes('reactflow')) return 'reactflow';

              return 'vendor';
            },
          },
        },
      },
    };
});
