# Current HTTP API

This reference describes the routes in `v2/packages/backend/src/server.mjs`. It does not describe a proposed `/v1` API.

## Common conventions

- JSON responses use `Content-Type: application/json; charset=utf-8`.
- Locale is selected by `?locale=` or `X-Sofreh-Locale`, with `en-CA` as fallback. Supported locales are `en-CA` and `fa-IR`.
- Role-protected requests accept a fixture token through `X-Sofreh-Token` or `Authorization: Bearer …`. This mechanism is synthetic identity, not production authentication.
- Guard errors use `{ "error": { "code": "…", "message": "…" } }`; HTTP status is selected by the guard. Unknown routes return 404. Unexpected errors return 500.
- JSON request bodies must be objects. The parser limits input to approximately 256 KiB of accumulated text.
- `OPTIONS` returns 204; the current CORS response allows `*`. A deployed authentication design must review CORS and credential handling.

## Read routes

| Method and path | Response / purpose |
| --- | --- |
| GET /api/health | Health, locale, SQLite diagnostics and map configuration |
| GET /api/discovery/cooks | Public cook/menu discovery; optional minLat, maxLat, minLng, maxLng bounds |
| GET /api/customer/cart | `{ cart }`, authenticated customer |
| GET /api/customer/orders | `{ orders }`, authenticated customer's orders |
| GET /api/customer/orders/:orderId | `{ order }`, customer ownership enforced |
| GET /api/customer/addresses | `{ addresses }`, customer-owned addresses |
| GET /api/customer/addresses/:id | `{ address }`, customer ownership enforced |
| GET /api/cook/kitchen/:cookId/orders | `{ orders }`, owning cook |
| GET /api/cooks/:cookId/reviews | Public cook review result |

## Write routes

| Method and path | Request fields / behavior |
| --- | --- |
| PUT /api/customer/cart | cookId, fulfillmentType, deliveryAddress, items |
| POST /api/customer/cart/items | cookId, dishId, quantity, fulfillmentType, deliveryAddress as applicable |
| DELETE /api/customer/cart | Clears the authenticated customer's cart |
| POST /api/customer/orders | cookId, fulfillmentType, deliveryAddress, items and idempotencyKey; service can resolve omitted order details from the stored cart |
| POST /api/customer/addresses | label and address only; returns 201 `{ address }` |
| PUT /api/customer/addresses/:id | label and address only; returns 200 `{ address }` |
| DELETE /api/customer/addresses/:id | Returns `{ deleted: true }` after ownership check |
| PATCH /api/cook/kitchen/:cookId/delivery-settings | deliveryFeeCents, supportsDelivery, supportsPickup, deliveryRadiusKm, fulfillmentMode |
| PATCH /api/cook/kitchen/:cookId/dishes/:dishId | totalPortions, remainingPortions, priceCents, availabilityMode |
| POST /api/cook/orders/:orderId/status | nextStatus; see the architecture transition table |
| POST /api/orders/:orderId/reviews | rating and comment; participant/completed-order restrictions apply |

The order route returns 201 `{ order }`. It accepts `Idempotency-Key` as a header fallback; a nonempty `body.idempotencyKey` takes precedence. Keep the same key and payload when retrying the same operation. A conflicting reuse must not create a second order.

Address fields must contain a label up to 60 characters and a delivery address between 5 and 500 characters, with service trimming. Delivery address text validation is not geocoding or proof of delivery coverage.

The current location guard rejects the defined precise-device-location fields on guarded payload routes. Do not send private device coordinates simply to display approximate distance in discovery.

## Web and asset routes

`GET /preview/customer`, `/preview/cook`, and `/preview/classroom` serve HTML. `/assets/…` is served from an explicit allowlist. The `/showcase` and favicon response additions are separate development changes; the original committed baseline does not define those handlers. The backend does not define the site root `/` as a product website alias.
