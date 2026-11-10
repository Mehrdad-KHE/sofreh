# Architecture and data model

## Current source structure

```text
v2/
  api/index.mjs                    Vercel request adapter
  apps/account/                   Sign-up, sign-in and one-time role selection
  apps/workspace/                 Authenticated customer/cook web interface
  apps/native/                    Expo role variants sharing the web workspace
  apps/customer-mobile/preview/    Customer web interface
  apps/cook-mobile/preview/        Cook web interface
  apps/classroom-preview/          Classroom page
  apps/shared/mui-responsive.jsx   Shared responsive control layer
  packages/backend/src/           HTTP server, services, SQLite, privacy
  packages/shared/src/            Locales, contracts, fixtures, map config
  assets/                         Food images, fonts, artwork, browser bundle
  tests/                          Backend/HTTP/DOM and concurrency checks
  scripts/                        Local launcher and structural validator
```

The web interfaces call the same HTTP backend. `server.mjs` handles routes, `service.mjs` performs business operations, `db.mjs` owns schema initialization and transactions, `privacy.mjs` serializes recipient-specific views, and `savedAddresses.mjs` enforces customer ownership of addresses.

The bilingual product website is server-rendered by `packages/backend/src/showcase.mjs`; `/en` and `/fa` are independently crawlable when hosting protection permits access.

`apps/native` is an Expo 58 / React Native 0.88 hybrid application configured separately for customer and cook. React Native WebView renders the shared authenticated workspace, and an explicit message bridge handles user-requested foreground location without sending coordinates to the API. The older customer/cook TSX/controllers remain review scaffolds. Generated Android source and Hermes exports do not establish installed-app or iPhone acceptance. Native remote push still needs platform credentials and implementation/testing separate from browser Web Push.

## Account runtime

`identity.mjs` uses Better Auth 1.7.18 with database-backed sessions and rate limiting. Passwords are hashed by that library. One-time application role selection creates a domain user; client-supplied auth profile roles cannot grant domain permissions. Account mode rejects fixture-token authentication and requires the configured Origin for state-changing domain requests. Email verification and forgotten-password email delivery are not configured.

`kitchen.mjs` owns cook onboarding and dish creation/editing. Public positions are selected area centers; private pickup text follows the existing disclosure rules. Real kitchen dishes cannot be ordered after their service window ends. `photos.mjs` enforces cook ownership and uses Sharp to decode/re-encode bounded JPEG/PNG/WebP uploads, stripping EXIF/GPS. Only generated JPEG data is served publicly.

`notifications.mjs` writes one job per subscribed device in the order transaction. The worker claims jobs with a lease, retries failures and removes expired subscriptions. Its delivery tests use an injected sender; they are not evidence of actual locked-device delivery. The service worker displays generic messages and opens the authenticated order workspace. It does not cache account responses or addresses.

## Existing persistence

SQLite uses WAL, foreign keys, a 5000ms busy timeout and explicit `BEGIN IMMEDIATE` write transactions. The order operation resolves line items, calculates server totals, checks availability and decrements portions transactionally. A later rejection/cancellation restores portions; payment states remain simulated.

| Table | Purpose |
| --- | --- |
| users | Role, identity, locale and synthetic token |
| user / session / account / verification / rateLimit | Better Auth-managed identity, credentials, sessions and throttling |
| customer_saved_addresses | Customer-owned saved delivery addresses |
| cook_profiles | Kitchen identity, public area, private pickup address and fulfillment settings |
| dish_slots | Menu, price, capacity, availability, time window and allergens |
| carts / cart_items | Persisted customer cart and quantities |
| orders / order_items | Order state, totals and title/price snapshots |
| order_idempotency_keys | Customer/key/payload mapping to one order |
| order_reviews | Participant reviews for completed orders |
| dish_photos | Cook-owned, re-encoded public food photos |
| push_subscriptions / notification_jobs | Owned browser subscriptions and transactional delivery work |
| notification_pump | Singleton throttle/lease for the optional serverless outbox relay |

Money is represented in integer cents. Order items retain snapshots rather than relying only on the current menu. The customer cart is associated with one cook. Precise device coordinates are not accepted by the current backend payload guard.

## Existing order transitions

| From | Allowed cook actions |
| --- | --- |
| PENDING | ACCEPTED, REJECTED |
| ACCEPTED | PREPARING, READY, CANCELLED |
| PREPARING | READY, CANCELLED |
| READY | COMPLETED |

The service checks role and kitchen ownership before transitions. Terminal states have no next transition in this mapping. This is the current implementation, not a claim that customer cancellation, disputes, expiry or production delivery tracking are implemented.

## Hosting decision

The optional libSQL connector preserves the synchronous domain SQL/transaction API through the maintained vendor binding. Better Auth receives an explicit Kysely SQLite dialect to avoid treating libSQL's internal `db` member as an existing Kysely instance. Schema initialization is an explicit operation; provider provisioning and hosted activation are separate. An isolated remote-protocol test covers separate application connections and a last-portion race against the vendor server. Actual provider latency and deployed concurrency still need acceptance. The Vercel adapter defaults to fixtures; `SOFREH_RUNTIME_MODE=accounts` explicitly selects the initialized remote database and real sessions, with no fixture fallback on configuration or connection failure.

Use GitHub for source and versioned technical documentation. Vercel can serve the product website and web application endpoints. Native Android/iOS binaries have their own build and distribution paths.

Only fixture mode constructs SQLite at `/tmp/sofreh-stage1.sqlite`. Serverless instances do not provide shared persistent local storage. Account mode connects directly to the remote primary and performs no cold-start migrations. Choosing and activating a provider must preserve atomic inventory, idempotency, role isolation and address privacy; do not merely copy the file into another temporary folder.

Source: [Vercel guidance on SQLite and serverless storage](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
