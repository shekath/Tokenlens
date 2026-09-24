import { nodeIo, run } from './main.ts';

run(process.argv.slice(2), nodeIo()).then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stderr.write(`tokenticks: unexpected error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`);
    process.exitCode = 2;
  },
);
