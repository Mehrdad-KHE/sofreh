import {
  normalizeLocale,
  getDirection,
  isRTLLocale,
  t,
  formatCurrencyCents,
  MAPLIBRE_OPENFREEMAP_CONFIG,
  buildCookDiscoveryGeoJSON
} from '../../../packages/shared/src/index.mjs';

export const CUSTOMER_APP_IDENTITY = {
  appId: 'ca.sofreh.customer',
  appName: 'Sofreh Customer',
  appRole: 'CUSTOMER',
  stage: 'Stage 1',
  syntheticBadgeLabel: 'TEST ONLY',
  mapLibreConfig: MAPLIBRE_OPENFREEMAP_CONFIG
};

/**
 * Computes cart subtotal, cook-set delivery fee (applied only when fulfillmentType === 'delivery'),
 * and total in cents for the Customer Mobile App checkout.
 */
export function calculateCustomerCartTotals(cook, cartItems, fulfillmentType = 'pickup') {
  if (!cook) {
    return { subtotalCents: 0, deliveryFeeCents: 0, totalCents: 0 };
  }
  const dishMap = new Map((cook.dishes || []).map((d) => [d.id, d]));
  let subtotalCents = 0;

  for (const item of cartItems || []) {
    const dish = dishMap.get(item.dishId);
    const qty = Number(item.quantity || 0);
    if (dish && qty > 0) {
      subtotalCents += Number(dish.priceCents) * qty;
    }
  }

  const deliveryFeeCents =
    fulfillmentType === 'delivery' && subtotalCents > 0
      ? Number(cook.deliveryFeeCents || 0)
      : 0;

  return {
    subtotalCents,
    deliveryFeeCents,
    totalCents: subtotalCents + deliveryFeeCents
  };
}

/**
 * Builds the localized view model for the Customer Mobile App in either en-CA (LTR) or fa-IR (RTL).
 */
export function buildCustomerScreenViewModel({
  locale = 'en-CA',
  cooks = [],
  selectedCookId = null,
  cartItems = [],
  fulfillmentType = 'pickup',
  deliveryAddress = '',
  orders = []
} = {}) {
  const activeLocale = normalizeLocale(locale);
  const direction = getDirection(activeLocale);
  const isRTL = isRTLLocale(activeLocale);

  const selectedCook =
    cooks.find((c) => c.id === selectedCookId) || cooks[0] || null;

  const totals = calculateCustomerCartTotals(
    selectedCook,
    cartItems,
    fulfillmentType
  );

  return {
    appIdentity: CUSTOMER_APP_IDENTITY,
    locale: activeLocale,
    direction,
    isRTL,
    labels: {
      title: t(activeLocale, 'app.customer.title'),
      subtitle: t(activeLocale, 'app.customer.subtitle'),
      testOnlyBanner: t(activeLocale, 'banner.testOnly'),
      mapTitle: t(activeLocale, 'map.title'),
      mapAttribution: t(activeLocale, 'map.attribution'),
      privacyNotice: t(activeLocale, 'privacy.notice.customer'),
      checkoutTitle: t(activeLocale, 'checkout.title'),
      pickupOption: t(activeLocale, 'checkout.fulfillment.pickup'),
      deliveryOption: t(activeLocale, 'checkout.fulfillment.delivery'),
      simulatedPaymentNotice: t(activeLocale, 'checkout.simulatedPaymentNotice'),
      placeOrderButton: t(activeLocale, 'checkout.placeOrder')
    },
    mapView: {
      provider: MAPLIBRE_OPENFREEMAP_CONFIG.provider,
      styleUrl: MAPLIBRE_OPENFREEMAP_CONFIG.styleUrl,
      center: MAPLIBRE_OPENFREEMAP_CONFIG.defaultCenter,
      zoom: MAPLIBRE_OPENFREEMAP_CONFIG.defaultZoom,
      requiresApiKey: false,
      geoJson: buildCookDiscoveryGeoJSON(cooks, activeLocale)
    },
    selectedCook,
    checkout: {
      fulfillmentType,
      deliveryAddress,
      subtotalCents: totals.subtotalCents,
      deliveryFeeCents: totals.deliveryFeeCents,
      totalCents: totals.totalCents,
      subtotalFormatted: formatCurrencyCents(totals.subtotalCents, activeLocale),
      deliveryFeeFormatted: formatCurrencyCents(totals.deliveryFeeCents, activeLocale),
      totalFormatted: formatCurrencyCents(totals.totalCents, activeLocale)
    },
    orders: orders.map((ord) => ({
      ...ord,
      statusLabel: t(activeLocale, `order.status.${ord.status}`),
      totalFormatted: formatCurrencyCents(ord.totalCents, activeLocale),
      pickupDisclosureMessage: ord.pickupAddressReleased
        ? `${t(activeLocale, 'order.pickupAddressReleased')}: ${ord.pickupAddressReleased}`
        : t(activeLocale, 'order.pickupAddressHidden')
    }))
  };
}
