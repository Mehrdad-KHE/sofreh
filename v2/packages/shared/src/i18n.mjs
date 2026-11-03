/**
 * Stage 1 Localization Engine: en-CA (LTR) and fa-IR (RTL)
 */

export const SUPPORTED_LOCALES = ['en-CA', 'fa-IR'];

export const LOCALE_METADATA = {
  'en-CA': {
    code: 'en-CA',
    label: 'English (Canada)',
    nativeLabel: 'English (CA)',
    dir: 'ltr',
    isRTL: false,
    currency: 'CAD'
  },
  'fa-IR': {
    code: 'fa-IR',
    label: 'Persian (Iran)',
    nativeLabel: 'فارسی',
    dir: 'rtl',
    isRTL: true,
    currency: 'CAD'
  }
};

export const DICTIONARY = {
  'en-CA': {
    'app.customer.title': 'Sofreh Customer',
    'app.customer.subtitle': 'Home-Cooked Persian Food Discovery',
    'app.cook.title': 'Sofreh Cook Studio',
    'app.cook.subtitle': 'Kitchen, Portions, Delivery Fee & Order Queue',
    'banner.testOnly': 'TEST ONLY — Synthetic Stage 1 Cook Fixtures & Simulated Payment',
    'locale.switchToFa': 'فارسی (RTL)',
    'locale.switchToEn': 'English (LTR)',
    'map.title': 'Nearby Home Kitchens (OpenFreeMap + MapLibre)',
    'map.attribution': 'MapLibre GL • OpenFreeMap Vector Tiles (OSM)',
    'map.syntheticPinBadge': 'TEST ONLY',
    'cook.deliveryFee': 'Cook-Set Delivery Fee',
    'cook.freePickup': 'Pickup (No Fee)',
    'cook.deliveryRadius': 'Delivery Radius',
    'dish.remainingPortions': 'portions left',
    'dish.soldOut': 'Sold Out',
    'dish.addToOrder': 'Add Portion',
    'checkout.title': 'Order Summary & Simulated Payment',
    'checkout.fulfillment.pickup': 'Self Pickup',
    'checkout.fulfillment.delivery': 'Home Delivery (Cook-Set Fee)',
    'checkout.deliveryAddressLabel': 'Delivery Street Address',
    'checkout.subtotal': 'Dishes Subtotal',
    'checkout.deliveryFee': 'Cook-Set Delivery Fee',
    'checkout.total': 'Total (CAD)',
    'checkout.simulatedPaymentNotice': 'Simulated Stage 1 Checkout — No real card or bank charge is performed.',
    'checkout.placeOrder': 'Place Order (Simulated Pay)',
    'order.status.PENDING': 'Pending Cook Acceptance',
    'order.status.ACCEPTED': 'Accepted by Cook',
    'order.status.PREPARING': 'Preparing in Kitchen',
    'order.status.READY': 'Ready for Pickup / Handoff',
    'order.status.COMPLETED': 'Completed',
    'order.status.REJECTED': 'Declined (Simulated Refund Issued)',
    'order.status.CANCELLED': 'Cancelled (Simulated Refund Issued)',
    'order.pickupAddressHidden': 'Exact pickup address is protected until the cook accepts your order.',
    'order.pickupAddressReleased': 'Confirmed Pickup Address',
    'cookStudio.deliveryFeeSetting': 'Set Your Kitchen Delivery Fee (CAD)',
    'cookStudio.updateDeliveryFee': 'Save Delivery Fee',
    'cookStudio.incomingOrders': 'Incoming Customer Orders',
    'cookStudio.acceptOrder': 'Accept Order',
    'cookStudio.startPreparing': 'Start Preparing',
    'cookStudio.markReady': 'Mark Ready',
    'cookStudio.completeOrder': 'Complete Order',
    'cookStudio.rejectOrder': 'Reject & Restore Portions',
    'privacy.notice.customer': 'Privacy Protected: Approximate neighborhood pin only until pickup confirmation.',
    'privacy.notice.cook': 'Privacy Protected: Customer address shown only for delivery fulfillment.'
  },
  'fa-IR': {
    'app.customer.title': 'سفره — برنامه مشتری',
    'app.customer.subtitle': 'کشف غذای خانگی ایرانی در محله شما',
    'app.cook.title': 'سفره — پنل آشپز',
    'app.cook.subtitle': 'مدیریت آشپزخانه، ظرفیت پخت، هزینه ارسال و سفارش‌ها',
    'banner.testOnly': 'فقط آزمایشی (TEST ONLY) — داده‌های مصنوعی مرحله ۱ و پرداخت شبیه‌سازی‌شده',
    'locale.switchToFa': 'فارسی (راست‌به‌چپ)',
    'locale.switchToEn': 'English (LTR)',
    'map.title': 'آشپزخانه‌های خانگی اطراف (نقشه OpenFreeMap + MapLibre)',
    'map.attribution': 'MapLibre GL • کاشی‌های برداری OpenFreeMap (OSM)',
    'map.syntheticPinBadge': 'فقط آزمایشی (TEST ONLY)',
    'cook.deliveryFee': 'هزینه ارسال تعیین‌شده توسط آشپز',
    'cook.freePickup': 'تحویل حضوری (رایگان)',
    'cook.deliveryRadius': 'شعاع ارسال',
    'dish.remainingPortions': 'پرس باقی‌مانده',
    'dish.soldOut': 'تمام شد',
    'dish.addToOrder': 'افزودن به سفارش',
    'checkout.title': 'خلاصه سفارش و پرداخت شبیه‌سازی‌شده',
    'checkout.fulfillment.pickup': 'تحویل حضوری توسط مشتری',
    'checkout.fulfillment.delivery': 'ارسال به آدرس (با نرخ آشپز)',
    'checkout.deliveryAddressLabel': 'آدرس دقیق تحویل سفارش',
    'checkout.subtotal': 'جمع غذاها',
    'checkout.deliveryFee': 'هزینه ارسال آشپز',
    'checkout.total': 'مبلغ کل (دلار کانادا)',
    'checkout.simulatedPaymentNotice': 'پرداخت شبیه‌سازی‌شده مرحله ۱ — هیچ وجه واقعی کسر نمی‌شود.',
    'checkout.placeOrder': 'ثبت سفارش (پرداخت آزمایشی)',
    'order.status.PENDING': 'در انتظار تایید آشپز',
    'order.status.ACCEPTED': 'تاییدشده توسط آشپز',
    'order.status.PREPARING': 'در حال پخت و آماده‌سازی',
    'order.status.READY': 'آماده تحویل',
    'order.status.COMPLETED': 'تکمیل‌شده',
    'order.status.REJECTED': 'رد شده (بازگشت وجه آزمایشی)',
    'order.status.CANCELLED': 'لغو شده (بازگشت وجه آزمایشی)',
    'order.pickupAddressHidden': 'آدرس دقیق تحویل حضوری تا زمان تایید سفارش توسط آشپز محرمانه است.',
    'order.pickupAddressReleased': 'آدرس تاییدشده تحویل حضوری',
    'cookStudio.deliveryFeeSetting': 'تعیین هزینه ارسال آشپزخانه (دلار کانادا)',
    'cookStudio.updateDeliveryFee': 'ذخیره هزینه ارسال',
    'cookStudio.incomingOrders': 'سفارش‌های دریافتی مشتریان',
    'cookStudio.acceptOrder': 'قبول سفارش',
    'cookStudio.startPreparing': 'شروع آماده‌سازی',
    'cookStudio.markReady': 'آماده تحویل',
    'cookStudio.completeOrder': 'تکمیل سفارش',
    'cookStudio.rejectOrder': 'رد سفارش و بازگردانی ظرفیت',
    'privacy.notice.customer': 'حریم خصوصی: فقط موقعیت تقریبی محله نمایش داده می‌شود.',
    'privacy.notice.cook': 'حریم خصوصی: آدرس مشتری فقط در سفارش‌های ارسالی نمایش داده می‌شود.'
  }
};

export function normalizeLocale(locale) {
  if (locale === 'fa-IR' || locale === 'fa') return 'fa-IR';
  return 'en-CA';
}

export function getDirection(locale) {
  const norm = normalizeLocale(locale);
  return LOCALE_METADATA[norm].dir;
}

export function isRTLLocale(locale) {
  return getDirection(locale) === 'rtl';
}

export function t(locale, key) {
  const norm = normalizeLocale(locale);
  const table = DICTIONARY[norm] || DICTIONARY['en-CA'];
  return table[key] ?? DICTIONARY['en-CA'][key] ?? key;
}

const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

export function toPersianDigits(input) {
  return String(input).replace(/\d/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

export function formatCurrencyCents(cents, locale = 'en-CA') {
  const norm = normalizeLocale(locale);
  const dollars = (Number(cents) / 100).toFixed(2);
  if (norm === 'fa-IR') {
    return `${toPersianDigits(dollars)} $ کانادا`;
  }
  return `CA$${dollars}`;
}

export function pickLocalizedText(localizedObj, locale = 'en-CA') {
  const norm = normalizeLocale(locale);
  if (!localizedObj) return '';
  return localizedObj[norm] || localizedObj['en-CA'] || '';
}
