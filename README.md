# Sofreh | سفره

Sofreh connects people in Toronto and the surrounding area with local cooks and prepared meals. The product includes a bilingual discovery and ordering experience, cook order management, and a public product website.

This repository contains the current synthetic-data web implementation and separate customer/cook mobile source scaffolds. Payments are simulated. The mobile manifests describe application identities; they are not downloadable app releases.

## Documentation

- [Project passport and product scope](docs/PROJECT-PASSPORT.md)
- [Architecture and data model](docs/ARCHITECTURE.md)
- [HTTP API reference](docs/API.md)
- [Local operations and hosting](docs/OPERATIONS.md)
- [Design, accessibility, SEO and GEO](docs/DESIGN-AND-DISCOVERY.md)
- [Privacy, security and asset rights](docs/PRIVACY-AND-ASSETS.md)
- [Acceptance criteria](docs/ACCEPTANCE.md)

## Run the local web implementation

From `v2`, run:

```powershell
node --experimental-sqlite scripts/start-local.mjs
```

The launcher writes synthetic SQLite data under `%LOCALAPPDATA%\ElegantRuntime\Sofreh\local`, outside the source tree. Open:

- Customer: `http://127.0.0.1:4120/preview/customer`
- Cook: `http://127.0.0.1:4120/preview/cook`
- Health: `http://127.0.0.1:4120/api/health`

The product website is an additional delivery surface described in the project passport. Its `/showcase` route is being developed separately from the committed customer/cook baseline.

The local launcher binds only to loopback. Use synthetic accounts, addresses and orders. The map fetches external MapLibre/OpenFreeMap resources and therefore needs internet access. See [operations](docs/OPERATIONS.md) for runtime versions and test isolation.

## Repository and hosting

Source repository: [Mehrdad-KHE/sofreh](https://github.com/Mehrdad-KHE/sofreh), default branch `main`.

The existing web hosting address is [sofreh-v2.vercel.app](https://sofreh-v2.vercel.app). Access protection and the deployed revision are deployment properties, not guarantees provided by this source tree. The current Vercel adapter uses ephemeral SQLite and is for synthetic review data. Shared durable hosting requires a separate persistent storage design.

## Rights and attribution

Food photographs, fonts and artwork have separate source and attribution requirements. See [privacy and assets](docs/PRIVACY-AND-ASSETS.md) and [asset credits](v2/assets/CREDITS.md). No new software license or permission to use third-party branding is granted by this documentation.
