# Privacy, security and asset rights

## Current data boundaries

The reference implementation seeds synthetic customers, cooks and orders. Fixture tokens are public test identities. Do not use real credentials, payment-card information or actual customer addresses in this mode.

The backend enforces roles and ownership and serializes views for each recipient. Public discovery exposes a kitchen's public area. Pickup address disclosure depends on the implemented visibility/consent rules and order context. Delivery orders must not expose the cook's private home address to the customer.

Precise device geolocation is intended to stay in browser memory under the current contract. Declining location must remain a usable path. Logs, screenshots, analytics and search markup must follow the same address boundaries as visible interfaces.

## Security work associated with actual accounts

An actual account implementation needs server-verified identity, session lifecycle, recovery, ownership checks, secret handling and review of CORS, rate limits and error disclosure. Durable storage needs access control, migration, backup/restore and retention policies. This document records requirements; it is not a security certification or a published legal privacy policy.

Do not place secrets, signing keys, database files, account exports, browser profiles or private operational notes in GitHub. Store access and build secrets in the relevant approved account infrastructure.

## Asset inventory

| Category | Existing source | Rights handling |
| --- | --- | --- |
| Food photographs | Wikimedia Commons sample food JPGs | Preserve each image's source, creator and CC/public-domain terms |
| Persian UI font | Vazirmatn | Retain SIL OFL text bundled with the font |
| Persian wordmark font | Noto Nastaliq Urdu | Retain its SIL OFL text and source credit |
| Kitchen marks | Local SVG demo artwork | Do not imply real kitchens or third-party endorsement |
| Browser UI bundle | React/MUI/Emotion dependencies and generated bundle | Preserve dependency/license obligations when rebuilding/distributing |

The authoritative per-photo inventory is [CREDITS.md](../v2/assets/CREDITS.md); the application also serves [credits.html](../v2/assets/credits.html). Sample images illustrate meal types and do not show the fictional cook's own product. Generated promotional imagery must not be represented as a seller's actual dish or evidence of a food-safety qualification.

A public GitHub repository is not, by itself, a chosen software license. This documentation adds no new software license and grants no rights to third-party brands. Licensing the original application code is an owner decision.

## Food business representations

Toronto's guidance includes commercial home kitchens in its food-premise definition and requires notification before operation. Ontario's low-risk-food exemptions are specific; they cannot be assumed for all prepared meals. Seller checks and customer-facing claims must reflect the actual applicable process.

- [Toronto: starting a food business](https://www.toronto.ca/community-people/health-wellness-care/health-programs-advice/food-safety/food-safety-for-businesses/starting-a-food-business/)
- [Ontario home-based food-business guide](https://www.ontario.ca/files/2024-03/moh-guide-to-starting-home-based-food-business-en-2021-11-01.pdf)
