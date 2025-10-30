import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Vite config for building the standalone player
// This creates a minimal bundle with just the game engine (no editor)
export default defineConfig({
    plugins: [react()],
    build: {
        outDir: 'dist-standalone',
        emptyOutDir: true,
        lib: {
            entry: path.resolve(__dirname, 'src/StandalonePlayer.tsx'),
            name: 'GameEngine',
            formats: ['iife'],
            fileName: () => 'game-engine.js'
        },
        rollupOptions: {
            // Externalize React (loaded from CDN in player template)
            external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
            output: {
                globals: {
                    'react': 'React',
                    'react-dom': 'ReactDOM',
                    'react-dom/client': 'ReactDOM',
                    'react/jsx-runtime': 'jsxRuntime'
                },
                // Inline all CSS into the JS bundle
                inlineDynamicImports: true,
                // Inline assets as base64
                assetFileNames: () => '[name].[ext]'
            }
        },
        // Don't minify for now - easier to debug
        minify: false,
        sourcemap: false,
        // Increase chunk size warning limit (game bundles can be large)
        chunkSizeWarningLimit: 2000,
        // Inline small assets as base64
        assetsInlineLimit: 100000 // 100KB - logo should be inlined
    }
});
