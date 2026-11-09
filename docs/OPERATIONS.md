# Local operations and hosting

## Runtime

The source manifest declares Node `24.x` for deployment. The local launcher was checked on Node `22.12.0` with `--experimental-sqlite`. A Node 22 run does not verify the deployed Node 24 environment. Run verification against the exact source revision under review.

The existing backend, test runner and structural validator use Node built-ins. The checked-in browser MUI bundle is already built. Rebuilding the shared JSX requires its declared React/MUI/esbuild dependencies and a separate build procedure.

## Safe local startup

From `v2`:

```powershell
node --experimental-sqlite scripts/start-local.mjs
```

The launcher uses `%LOCALAPPDATA%\ElegantRuntime\Sofreh\local\sofreh-stage1.sqlite`, binds to `127.0.0.1`, and defaults to port 4120. Set `PORT` to another free port if needed. Stop the launcher with Ctrl+C. Never stop an unrelated process to free the port.

The legacy `npm run start:backend` invokes `server.mjs` directly and defaults to a database under the source tree. Use the local launcher instead. Do not run either server with real customer data while fixture-token identity is in use.

## Isolated verification

From the source `v2` directory:

```powershell
npm test
npm run verify:typecheck
```

`npm test` copies the relevant source into a unique `%LOCALAPPDATA%\ElegantRuntime\Sofreh\tests\run-*` directory and runs every `*.test.mjs` there with SQLite enabled. Test databases stay in that disposable runtime copy. `verify:typecheck` is a structural/contract validator, not the TypeScript compiler or a native build. Do not copy generated output back into the repository.

Package installation and build caches must also be local runtime data. Do not create `node_modules`, caches, browser profiles, logs or temporary test artifacts in synced source folders.

## Vercel

The source configuration uses root `v2`, `main: api/index.mjs` in package metadata and a rewrite from all paths to the adapter. The adapter forwards requests to the same HTTP handler.

Before a web release, check the actual Git integration, root directory, deployed commit, protection settings and function runtime. Verify the resulting URL and the shared customer/cook flow after deployment. HTTP 200 containing a Vercel login page is not an application health result; `/api/health` must return the expected JSON.

The existing SQLite adapter is ephemeral. Connecting GitHub to Vercel does not solve persistence. A durable database design and an authentication implementation are required before exposing actual account/order data.

## Release and recovery

The designated Git owner reviews and serializes commits and publishing. The application owner approves external publication. Publish source and documentation that correspond to the same reviewed version; record the resulting commit and deployment identifier internally.

For recovery, retain the previous known-good deployment and coordinate its promotion through the Git owner. Reverting web code alone does not reverse database migrations. Any storage migration must include a backup and restore plan tested on synthetic data first.
