let serverPromise;

async function getServer() {
  if (!serverPromise) {
    serverPromise = import('../packages/backend/src/server.mjs').then(({ createSofrehHttpServer }) =>
      // Vercel's filesystem is ephemeral; this is synthetic review data only.
      createSofrehHttpServer({ dbFilePath: '/tmp/sofreh-stage1.sqlite' }).server
    );
  }
  return serverPromise;
}

export default async function handler(req, res) {
  try {
    const routedUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const originalPath = routedUrl.searchParams.get('path');
    if (routedUrl.pathname === '/api/index.mjs' && originalPath) {
      routedUrl.searchParams.delete('path');
      req.url = `${originalPath}${routedUrl.search ? `?${routedUrl.searchParams}` : ''}`;
    }
    const server = await getServer();
    server.emit('request', req, res);
  } catch (error) {
    console.error('Sofreh runtime initialization failed', error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: { code: 'RUNTIME_INIT_FAILED' } }));
  }
}
