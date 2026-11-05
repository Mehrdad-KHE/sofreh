import { createSofrehHttpServer } from '../packages/backend/src/server.mjs';

// Vercel's Node runtime supplies a compatible IncomingMessage/ServerResponse pair.
// Keep the demo database in /tmp: Vercel storage is ephemeral and this app is
// explicitly a synthetic review fixture, not a production data store.
const server = createSofrehHttpServer({
  dbFilePath: '/tmp/sofreh-stage1.sqlite'
});

export default function handler(req, res) {
  server.emit('request', req, res);
}
