import { normalizeLocale } from '../../shared/src/i18n.mjs';
import { SAMPLE_FOOD_PHOTOS } from '../../shared/src/sampleFoodPhotos.mjs';

export class SofrehGuardError extends Error {
  constructor(code, message, httpStatus = 403) {
    super(message);
    this.name = 'SofrehGuardError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * Enforces that an authenticated user exists and has the required role ('CUSTOMER' or 'COOK').
 */
export function requireRole(authUser, expectedRole) {
  if (!authUser || !authUser.id) {
    throw new SofrehGuardError(
      'UNAUTHENTICATED',
      'Authentication token is required for this endpoint.',
      401
    );
  }
  if (authUser.role !== expectedRole) {
    throw new SofrehGuardError(
      'ROLE_FORBIDDEN',
      `Role boundary violation: endpoint requires role ${expectedRole}, but caller has role ${authUser.role}.`,
      403
    );
  }
}

/**
 * Enforces that a cook profile belongs to the authenticated COOK user.
 */
export function requireCookOwnership(authUser, cookRow) {
  requireRole(authUser, 'COOK');
  if (!cookRow) {
    throw new SofrehGuardError('NOT_FOUND', 'Cook profile not found.', 404);
  }
  if (cookRow.user_id !== authUser.id) {
    throw new SofrehGuardError(
      'COOK_OWNERSHIP_FORBIDDEN',
      'Privacy & role boundary violation: cook cannot access or modify another cook kitchen.',
      403
    );
  }
}

/**
 * Escapes HTML special characters to prevent XSS in persisted review text and user comments.
 */
export function escapeHtmlText(raw) {
  return String(raw ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitizes a cook profile and its dishes for public / customer discovery.
 * Strips: exact_pickup_address_private, user_id, phone_private, email_private.
 * Separates TODAY_AVAILABLE vs REGULAR_UNAVAILABLE dishes and attaches honest review aggregates.
 */
export function sanitizeCookForPublicDiscovery(
  cookRow,
  dishRows,
  locale = 'en-CA',
  reviewSummary = { reviewCount: 0, averageRating: null },
  reviews = []
) {
  const norm = normalizeLocale(locale);
  const kitchenNameLocalized = {
    'en-CA': cookRow.kitchen_name_en,
    'fa-IR': cookRow.kitchen_name_fa
  };
  const bioLocalized = {
    'en-CA': cookRow.bio_en,
    'fa-IR': cookRow.bio_fa
  };
  const pickupWindowLocalized = {
    'en-CA':
      cookRow.pickup_window_en ||
      (cookRow.supports_pickup
        ? `Pickup window in ${cookRow.neighborhood} (exact address shared after accepted pickup order)`
        : `Delivery-only kitchen in ${cookRow.neighborhood}`),
    'fa-IR':
      cookRow.pickup_window_fa ||
      (cookRow.supports_pickup
        ? `بازه تحویل حضوری در ${cookRow.neighborhood} (آدرس دقیق پس از تایید سفارش تحویل حضوری)`
        : `فقط ارسال با پیک در محدوده ${cookRow.neighborhood}`)
  };

  const mappedDishes = dishRows.map((d) => {
    const titleLocalized = {
      'en-CA': d.title_en,
      'fa-IR': d.title_fa
    };
    const descriptionLocalized = {
      'en-CA': d.description_en,
      'fa-IR': d.description_fa
    };
    const availabilityMode =
      d.availability_mode === 'REGULAR_UNAVAILABLE' ? 'REGULAR_UNAVAILABLE' : 'TODAY_AVAILABLE';
    const remainingPortions = Number(d.remaining_portions);
    const scheduleNoteLocalized = {
      'en-CA':
        d.schedule_note_en ||
        (availabilityMode === 'REGULAR_UNAVAILABLE'
          ? 'Regular menu item — not cooked today'
          : 'Cooked fresh today'),
      'fa-IR':
        d.schedule_note_fa ||
        (availabilityMode === 'REGULAR_UNAVAILABLE'
          ? 'غذای ثابت منو — امروز پخت نمی‌شود'
          : 'پخت تازه امروز')
    };

    return {
      id: d.id,
      cookId: d.cook_id,
      title: titleLocalized[norm],
      titleLocalized,
      description: descriptionLocalized[norm],
      descriptionLocalized,
      priceCents: Number(d.price_cents),
      totalPortions: Number(d.total_portions),
      remainingPortions,
      serviceWindowStartIso: d.service_window_start_iso,
      serviceWindowEndIso: d.service_window_end_iso,
      allergens: JSON.parse(d.allergens_json || '[]'),
      availabilityMode,
      isAvailableToday: availabilityMode === 'TODAY_AVAILABLE' && remainingPortions > 0,
      photoUrl: Object.hasOwn(SAMPLE_FOOD_PHOTOS, d.id) ? SAMPLE_FOOD_PHOTOS[d.id] : d.photo_url || '',
      isSamplePhoto: Object.hasOwn(SAMPLE_FOOD_PHOTOS, d.id),
      scheduleNote: scheduleNoteLocalized[norm],
      scheduleNoteLocalized
    };
  });

  const todayAvailableDishes = mappedDishes.filter(
    (d) => d.availabilityMode === 'TODAY_AVAILABLE'
  );
  const regularUnavailableDishes = mappedDishes.filter(
    (d) => d.availabilityMode === 'REGULAR_UNAVAILABLE'
  );

  const supportsPickup = Boolean(cookRow.supports_pickup);
  const supportsDelivery = Boolean(cookRow.supports_delivery);
  const exposesPublicExactAddress =
    supportsPickup &&
    Boolean(cookRow.pickup_address_consent) &&
    String(cookRow.public_address_visibility || 'AREA_ONLY') === 'PUBLIC_EXACT';
  const publicPickupAddress = exposesPublicExactAddress ? cookRow.exact_pickup_address_private : null;
  const pickupSummaryLabel =
    exposesPublicExactAddress
      ? norm === 'fa-IR'
        ? `آدرس تحویل حضوری: ${publicPickupAddress}`
        : `Pickup address: ${publicPickupAddress}`
      : norm === 'fa-IR'
      ? supportsPickup && supportsDelivery
        ? `محدوده تقریبی: ${cookRow.neighborhood} • تحویل حضوری و ارسال`
        : supportsPickup
          ? `محدوده تقریبی: ${cookRow.neighborhood} • فقط تحویل حضوری`
          : `محدوده تقریبی: ${cookRow.neighborhood} • فقط ارسال با پیک`
      : supportsPickup && supportsDelivery
        ? `Approx. area: ${cookRow.neighborhood} • Pickup & Delivery`
        : supportsPickup
          ? `Approx. area: ${cookRow.neighborhood} • Pickup only`
          : `Approx. area: ${cookRow.neighborhood} • Delivery only`;

  const honestReviewCount = Number(reviewSummary?.reviewCount || 0);
  const honestAvg =
    honestReviewCount > 0 && reviewSummary?.averageRating !== null && reviewSummary?.averageRating !== undefined
      ? Number(Number(reviewSummary.averageRating).toFixed(2))
      : null;

  return {
    id: cookRow.id,
    kitchenName: kitchenNameLocalized[norm],
    kitchenNameLocalized,
    bio: bioLocalized[norm],
    bioLocalized,
    neighborhood: cookRow.neighborhood,
    publicLat: Number(cookRow.public_lat),
    publicLng: Number(cookRow.public_lng),
    pickupWindowLabel: pickupWindowLocalized[norm],
    pickupWindowLocalized,
    pickupSummaryLabel,
    deliveryFeeCents: Number(cookRow.delivery_fee_cents),
    supportsPickup,
    supportsDelivery,
    pickupAddressVisibility: exposesPublicExactAddress ? 'PUBLIC_EXACT' : 'AREA_ONLY',
    ...(exposesPublicExactAddress ? { pickupAddress: publicPickupAddress } : {}),
    deliveryRadiusKm: Number(cookRow.delivery_radius_km),
    isSyntheticTestFixture: true,
    syntheticBadgeLabel: 'TEST ONLY',
    reviewSummary: {
      reviewCount: honestReviewCount,
      averageRating: honestAvg
    },
    reviews: Array.isArray(reviews) ? reviews : [],
    dishes: mappedDishes,
    todayAvailableDishes,
    regularUnavailableDishes
  };
}

const PICKUP_ADDRESS_RELEASE_STATUSES = new Set([
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED'
]);

const PICKUP_ADDRESS_RELEASE_PAYMENT_STATUSES = new Set([
  'SIMULATED_AUTHORIZED',
  'SIMULATED_PAID'
]);

/**
 * Sanitizes an order for the Customer Mobile App.
 * - Verifies the customer owns the order.
 * - Releases the cook's consented pickup address ONLY if:
 *   1) fulfillment_type === 'pickup' (delivery customers NEVER receive cook home/pickup address)
 *   2) cook has pickup_address_consent enabled
 *   3) the cook has accepted the order (status in ACCEPTED, PREPARING, READY, COMPLETED)
 *   4) simulated payment is authorized or paid (SIMULATED_AUTHORIZED or SIMULATED_PAID)
 * - Never exposes cook private phone/email or internal user_id.
 */
export function sanitizeOrderForCustomer(authUser, orderRow, itemRows, orderReviews = []) {
  requireRole(authUser, 'CUSTOMER');
  if (orderRow.customer_user_id !== authUser.id) {
    throw new SofrehGuardError(
      'PRIVACY_BOUNDARY_FORBIDDEN',
      'Customer cannot view an order belonging to another customer.',
      403
    );
  }

  const cookConsented =
    orderRow.pickup_address_consent === undefined ||
    orderRow.pickup_address_consent === null
      ? true
      : Boolean(orderRow.pickup_address_consent);

  const canReleasePickupAddress =
    orderRow.fulfillment_type === 'pickup' &&
    cookConsented &&
    PICKUP_ADDRESS_RELEASE_STATUSES.has(orderRow.status) &&
    PICKUP_ADDRESS_RELEASE_PAYMENT_STATUSES.has(orderRow.simulated_payment_status);

  return {
    id: orderRow.id,
    cookId: orderRow.cook_id,
    kitchenNameEn: orderRow.kitchen_name_en,
    kitchenNameFa: orderRow.kitchen_name_fa,
    status: orderRow.status,
    fulfillmentType: orderRow.fulfillment_type,
    subtotalCents: Number(orderRow.subtotal_cents),
    deliveryFeeCents: Number(orderRow.delivery_fee_cents),
    totalCents: Number(orderRow.total_cents),
    simulatedPaymentMethod: orderRow.simulated_payment_method,
    simulatedPaymentStatus: orderRow.simulated_payment_status,
    simulatedPaymentReference: orderRow.simulated_payment_reference,
    pickupAddressReleased: canReleasePickupAddress
      ? orderRow.exact_pickup_address_private
      : null,
    deliveryAddress:
      orderRow.fulfillment_type === 'delivery'
        ? orderRow.delivery_address_private
        : null,
    customerNotes: orderRow.customer_notes ?? null,
    isSyntheticTestOrder: true,
    syntheticBadgeLabel: 'TEST ONLY',
    createdAtIso: orderRow.created_at_iso,
    updatedAtIso: orderRow.updated_at_iso,
    items: itemRows.map((item) => ({
      dishId: item.dish_id,
      titleEn: item.title_en_snapshot,
      titleFa: item.title_fa_snapshot,
      quantity: Number(item.quantity),
      unitPriceCents: Number(item.unit_price_cents),
      lineTotalCents: Number(item.line_total_cents)
    })),
    reviews: Array.isArray(orderReviews) ? orderReviews : []
  };
}

const DELIVERY_ADDRESS_RELEASE_STATUSES = new Set([
  'ACCEPTED',
  'PREPARING',
  'READY',
  'COMPLETED'
]);

const DELIVERY_ADDRESS_RELEASE_PAYMENT_STATUSES = new Set([
  'SIMULATED_AUTHORIZED',
  'SIMULATED_PAID'
]);

/**
 * Sanitizes an order for the Cook Mobile App.
 * - Verifies the cook owns the kitchen for this order.
 * - Exposes customer delivery address ONLY when:
 *   1) fulfillment_type === 'delivery'
 *   2) order status is in ACCEPTED, PREPARING, READY, COMPLETED (never for PENDING, REJECTED, CANCELLED, or unknown status)
 *   3) simulated payment status is in SIMULATED_AUTHORIZED, SIMULATED_PAID (never for unauthorized/unpaid/refunded/unknown payment states)
 * - Strips customer payment reference, customer private phone, customer email, and customer user_id.
 */
export function sanitizeOrderForCook(authUser, cookRow, orderRow, itemRows, orderReviews = []) {
  requireCookOwnership(authUser, cookRow);
  if (orderRow.cook_id !== cookRow.id) {
    throw new SofrehGuardError(
      'PRIVACY_BOUNDARY_FORBIDDEN',
      'Cook cannot view an order belonging to another kitchen.',
      403
    );
  }

  const showDeliveryAddress =
    orderRow.fulfillment_type === 'delivery' &&
    DELIVERY_ADDRESS_RELEASE_STATUSES.has(orderRow.status) &&
    DELIVERY_ADDRESS_RELEASE_PAYMENT_STATUSES.has(orderRow.simulated_payment_status);

  return {
    id: orderRow.id,
    cookId: orderRow.cook_id,
    customerDisplayName: orderRow.customer_display_name,
    status: orderRow.status,
    fulfillmentType: orderRow.fulfillment_type,
    subtotalCents: Number(orderRow.subtotal_cents),
    deliveryFeeCents: Number(orderRow.delivery_fee_cents),
    totalCents: Number(orderRow.total_cents),
    simulatedPaymentStatus: orderRow.simulated_payment_status,
    deliveryAddressForFulfillment: showDeliveryAddress
      ? (orderRow.delivery_address_private ?? null)
      : null,
    customerNotes: orderRow.customer_notes ?? null,
    isSyntheticTestOrder: true,
    syntheticBadgeLabel: 'TEST ONLY',
    createdAtIso: orderRow.created_at_iso,
    updatedAtIso: orderRow.updated_at_iso,
    items: itemRows.map((item) => ({
      dishId: item.dish_id,
      titleEn: item.title_en_snapshot,
      titleFa: item.title_fa_snapshot,
      quantity: Number(item.quantity),
      unitPriceCents: Number(item.unit_price_cents),
      lineTotalCents: Number(item.line_total_cents)
    })),
    reviews: Array.isArray(orderReviews) ? orderReviews : []
  };
}
