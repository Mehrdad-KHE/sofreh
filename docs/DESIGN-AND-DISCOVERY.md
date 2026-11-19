# Design, accessibility, SEO and GEO

## Product design direction

Use a warm, recognizable Sofreh identity across customer, cook and website experiences. Existing cream, pomegranate and saffron tones provide a starting palette. For the broader Toronto audience, provide complete English and Persian content, consistent type hierarchy, inclusive meal photography and clear distinctions between seller identity, actual food and illustrative imagery.

Customer cards should help a person decide: meal, cook, price, portion, availability, approximate location and fulfillment window. Cook screens should prioritize incoming orders and the next action; editing a large menu must not obscure the order queue.

Recommended patterns come from public product documentation, not independent conversion experiments:

- [Cookin](https://www.cookin.com/features): configurable menu, fulfillment and business operations.
- [Shef ordering](https://help.shef.com/en/articles/8009531-how-does-shef-work): location, menu and delivery-window clarity. Its chilled/subscription model is not automatically Sofreh's model.
- [Hotplate](https://www.hotplate.com/product): inventory, prep lists and scheduled order management.
- [Uber Eats Orders](https://merchants.ubereats.com/us/en/technology/manage-orders/uber-eats-orders-app/): operational order actions and web/app access.

## Location and distance

Label a distance computed from a public kitchen area as approximate. Do not present straight-line distance as road distance or travel time. Time until a meal arrives also includes preparation and fulfillment; routing duration alone does not establish it.

Customer discovery offers a manual area origin, permission-gated device location and nearest-area sorting. Distances use the public kitchen coordinates and are calculated in browser memory. This is an approximate straight-line estimate, not a delivery-coverage decision.

Provide manual area selection when device location is denied or unavailable. Keep the current prohibition on transmitting precise device coordinates unless a reviewed privacy contract explicitly changes it. Public map markers, API responses and SEO metadata must not disclose a private pickup address without the applicable consent and access rules.

## Accessibility and performance

Use 44–48 logical-unit controls for important touch interactions as a project design target. WCAG 2.2 AA's minimum target criterion is 24 CSS pixels with exceptions; 44px is the enhanced criterion, not the AA minimum. Check keyboard focus, contrast, screen-reader labels, reduced motion, text expansion and both writing directions.

Performance targets are LCP at or below 2.5 seconds, INP at or below 200 milliseconds, and CLS at or below 0.1. Lab tests help development; field data and the measurement percentile must be distinguished when reporting Core Web Vitals.

- [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
- [Google Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)

## Search and generative discovery

The HTTP catalogue serves `/en` and `/fa` as complete server-rendered pages. `/` and the historical `/showcase` entry redirect to `/en`. Each language has a self-canonical, reciprocal alternatives, social metadata and Organization JSON-LD. `/sitemap.xml` lists only the two catalogue URLs; `/robots.txt` excludes API and account-preview paths. Catalogue app links retain the selected language. This metadata does not bypass hosting protection: public crawling still requires a publicly accessible deployment.

On 2026-11-09, the owner approved public access to the main production alias with protected previews. Anonymous checks confirmed both catalogue pages, sitemap, robots and social image assets; neither catalogue response carried a noindex directive. A fresh browser checked Persian/English at mobile and desktop widths, loaded the food images and found no horizontal overflow or automated axe WCAG A/AA violations. These checks establish availability and baseline page quality, not indexing, ranking, screen-reader certification or generative-search citations.

The public catalogue was then measured with Lighthouse 13.6.0 on standard Linux CI, Chrome 156, using simulated mobile conditions. [Baseline run](https://github.com/Mehrdad-KHE/sofreh/actions/runs/42745534562) and [optimized run](https://github.com/Mehrdad-KHE/sofreh/actions/runs/42746709678) recorded the following:

| Check | Persian before → after | English before → after |
| --- | --- | --- |
| Performance score | 96 → 99 | 92 → 99 |
| Accessibility / best practices / SEO | 100 / 100 / 100 → unchanged | 100 / 100 / 100 → unchanged |
| Cumulative layout shift | 0.127 → 0 | 0.028 → 0 |
| Largest contentful paint | 1.47s → 2.04s | 1.41s → 2.03s |

Persian page transfer fell from 4,696,438 to 290,586 bytes, a 93.8% reduction. Responsive WebP assets retain the original photographs and attribution; source JPEGs remain available. The font is preloaded with optional swapping to avoid moving Persian text after the first paint, and image height now follows the responsive aspect ratio. All images loaded at 390, 850 and 1440px without horizontal overflow. The slower measured LCP in the second run remains within 2.5s; these single-run laboratory values vary and are not real-user field measurements. The generated HTML report was opened for visual review. Re-run after material content or hosting changes instead of treating these scores as a permanent guarantee.

Provide independently accessible English and Persian pages, natural page titles and descriptions, reciprocal `hreflang`, appropriate canonical URLs, crawlable internal links and useful visible text. Describe actual service areas; do not mass-generate empty neighborhood pages.

Use structured data only for the real entity and visible content. Organization metadata can describe the platform; restaurant/local-business metadata must not fabricate a seller, rating, address or qualification. Do not publish private kitchen coordinates or addresses to obtain a search enhancement.

GEO means eligibility for useful reference in generative search answers. Google does not require a special AI text file or special schema for its AI search features. Accurate, helpful, crawlable content remains the foundation. Neither ranking nor AI citation is guaranteed.

Evaluate acquisition through meaningful actions such as discovery, cart addition and completion, with an approved analytics/privacy design. A visually polished page alone does not establish customer demand or improved conversion.

- [Localized pages](https://developers.google.com/search/docs/specialty/international/localized-versions)
- [Google AI search features](https://developers.google.com/search/docs/appearance/ai-features)
- [Organization metadata](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Local-business metadata](https://developers.google.com/search/docs/appearance/structured-data/local-business)
- [Bing webmaster guidelines](https://www.bing.com/webmasters/help/bing-webmaster-guidelines-30fba23a)
