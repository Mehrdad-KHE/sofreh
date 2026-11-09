import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { copyRuntimeSource, runtimeRoot, node24 } from './runtime-source.mjs';

if (Number(process.versions.node.split('.')[0]) !== 24) {
  const result = spawnSync(node24(), [process.argv[1]], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

const port = Number(process.env.PORT || 4121);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT.');
fs.mkdirSync(runtimeRoot, { recursive: true });
const target = copyRuntimeSource(fs.mkdtempSync(path.join(runtimeRoot, 'accounts-')), { dependencies: true });
const state = path.join(runtimeRoot, 'accounts-data');
fs.mkdirSync(state, { recursive: true });
const secretFile = path.join(state, 'auth-secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, randomBytes(48).toString('base64url'), { flag: 'wx', mode: 0o600 });
const { openSofrehDatabase } = await import(pathToFileURL(path.join(target, 'packages/backend/src/db.mjs')));
const { createIdentityProvider } = await import(pathToFileURL(path.join(target, 'packages/backend/src/identity.mjs')));
const { createSofrehHttpServer } = await import(pathToFileURL(path.join(target, 'packages/backend/src/server.mjs')));
const { startNotificationWorker } = await import(pathToFileURL(path.join(target, 'packages/backend/src/notifications.mjs')));
const webpush = await import(pathToFileURL(path.join(target,'node_modules/web-push/src/index.js')));
const pushKeysFile = path.join(state,'webpush-keys.json');
if(!fs.existsSync(pushKeysFile))fs.writeFileSync(pushKeysFile,JSON.stringify(webpush.generateVAPIDKeys()),{flag:'wx',mode:0o600});
const keys=JSON.parse(fs.readFileSync(pushKeysFile,'utf8'));
const db = openSofrehDatabase(path.join(state, 'sofreh-accounts.sqlite'));
const identityProvider = await createIdentityProvider({ db, baseURL: `http://127.0.0.1:${port}`, secret: fs.readFileSync(secretFile, 'utf8') });
const { server } = createSofrehHttpServer({ database: db, seedFixtures: false, identityProvider, pushPublicKey:keys.publicKey });
const stopNotifications=startNotificationWorker(db,{subject:'https://sofreh-v2.vercel.app',...keys});
server.listen(port, '127.0.0.1', () => console.log(`Sofreh accounts: http://127.0.0.1:${port}/account`));
server.on('error', error => { console.error(error.message); db.close(); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.closeAllConnections(); server.close(async() => {await stopNotifications();db.close();}); });
