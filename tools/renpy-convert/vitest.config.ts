import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Own config so the converter's tests never touch the app's suite (which is jsdom + React and
// only includes src/**). Absolute root for the same reason the app's config uses one: the
// mobile fork nested in this repo makes vitest resolve relative paths against the wrong root.
const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: here,
    test: {
        environment: 'node',
        globals: true,
        include: ['__tests__/**/*.test.ts'],
    },
    resolve: {
        alias: { '@src': resolve(here, '..', '..', 'src') },
    },
});
