import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Expand the original test pattern on every platform. Discovery by directory
// would also execute gen-sleep-kotlin-test.mjs and rewrite a tracked fixture.
const scripts = new URL('./', import.meta.url);
const tests = readdirSync(scripts)
  .filter(name => name.endsWith('.test.js'))
  .sort()
  .map(name => fileURLToPath(new URL(name, scripts)));

const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2), ...tests], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
