import path from 'node:path';
import { createSofrehHttpServer } from '../packages/backend/src/server.mjs';

const localAppData = process.env.LOCALAPPDATA;
if (!localAppData || !path.isAbsolute(localAppData)) {
  throw new Error('An absolute LOCALAPPDATA path is required for local Sofreh runtime data.');
}

const port = Number(process.env.PORT || 4120);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const dbFilePath = path.join(localAppData, 'ElegantRuntime', 'Sofreh', 'local', 'sofreh-stage1.sqlite');
const { server, db } = createSofrehHttpServer({ dbFilePath });
server.on('error', (error) => {
  db.close();
  console.error(`Sofreh could not start: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, '127.0.0.1', () => {
  console.log(`Sofreh: http://127.0.0.1:${port}/preview/customer`);
});

let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => db.close());
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
