/**
 * Real MapLibre GL + OpenFreeMap Geographic Configuration for Stage 1
 * Zero API keys, zero billing, real vector tiles from OpenFreeMap.
 */

export const MAPLIBRE_OPENFREEMAP_CONFIG = {
  provider: 'MapLibre + OpenFreeMap',
  styleUrl: 'https://tiles.openfreemap.org/styles/liberty',
  fallbackStyleUrl: 'https://tiles.openfreemap.org/styles/bright',
  requiresApiKey: false,
  billingEnabled: false,
  defaultCenter: {
    // North York / Yonge & Finch corridor (Toronto, ON) - synthetic fixture center
    lat: 43.7796,
    lng: -79.4156
  },
  defaultZoom: 12.2,
  defaultBounds: {
    minLat: 43.6200,
    maxLat: 43.9200,
    minLng: -79.6500,
    maxLng: -79.1500
  },
  attributionHtml:
    '© <a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
};

/**
 * Converts public cook discovery records into a valid GeoJSON FeatureCollection
 * for rendering on a MapLibre GL map layer or marker overlay.
 */
export function buildCookDiscoveryGeoJSON(cooks, locale = 'en-CA') {
  return {
    type: 'FeatureCollection',
    features: cooks.map((cook) => ({
      type: 'Feature',
      id: cook.id,
      geometry: {
        type: 'Point',
        // GeoJSON coordinates are [longitude, latitude]
        coordinates: [Number(cook.publicLng), Number(cook.publicLat)]
      },
      properties: {
        cookId: cook.id,
        kitchenName: cook.kitchenName,
        neighborhood: cook.neighborhood,
        pickupWindowLabel: cook.pickupWindowLabel || '',
        pickupSummaryLabel: cook.pickupSummaryLabel || cook.neighborhood,
        pickupAddressVisibility: cook.pickupAddressVisibility || 'AREA_ONLY',
        ...(cook.pickupAddressVisibility === 'PUBLIC_EXACT' && cook.pickupAddress
          ? { pickupAddress: cook.pickupAddress }
          : {}),
        deliveryFeeCents: cook.deliveryFeeCents,
        supportsPickup: Boolean(cook.supportsPickup),
        supportsDelivery: Boolean(cook.supportsDelivery),
        isSyntheticTestFixture: Boolean(cook.isSyntheticTestFixture),
        syntheticBadgeLabel: cook.isSyntheticTestFixture ? 'TEST ONLY' : '',
        activeDishCount: Array.isArray(cook.dishes) ? cook.dishes.length : 0,
        todayAvailableDishCount: Array.isArray(cook.todayAvailableDishes)
          ? cook.todayAvailableDishes.length
          : Array.isArray(cook.dishes)
            ? cook.dishes.filter((d) => d.availabilityMode !== 'REGULAR_UNAVAILABLE' && d.remainingPortions > 0).length
            : 0,
        reviewCount: cook.reviewSummary ? Number(cook.reviewSummary.reviewCount || 0) : 0,
        averageRating: cook.reviewSummary ? cook.reviewSummary.averageRating : null,
        locale
      }
    }))
  };
}
