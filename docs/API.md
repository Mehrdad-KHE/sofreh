# Current HTTP API

This reference describes the routes in `v2/packages/backend/src/server.mjs`. It does not describe a proposed `/v1` API.

## Common conventions

- JSON responses use `Content-Type: application/json; charset=utf-8`.
- Locale is selected by `?locale=` or `X-Sofreh-Locale`, with `en-CA` as fallback. Supported locales are `en-CA` and `fa-IR`.
- The synthetic runtime accepts fixture tokens through `X-Sofreh-Token` or `Authorization: Bearer …`. Account mode uses Better Auth session cookies and ignores fixture tokens. State-changing domain requests in account mode require the configured same Origin.
- Guard errors use `{ "error": { "code": "…", "message": "…" } }`; HTTP status is selected by the guard. Unknown routes return 404. Unexpected errors return 500.
- JSON request bodies must be objects. Ordinary input is limited to approximately 256 KiB of text; photo uploads have a separate bounded limit. Responses are not cached.
- `OPTIONS` returns 204. The API does not advertise a wildcard CORS origin; the account web workspace is served from the same origin.

## Account-runtime routes

These routes require account mode. The existing Vercel fixture adapter does not activate them.

| Method and path | Purpose |
| --- | --- |
| POST /api/auth/sign-up/email | Better Auth name/email/password signup; password length 12–128 |
| POST /api/auth/sign-in/email | Better Auth session sign-in |
| POST /api/auth/sign-out | Revoke the current session |
| GET /api/auth/get-session | Better Auth session state |
| POST /api/auth/change-password | Current/new password and optional revokeOtherSessions |
| GET /api/account | Current identity, domain account and own kitchen identifier |
| POST /api/account/setup | One-time CUSTOMER/COOK role and locale; conflicting reassignment returns 409 |
| GET /api/cook/kitchen | Own kitchen or null, and supported public area centers |
| PUT /api/cook/kitchen | Own kitchen information and fulfillment settings |
| PUT /api/cook/dishes[/:dishId] | Create/edit own dish, service window, price, stock and allergens |
| PUT /api/cook/dishes/:dishId/photo | imageBase64; bounded JPEG/PNG/WebP input re-encoded as metadata-free JPEG |
| GET /media/dishes/:photoId.jpg | Intentionally public uploaded food image |
| GET /api/notifications/config | Browser Web Push enabled/public key, without the private key |
| POST /api/notifications/subscription | Owned browser subscription; supported push-service endpoints only |
| DELETE /api/notifications/subscription | Remove this account's matching endpoint |

Kitchen fields: `nameEn`, `nameFa`, `bioEn`, `bioFa`, `area`, `pickupAddress`, `pickupAddressConsent`, `pickupWindowEn`, `pickupWindowFa`, `fulfillmentMode`, `deliveryFeeCents`, `deliveryRadiusKm`, `isPublished`. `pickupAddressConsent` must be boolean when supplied and defaults to false on save. It permits disclosure only on accepted pickup orders; saving through this route sets public visibility to `AREA_ONLY`. The owner response includes `pickupConsentRecordedAtIso` when consent is given and retains the configured `fulfillmentMode` even if pickup is unavailable. Public discovery offers pickup only with explicit consent and a nonempty address; kitchens with no usable method are hidden. New pickup cart/order requests and acceptance/progress of existing pickup orders return 409 `PICKUP_ADDRESS_UNAVAILABLE` while consent or the address is missing. Declining/cancelling remains possible. Withdrawing consent while an accepted, preparing or ready pickup order exists returns 409 `ACTIVE_PICKUP_ORDERS`; finish or cancel those orders first. Delivery remains available without pickup consent.

Dish fields: `titleEn`, `titleFa`, `descriptionEn`, `descriptionFa`, `priceCents`, `remainingPortions`, `expectedRemainingPortions`, `serviceWindowStartIso`, `serviceWindowEndIso`, `allergens`, `availabilityMode`, `category`. A new dish requires `remainingPortions`. For edits, omit it to preserve current stock; when changing it, send the previously observed `expectedRemainingPortions`. A mismatch returns 409 `DISH_STOCK_CHANGED` without saving any fields. The stock check and save share a write transaction; total capacity changes by the stock delta so previously reserved portions remain recoverable on cancellation. Categories are `food`, `bread`, `pickles`, `sides`, and `other`. Omission preserves an existing category; a new uncategorized dish uses `other`. Public discovery returns the cook-authored category; the customer can filter it without inferring it from the dish name.

Existing domain routes below retain the same ownership, cart, inventory and order logic in both runtimes. Email verification and forgotten-password delivery are not configured. Authentication errors follow Better Auth conventions, which can include a top-level `code`/`message`; domain errors retain the nested `error` object.

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
| PATCH /api/cook/kitchen/:cookId/dishes/:dishId | totalPortions, remainingPortions, expectedRemainingPortions, priceCents, availabilityMode; account kitchens require the observed stock count for capacity/stock changes |
| POST /api/cook/orders/:orderId/status | nextStatus; see the architecture transition table |
| POST /api/orders/:orderId/reviews | rating and comment; participant/completed-order restrictions apply |

The order route returns 201 `{ order }`. It accepts `Idempotency-Key` as a header fallback; a nonempty `body.idempotencyKey` takes precedence. Keep the same key and payload when retrying the same operation. A conflicting reuse must not create a second order. Web clients may include the displayed `expectedSubtotalCents`, `expectedDeliveryFeeCents` and `expectedTotalCents`; if any part of the current server quote differs, the request returns 409 `ORDER_QUOTE_CHANGED` without reserving portions, and the customer must review the refreshed cart.

Address fields must contain a label up to 60 characters and a delivery address between 5 and 500 characters, with service trimming. Delivery address text validation is not geocoding or proof of delivery coverage.

The current location guard rejects the defined precise-device-location fields on guarded payload routes. Do not send private device coordinates simply to display approximate distance in discovery.

## Web and asset routes

`GET /en` and `/fa` serve the bilingual catalogue. `/` and `/showcase` redirect to `/en`; `/robots.txt` and `/sitemap.xml` describe catalogue discovery. `/assets/…` is served from an explicit allowlist.

Synthetic mode serves `/preview/customer`, `/preview/cook` and `/preview/classroom`. Account mode serves `/account`, `/app/customer`, `/app/cook`, workspace JS/CSS, role-specific web manifests and `/sw.js`. Signed-out entry and an account without a completed role return to account entry with role/locale context. A signed-in person opening the other role's entry receives a 303 redirect to their own workspace, preserving an explicit locale. This navigation does not grant another role's API permissions: those requests remain forbidden. Private workspaces are noindex and omitted from the sitemap. The favicon endpoint returns 204.
