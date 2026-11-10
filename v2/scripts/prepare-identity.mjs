import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runtimeRoot, node24, npmCli } from './runtime-source.mjs';

const target = path.join(runtimeRoot, 'identity-deps');
fs.mkdirSync(target, { recursive: true });
fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify({ private: true, dependencies: { 'better-auth': '1.7.18', sharp: '0.35.5', 'web-push': '4.0.0', libsql: '0.5.29', kysely: '0.29.8' } }, null, 2));
const result = spawnSync(node24(), [npmCli(), 'install', '--no-audit', '--no-fund', '--ignore-scripts'], {
  cwd: target, stdio: 'inherit', windowsHide: true,
  env: { ...process.env, npm_config_cache: path.join(runtimeRoot, 'npm-cache'), TEMP: target, TMP: target }
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
