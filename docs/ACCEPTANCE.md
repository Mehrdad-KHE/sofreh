# Product acceptance criteria

These criteria define the agreed result. Their presence does not assert that every criterion has passed. Record version-specific execution evidence in the internal release record.

| ID | Required behavior | Verification |
| --- | --- | --- |
| A01 | Complete English and Persian customer/cook journeys | Execute the same journey in both locales; check direction, text expansion and errors |
| A02 | Actual account and role isolation | Register/sign in, recover session, reject another user's address/order and another cook's actions |
| A03 | Nearby discovery with honest distance | Change location/area, deny permission, compare ordering and labels; preserve kitchen privacy |
| A04 | Accurate menu and checkout | Portion, price, availability, allergens, pickup/delivery, fee and final total agree |
| A05 | One shared order | Customer submits; owning cook receives the same identifier; status returns to the customer |
| A06 | Transactional inventory | Race for the last portion, retry with the same key, reject/cancel once; no oversell or duplicate order |
| A07 | Persistent shared state | Restart the backend and exercise separate hosted instances/clients; recover the same order and settings |
| A08 | Cook operation on phone and desktop | Process queue, change capacity and fulfillment without unusable overflow or blocked actions |
| A09 | Reliable notification handling | Test active, background, locked-device, permission-denied and reconnect scenarios; no duplicate order creation |
| A10 | Android customer and cook builds | Install each on Galaxy S22; execute the shared order journey and test permissions/restart |
| A11 | iOS customer and cook builds | Simulator layout/navigation checks followed by real-device cloud tests; report hardware-dependent coverage separately |
| A12 | Product website | Explain service, show real navigation to customer/cook paths, support both languages and validate links |
| A13 | Search readiness | Inspect public HTML, titles, canonical/locales, crawl rules, sitemap and truthful structured data |
| A14 | Accessible interaction | Keyboard/focus, screen-reader smoke checks, readable contrast, touch targets and reduced motion |
| A15 | Simulated payment | Clearly display test payment, no real money movement, coherent success/refund state |
| A16 | Released URL | Verify the exact deployed revision, expected health JSON and customer/cook round trip after publication |

Use synthetic data during class testing. Record observed behavior, test device/environment, build identity and reproducible steps. Automated DOM/backend checks, real browser interaction, native builds and actual phone tests are separate evidence types.
