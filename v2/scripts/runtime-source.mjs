import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (!process.env.LOCALAPPDATA || !path.isAbsolute(process.env.LOCALAPPDATA)) throw new Error('Absolute LOCALAPPDATA is required.');
export const runtimeRoot = path.join(process.env.LOCALAPPDATA, 'ElegantRuntime', 'Sofreh');

export function node24() {
  if (Number(process.versions.node.split('.')[0]) === 24) return process.execPath;
  const candidate = path.join(runtimeRoot, 'node24', process.platform === 'win32' ? 'node.exe' : 'bin/node');
  const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true });
  if (result.status !== 0 || !/^v24\./.test(result.stdout)) throw new Error('Node 24 is required. Use a Node 24 runtime; do not change a shared system installation.');
  return candidate;
}

export function npmCli() {
  if(process.env.npm_execpath && fs.existsSync(process.env.npm_execpath)) return process.env.npm_execpath;
  const beside=path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
  if(fs.existsSync(beside))return beside;
  const found=spawnSync(process.platform==='win32'?'where.exe':'which',[process.platform==='win32'?'npm.cmd':'npm'],{encoding:'utf8',windowsHide:true});
  const executable=found.stdout?.trim().split(/\r?\n/)[0];
  if(executable){const candidate=process.platform==='win32'?path.join(path.dirname(executable),'node_modules/npm/bin/npm-cli.js'):fs.realpathSync(executable);if(fs.existsSync(candidate))return candidate;}
  throw new Error('npm is required.');
}

export function copyRuntimeSource(target, { dependencies = false } = {}) {
  const resolved = path.resolve(target);
  if (!resolved.startsWith(runtimeRoot + path.sep)) throw new Error('Runtime output must stay under the local Sofreh runtime.');
  fs.mkdirSync(resolved, { recursive: true });
  const excluded = new Set(['node_modules', '.git', '.vercel', 'data', 'output', 'tmp', '.expo', 'dist', 'build']);
  for (const entry of ['apps', 'assets', 'packages', 'scripts', 'tests', 'package.json', 'package-lock.json', 'tsconfig.json']) {
    fs.cpSync(path.join(sourceRoot, entry), path.join(resolved, entry), {
      recursive: true,
      filter: file => !excluded.has(path.basename(file)) && !/\.(?:sqlite(?:-.*)?|log)$/.test(file)
    });
  }
  if (dependencies) {
    const modules = path.join(runtimeRoot, 'identity-deps', 'node_modules');
    if (!fs.existsSync(path.join(modules, 'better-auth', 'package.json'))) throw new Error('Run npm run prepare:identity first.');
    fs.symlinkSync(modules, path.join(resolved, 'node_modules'), 'junction');
  }
  return resolved;
}
