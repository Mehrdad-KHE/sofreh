# Sofreh | سفره

Sofreh connects people in Toronto and the surrounding area with local cooks and prepared meals. The product includes a bilingual discovery and ordering experience, cook order management, and a public product website.

This repository contains a bilingual product catalogue, a cookie-authenticated customer/cook web workspace, a separate synthetic review runtime, and mobile source. Payments are simulated. A JavaScript bundle, manifest or generated native project is not a downloadable, device-accepted application release.

## Documentation

- [Project passport and product scope](docs/PROJECT-PASSPORT.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [HTTP API reference](docs/API.md)
- [Local operations and hosting](docs/OPERATIONS.md)
- [Design, accessibility, SEO and GEO](docs/DESIGN-AND-DISCOVERY.md)
- [Privacy, security and asset rights](docs/PRIVACY-AND-ASSETS.md)
- [Acceptance criteria](docs/ACCEPTANCE.md)
- [Mobile build and device acceptance](docs/MOBILE-BUILDS.md)

## Run the account-based web implementation

Use Node 24. From `v2`:

```powershell
npm run prepare:identity
npm run start:accounts
```

Open `http://127.0.0.1:4121/account` and create a customer or cook account. A cook creates a kitchen and menu; a separately signed-in customer can then order from it. Account setup chooses one role. Passwords use Better Auth; fixture tokens are ignored in this runtime. Email verification and forgotten-password delivery are not configured.

Account data, secrets, photos, notification subscriptions and temporary runtime copies stay under `%LOCALAPPDATA%\ElegantRuntime\Sofreh`, outside the source tree. This launcher binds only to loopback; it does not make the account workspace publicly available.

## Run the synthetic review implementation

From `v2`, run:

```powershell
node --experimental-sqlite scripts/start-local.mjs
```

The launcher writes synthetic SQLite data under `%LOCALAPPDATA%\ElegantRuntime\Sofreh\local`, outside the source tree. Open:

- Customer: `http://127.0.0.1:4120/preview/customer`
- Cook: `http://127.0.0.1:4120/preview/cook`
- Health: `http://127.0.0.1:4120/api/health`

The product website is at `/en` and `/fa`. `/` and the historical `/showcase` entry redirect to `/en`. In account mode its buttons open the account workspaces; in synthetic review mode they open the review interfaces.

The local launcher binds only to loopback. Use synthetic accounts, addresses and orders. The map fetches external MapLibre/OpenFreeMap resources and therefore needs internet access. See [operations](docs/OPERATIONS.md) for runtime versions and test isolation.

## Repository and hosting

Source repository: [Mehrdad-KHE/sofreh](https://github.com/Mehrdad-KHE/sofreh), default branch `main`.

The existing web hosting address is [sofreh-v2.vercel.app](https://sofreh-v2.vercel.app). Access protection and the deployed revision are deployment properties, not guarantees provided by this source tree. The current Vercel adapter uses ephemeral SQLite and continues to run synthetic review data, even when account-runtime source is present in the repository. Hosted accounts require an approved durable storage deployment. Native installation, signing, push delivery and actual-phone acceptance are separate release gates.

## Rights and attribution

Food photographs, fonts and artwork have separate source and attribution requirements. See [privacy and assets](docs/PRIVACY-AND-ASSETS.md) and [asset credits](v2/assets/CREDITS.md). No new software license or permission to use third-party branding is granted by this documentation.
