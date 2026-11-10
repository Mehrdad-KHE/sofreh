# Local operations and hosting

## Runtime

The source manifest declares Node `24.x`. Account-runtime and complete-suite verification use Node `24.22.2`; the fixture-only launcher also runs on Node `22.12.0` with `--experimental-sqlite`. Better Auth's current SQLite adapter needs APIs absent in that older Node. Run verification against the exact source revision under review.

The fixture backend and structural validator primarily use Node built-ins. Account mode adds Better Auth, Sharp and Web Push. The checked-in legacy browser MUI bundle is already built; the authenticated workspace does not depend on that layer.

To rebuild the legacy MUI bridge from its JSX and the repository lockfile, run `node scripts/build-ui.mjs` from `v2`. Installation, compilation and output stay in a unique local runtime copy. The command prints an internal bundle path; review it in the fixture browser runtime before replacing `v2/assets/mui-responsive.js`. It does not automatically modify a published asset.

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

`remote.mjs` provides a libSQL connection and an explicit Kysely dialect for Better Auth. It uses the vendor's synchronous native binding; it does not copy a shared database into `/tmp` or turn asynchronous network calls into a custom blocking bridge. Connector source alone does not activate hosted accounts.

For an approved, initially empty libSQL database, configure `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SOFREH_PUBLIC_ORIGIN` (the HTTPS application origin) and a persistent `SOFREH_AUTH_SECRET`. After `prepare:identity`, `node scripts/initialize-remote.mjs` initializes domain/authentication schemas from a local runtime copy. It creates no provider account, chooses no paid plan and imports no fixture data. Confirm the destination and take an appropriate backup before using migration tooling on an existing database. Keep all credentials outside Git.

The manually dispatched `Internal remote database contract` workflow uses a checksum-pinned official libSQL server container in an isolated Linux runtime. It exercises independent application connections, ownership, images, order visibility, persistence and competing orders. Its test data stays in the ephemeral runner. This is protocol/contract coverage, not proof that a particular cloud account, pricing plan, region or deployed URL has been accepted.

The source configuration uses root `v2`, `main: api/index.mjs` in package metadata and a rewrite from all paths to the adapter. The adapter forwards requests to the same HTTP handler and explicitly includes HTML, workspace scripts, service worker and static assets in the function package.

The adapter defaults to fixture mode. After approving a database, initializing its schema and retaining the four credentials above, set `SOFREH_RUNTIME_MODE=accounts` in the intended deployment environment and redeploy. No provider integration or environment setting is changed by adding this source. Account mode creates no fixtures and runs no schema migrations during cold starts. Missing credentials, missing auth tables or an unavailable database produce a generic, non-cacheable 503; they never switch accounts back to a temporary fixture database. A failed cold start can retry on a later request. The authentication rate limiter uses Vercel's proxy-derived client IP only in the Vercel adapter; other runtimes retain socket-based behavior.

The optional serverless notification relay uses the existing Vercel platform, not the local five-second timer. After initializing the `notification_pump` table and approving hosted account operation, configure `SOFREH_NOTIFICATION_DELIVERY=vercel-queue`, `SOFREH_VAPID_PUBLIC_KEY` and `SOFREH_VAPID_PRIVATE_KEY`. Preserve the matching P-256 pair across deployments. Configuration validates that the private key derives the public key. Without explicit delivery configuration the hosted interface does not advertise push availability.

`api/notifications.mjs` has a private queue trigger for `sofreh-notification-pump`. Messages contain only a version marker; account identifiers, addresses, order details and push endpoints remain in the database. A request starts or recovers a throttled relay. Each consumer schedules the next durable tick before processing at most 20 outbox jobs. Ticks are one minute apart; queue redelivery retries failures, while per-job database leases and bounded push attempts prevent concurrent sends. Disabling delivery stops recurrence on the next invocation. After an outage longer than message retention, an application request restarts it. Failed/exhausted jobs remain inspectable; this is not a guarantee of device receipt or exactly-once display.

The relay is disabled by default. Its isolated tests inject queue publication and push sending; actual Vercel queue authentication, cloud callbacks and closed/locked-device receipt still need acceptance after activation. Browser Web Push does not implement native APNs/FCM registration for the mobile shells. Vercel currently includes the first one million queue API operations on Hobby; compute and other quotas still apply. Check [official queue pricing](https://vercel.com/docs/queues/pricing) and project usage before leaving a recurring relay enabled.

Before a web release, check the actual Git integration, root directory, deployed commit, protection settings and function runtime. Verify the resulting URL and the shared customer/cook flow after deployment. HTTP 200 containing a Vercel login page is not an application health result; `/api/health` must return the expected JSON.

Until the explicit account configuration is activated and accepted, the existing deployment remains an ephemeral fixture runtime. Connecting GitHub to Vercel alone does not solve persistence. Keep the current Vercel host, connect an approved durable database, verify authentication and test backup/restore before exposing actual account/order data.

## Release and recovery

The designated Git owner reviews and serializes commits and publishing. The application owner approves external publication. Publish source and documentation that correspond to the same reviewed version; record the resulting commit and deployment identifier internally.

For recovery, retain the previous known-good deployment and coordinate its promotion through the Git owner. Reverting web code alone does not reverse database migrations. Any storage migration must include a backup and restore plan tested on synthetic data first.
