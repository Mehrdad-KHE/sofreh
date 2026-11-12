import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { copyRuntimeSource, node24, runtimeRoot } from './runtime-source.mjs';

const runtime = path.join(runtimeRoot, 'tests');
fs.mkdirSync(runtime, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(runtime, 'run-'));
copyRuntimeSource(runRoot, { dependencies: true });
const tests = fs.readdirSync(path.join(runRoot, 'tests')).filter(name => name.endsWith('.test.mjs')).sort();
const result = spawnSync(node24(), ['--test', '--test-reporter=spec', ...tests.map(name => path.join(runRoot, 'tests', name))], {
  cwd: runRoot,
  stdio: 'inherit',
  windowsHide: true
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
