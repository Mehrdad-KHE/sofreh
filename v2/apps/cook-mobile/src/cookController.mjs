import {
  normalizeLocale,
  getDirection,
  isRTLLocale,
  t,
  formatCurrencyCents
} from '../../../packages/shared/src/index.mjs';

export const COOK_APP_IDENTITY = {
  appId: 'ca.sofreh.cook',
  appName: 'Sofreh Cook',
  appRole: 'COOK',
  stage: 'Stage 1',
  syntheticBadgeLabel: 'TEST ONLY'
};

export function getAvailableCookActionsForOrder(status) {
  switch (status) {
    case 'PENDING':
      return ['ACCEPTED', 'REJECTED'];
    case 'ACCEPTED':
      return ['PREPARING', 'READY', 'CANCELLED'];
    case 'PREPARING':
      return ['READY', 'CANCELLED'];
    case 'READY':
      return ['COMPLETED'];
    default:
      return [];
  }
}

export function buildCookScreenViewModel({
  locale = 'en-CA',
  kitchen = null,
  orders = []
} = {}) {
  const activeLocale = normalizeLocale(locale);
  const direction = getDirection(activeLocale);
  const isRTL = isRTLLocale(activeLocale);

  return {
    appIdentity: COOK_APP_IDENTITY,
    locale: activeLocale,
    direction,
    isRTL,
    labels: {
      title: t(activeLocale, 'app.cook.title'),
      subtitle: t(activeLocale, 'app.cook.subtitle'),
      testOnlyBanner: t(activeLocale, 'banner.testOnly'),
      deliveryFeeSetting: t(activeLocale, 'cookStudio.deliveryFeeSetting'),
      updateDeliveryFee: t(activeLocale, 'cookStudio.updateDeliveryFee'),
      incomingOrders: t(activeLocale, 'cookStudio.incomingOrders'),
      privacyNotice: t(activeLocale, 'privacy.notice.cook'),
      acceptOrder: t(activeLocale, 'cookStudio.acceptOrder'),
      startPreparing: t(activeLocale, 'cookStudio.startPreparing'),
      markReady: t(activeLocale, 'cookStudio.markReady'),
      completeOrder: t(activeLocale, 'cookStudio.completeOrder'),
      rejectOrder: t(activeLocale, 'cookStudio.rejectOrder')
    },
    kitchen: kitchen
      ? {
          ...kitchen,
          deliveryFeeFormatted: formatCurrencyCents(
            kitchen.deliveryFeeCents,
            activeLocale
          )
        }
      : null,
    orders: orders.map((ord) => ({
      ...ord,
      statusLabel: t(activeLocale, `order.status.${ord.status}`),
      totalFormatted: formatCurrencyCents(ord.totalCents, activeLocale),
      deliveryFeeFormatted: formatCurrencyCents(ord.deliveryFeeCents, activeLocale),
      availableNextStatuses: getAvailableCookActionsForOrder(ord.status)
    }))
  };
}
