import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData || !path.isAbsolute(localAppData)) throw new Error('Absolute LOCALAPPDATA is required.');
const runtime = path.join(localAppData, 'ElegantRuntime', 'Sofreh', 'tests');
fs.mkdirSync(runtime, { recursive: true });
const runRoot = fs.mkdtempSync(path.join(runtime, 'run-'));
const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['node_modules', '.git', '.vercel', 'data', 'output', 'tmp']);
for (const entry of ['apps', 'assets', 'packages', 'scripts', 'tests', 'package.json', 'tsconfig.json']) {
  fs.cpSync(path.join(source, entry), path.join(runRoot, entry), {
    recursive: true,
    filter: (file) => !excluded.has(path.basename(file)) && !/\.(?:sqlite(?:-.*)?|log)$/.test(file)
  });
}
const tests = fs.readdirSync(path.join(runRoot, 'tests')).filter(name => name.endsWith('.test.mjs')).sort();
const result = spawnSync(process.execPath, ['--experimental-sqlite', '--test', '--test-reporter=spec', ...tests.map(name => path.join(runRoot, 'tests', name))], {
  cwd: runRoot,
  stdio: 'inherit',
  windowsHide: true
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
