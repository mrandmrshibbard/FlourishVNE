/**
 * The executable entry point.
 *
 * Kept separate from `cli.ts` so that importing `main` in a test has no side effects - a
 * self-invoking module would run a full conversion every time the test file loaded.
 */
import { main } from './cli';

main(process.argv.slice(2)).then(code => { process.exitCode = code; });
