#!/usr/bin/env node

import path from 'path';
import { fileURLToPath } from 'url';
import { runCli } from './validation-runner-lib.js';

const EXIT_CODE_FAIL = 1;

async function main() {
    const exitCode = await runCli(process.argv.slice(2));
    process.exit(exitCode);
}

const isDirectExecution = (() => {
    if (!process.argv[1]) {
        return false;
    }
    const modulePath = fileURLToPath(import.meta.url);
    try {
        return path.resolve(process.argv[1]) === modulePath;
    } catch (error) {
        return false;
    }
})();

if (isDirectExecution) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.stack ?? error.message : String(error));
        process.exit(EXIT_CODE_FAIL);
    });
}
