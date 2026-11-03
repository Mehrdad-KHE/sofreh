# Sofreh — full current source for review

This is the complete current Sofreh application source, not screenshots or a reduced feature sample. Both customer/cook web interfaces, shared SQLite backend, tests, food photos/logos/fonts with credits, TSX components, Expo manifests and product/architecture references are included. The original workspace remains unchanged.

## Run locally (human or AI assistant)

Use **Node.js 22.12.0 and npm 10.9.0** (the verified versions). Git 2.48.1 was used to prepare fresh local history. No API key, account, paid service or Docker is needed. Backend and tests use Node built-ins; the lockfile records local workspaces only.

```sh
cd v2
npm ci --ignore-scripts --offline --no-audit --no-fund
npm test
npm run verify:typecheck
npm run start:backend
```

Open these URLs on the same computer:

- Customer: http://127.0.0.1:4120/preview/customer
- Cook: http://127.0.0.1:4120/preview/cook
- Health: http://127.0.0.1:4120/api/health

The server binds **127.0.0.1 only**. If 4120 is busy, stop only your own previous demo instance or set `PORT` explicitly; do not expose it publicly. Stop with Ctrl+C. This is not a hosted link.

On first start, the backend creates `v2/packages/backend/data/sofreh-stage1.sqlite` with **synthetic** users, kitchens and menus. No owner's database/orders/addresses are included. Customer and cook screens use known demo credentials from `v2/packages/shared/src/fixtures.mjs`; these are deliberately public test fixtures, not real login security. Use only synthetic addresses and orders. A simple review is: select a dish → simulated pickup order → Cook accepts → Customer refresh shows the same order/status.

## What can be reviewed and changed

English/Persian interfaces, actual MapLibre/OpenFreeMap map, local sample food photos, kitchen storefronts, Today/Regular availability, multi-item cart, stock/transaction protections, order transitions, saved demo addresses/settings, reviews and privacy serialization. Customer Settings is in the top three-dot menu. Reviewers may inspect/edit all source; preserve asset credits in `v2/assets/CREDITS.md` and font licensing under `v2/assets/fonts/`.

Verified on 2026-11-03: offline setup, **23/23 tests**, structural validator, both actual rendered web interfaces/map, and a simulated Customer → Cook acceptance → Customer reload round trip. The suite includes HTTP, independent SQLite-connection contention, privacy and DOM-harness interactions. `verify:typecheck` is a structural/contract validator, **not** a TypeScript compiler or native build. The sharing copy changes only test 9 to generate/reopen its own synthetic preservation fixture instead of requiring the owner's live database; no app behavior was changed. Existing non-blocking browser diagnostics include a missing favicon and map-style null-value warnings; Cook menu layout is still narrow on small screens.

## Honest limits / next work

- **Web demo is runnable; native is not a verified runnable Expo/Android/iOS app.** Existing TSX components/controllers and Expo manifests are included in full, but native dependencies, platform projects and wiring/build/device verification remain unfinished. No APK is included or claimed.
- Authentication and payments are demonstrations, not production account security or payment-provider integration. Do not use real customers, cards or orders.
- Public cook pins are synthetic approximate fixture positions; privacy-circle/public-pickup-consent behavior is **not implemented**. Own-kitchen-only normal Cook identity UX is also future work. Existing server role/ownership gates do not replace real authentication.
- The map needs internet to fetch MapLibre/OpenFreeMap resources. Bundled food images are licensed sample photos, not actual dishes made by these fictional cooks. Geolocation is optional and requires the browser's genuine permission.
- Product/architecture references in `docs/reference/` describe historical requirements/plans, not a claim that every planned feature exists. Current source/tests and this README take precedence.

Only private runtime data, local backups/history, machine/assistant operational notes, logs and generated caches are excluded. Photo EXIF/GPS metadata was removed losslessly in this sharing copy; pixels and required credits remain. All application functionality/source is retained. No repository hosting, deployment, account sharing or invitation is performed by this package.

## راهنمای کوتاه فارسی

این نسخه تمام سورس فعلی سفره است. هوش مصنوعیِ بازبین ابتدا همین راهنما را بخواند، فرمان‌های بالا را از پوشهٔ `v2` اجرا کند و هر دو لینک مشتری و آشپز را باز کند. داده‌ها و پرداخت ساختگی‌اند؛ برنامه را عمومی منتشر نکند و برای اجرای دمو هیچ کلید یا سرویس پولی نسازد. برای نظر دادن یا ادامهٔ توسعه، سورس کامل در اختیار است؛ نسخهٔ بومی هنوز ساخت و تأیید نشده است.
