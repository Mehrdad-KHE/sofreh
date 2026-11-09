# Architecture and data model

## Current source structure

```text
v2/
  api/index.mjs                    Vercel request adapter
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

The product website at `apps/showcase/preview/` is an additional development surface; it is not part of the original committed customer/cook baseline.

The native folders also contain TSX components, controllers and Expo manifests. Their current package entrypoints are controller modules. Native build wiring and signing are separate from serving the web previews.

## Existing persistence

SQLite uses WAL, foreign keys, a 5000ms busy timeout and explicit `BEGIN IMMEDIATE` write transactions. The order operation resolves line items, calculates server totals, checks availability and decrements portions transactionally. A later rejection/cancellation restores portions; payment states remain simulated.

| Table | Purpose |
| --- | --- |
| users | Role, identity, locale and synthetic token |
| customer_saved_addresses | Customer-owned saved delivery addresses |
| cook_profiles | Kitchen identity, public area, private pickup address and fulfillment settings |
| dish_slots | Menu, price, capacity, availability, time window and allergens |
| carts / cart_items | Persisted customer cart and quantities |
| orders / order_items | Order state, totals and title/price snapshots |
| order_idempotency_keys | Customer/key/payload mapping to one order |
| order_reviews | Participant reviews for completed orders |

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

Use GitHub for source and versioned technical documentation. Vercel can serve the product website and web application endpoints. Native Android/iOS binaries have their own build and distribution paths.

The adapter currently constructs SQLite at `/tmp/sofreh-stage1.sqlite`. Serverless instances do not provide shared persistent local storage. The durable target therefore requires a database shared by every instance, or a backend host with persistent storage. Choosing a provider must preserve atomic inventory, idempotency, role isolation and address privacy; do not merely copy the file into another temporary folder.

Source: [Vercel guidance on SQLite and serverless storage](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).
