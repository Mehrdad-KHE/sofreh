# Local operations and hosting

## Runtime

The source manifest declares Node `24.x`. Account-runtime and complete-suite verification use Node `24.22.2`; the fixture-only launcher also runs on Node `22.12.0` with `--experimental-sqlite`. Better Auth's current SQLite adapter needs APIs absent in that older Node. Run verification against the exact source revision under review.

The fixture backend and structural validator primarily use Node built-ins. Account mode adds Better Auth, Sharp and Web Push. The checked-in legacy browser MUI bundle is already built; the authenticated workspace does not depend on that layer.

## Account-mode startup

From `v2`, with Node 24 available:

```powershell
npm run prepare:identity
npm run start:accounts
```

Preparation installs account runtime dependencies in `%LOCALAPPDATA%\ElegantRuntime\Sofreh\identity-deps`, with its package cache under the same Sofreh runtime root. The launcher copies source into a unique local runtime directory, binds to `127.0.0.1:4121` and keeps persistent local state in `accounts-data`. `PORT` selects another free loopback port. On this machine it can use the project-scoped Node 24 executable under the runtime root; it does not replace a system installation.

`accounts-data` holds SQLite, the authentication secret and Web Push keys. Preserve these together across restarts. Never commit them or include them in screenshots/reports. Empty account mode seeds no demo users, cooks or orders. Use separate browser profiles for independent customer/cook sessions.

Browser Web Push requires user action/permission, a compatible secure context and a running delivery worker. A supported iPhone web app must first be added to the Home Screen. Sender-injection tests cover queue behavior; actual-device delivery remains a separate check. This launcher is local-only, not a hosted release command.

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
npm run prepare:identity
npm test
npm run verify:typecheck
```

`npm test` copies the relevant source into a unique `%LOCALAPPDATA%\ElegantRuntime\Sofreh\tests\run-*` directory and runs every `*.test.mjs` there on Node 24. Test databases stay in that disposable runtime copy. `verify:typecheck` is a structural/contract validator, not the TypeScript compiler or a native build. Do not copy generated output back into the repository.

Package installation and build caches must also be local runtime data. Do not create `node_modules`, caches, browser profiles, logs or temporary test artifacts in synced source folders.

## Vercel

The source configuration uses root `v2`, `main: api/index.mjs` in package metadata and a rewrite from all paths to the adapter. The adapter forwards requests to the same HTTP handler.

Before a web release, check the actual Git integration, root directory, deployed commit, protection settings and function runtime. Verify the resulting URL and the shared customer/cook flow after deployment. HTTP 200 containing a Vercel login page is not an application health result; `/api/health` must return the expected JSON.

The existing Vercel SQLite adapter is ephemeral and uses fixture identity. Connecting GitHub to Vercel does not solve persistence. Deploy the account runtime on a durable host, verify its authentication configuration and test backup/restore before exposing actual account/order data.

## Release and recovery

The designated Git owner reviews and serializes commits and publishing. The application owner approves external publication. Publish source and documentation that correspond to the same reviewed version; record the resulting commit and deployment identifier internally.

For recovery, retain the previous known-good deployment and coordinate its promotion through the Git owner. Reverting web code alone does not reverse database migrations. Any storage migration must include a backup and restore plan tested on synthetic data first.
