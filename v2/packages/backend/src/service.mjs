import crypto from 'node:crypto';
import {
  SYNTHETIC_TEST_USERS,
  SYNTHETIC_TEST_COOKS,
  SYNTHETIC_TEST_DISHES
} from '../../shared/src/fixtures.mjs';
import { buildCookDiscoveryGeoJSON } from '../../shared/src/mapConfig.mjs';
import { normalizeLocale } from '../../shared/src/i18n.mjs';
import { withImmediateTransaction } from './db.mjs';
import { enqueueOrderNotification } from './notifications.mjs';
import {
  SofrehGuardError,
  requireRole,
  requireCookOwnership,
  escapeHtmlText,
  sanitizeCookForPublicDiscovery,
  sanitizeOrderForCustomer,
  sanitizeOrderForCook
} from './privacy.mjs';

/**
 * Seeds the Stage 1 synthetic TEST ONLY users, cooks, and dishes inside a BEGIN IMMEDIATE transaction.
 * Preserves existing remaining_portions and cook delivery_fee_cents if orders already exist in the database
 * (protecting live sofreh-stage1.sqlite state such as ord-aa83c3f9).
 */
export function seedSyntheticStage1Data(db) {
  return withImmediateTransaction(db, () => {
    const nowIso = new Date().toISOString();
    const orderCountRow = db.prepare(`SELECT COUNT(*) AS cnt FROM orders`).get();
    const hasExistingOrders = Number(orderCountRow?.cnt || 0) > 0;

    const upsertUser = db.prepare(`
      INSERT INTO users (id, role, display_name, phone_private, email_private, preferred_locale, auth_token, created_at_iso)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        role = excluded.role,
        display_name = excluded.display_name,
        preferred_locale = excluded.preferred_locale,
        auth_token = excluded.auth_token
    `);

    for (const u of SYNTHETIC_TEST_USERS) {
      upsertUser.run(
        u.id,
        u.role,
        u.displayName,
        u.phonePrivate,
        u.emailPrivate,
        u.preferredLocale,
        u.authToken,
        nowIso
      );
    }

    const upsertCook = db.prepare(`
      INSERT INTO cook_profiles (
        id, user_id, kitchen_name_en, kitchen_name_fa, bio_en, bio_fa,
        neighborhood, public_lat, public_lng, exact_pickup_address_private,
        public_address_visibility, pickup_address_consent, pickup_window_en, pickup_window_fa,
        delivery_fee_cents, supports_pickup, supports_delivery, delivery_radius_km,
        is_synthetic_test_fixture, synthetic_badge_label, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'TEST ONLY', ?)
      ON CONFLICT(id) DO UPDATE SET
        kitchen_name_en = excluded.kitchen_name_en,
        kitchen_name_fa = excluded.kitchen_name_fa,
        bio_en = excluded.bio_en,
        bio_fa = excluded.bio_fa,
        public_address_visibility = excluded.public_address_visibility,
        pickup_address_consent = excluded.pickup_address_consent,
        pickup_window_en = excluded.pickup_window_en,
        pickup_window_fa = excluded.pickup_window_fa,
        delivery_fee_cents = CASE WHEN ? = 1 THEN cook_profiles.delivery_fee_cents ELSE excluded.delivery_fee_cents END,
        supports_pickup = excluded.supports_pickup,
        supports_delivery = excluded.supports_delivery,
        updated_at_iso = excluded.updated_at_iso
    `);

    for (const c of SYNTHETIC_TEST_COOKS) {
      upsertCook.run(
        c.id,
        c.userId,
        c.kitchenNameEn,
        c.kitchenNameFa,
        c.bioEn,
        c.bioFa,
        c.neighborhood,
        c.publicLat,
        c.publicLng,
        c.exactPickupAddressPrivate,
        c.publicAddressVisibility || 'AREA_ONLY',
        c.pickupAddressConsent === false ? 0 : 1,
        c.pickupWindowEn || '',
        c.pickupWindowFa || '',
        c.deliveryFeeCents,
        c.supportsPickup ? 1 : 0,
        c.supportsDelivery ? 1 : 0,
        c.deliveryRadiusKm,
        nowIso,
        hasExistingOrders ? 1 : 0
      );
    }

    const upsertDish = db.prepare(`
      INSERT INTO dish_slots (
        id, cook_id, title_en, title_fa, description_en, description_fa,
        price_cents, total_portions, remaining_portions,
        service_window_start_iso, service_window_end_iso, allergens_json,
        availability_mode, photo_url, schedule_note_en, schedule_note_fa,
        is_active, updated_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title_en = excluded.title_en,
        title_fa = excluded.title_fa,
        description_en = excluded.description_en,
        description_fa = excluded.description_fa,
        price_cents = excluded.price_cents,
        total_portions = excluded.total_portions,
        remaining_portions = CASE WHEN ? = 1 THEN dish_slots.remaining_portions ELSE excluded.remaining_portions END,
        availability_mode = excluded.availability_mode,
        photo_url = excluded.photo_url,
        schedule_note_en = excluded.schedule_note_en,
        schedule_note_fa = excluded.schedule_note_fa,
        is_active = excluded.is_active,
        updated_at_iso = excluded.updated_at_iso
    `);

    for (const d of SYNTHETIC_TEST_DISHES) {
      upsertDish.run(
        d.id,
        d.cookId,
        d.titleEn,
        d.titleFa,
        d.descriptionEn,
        d.descriptionFa,
        d.priceCents,
        d.totalPortions,
        d.remainingPortions,
        d.serviceWindowStartIso,
        d.serviceWindowEndIso,
        JSON.stringify(d.allergens || []),
        d.availabilityMode === 'REGULAR_UNAVAILABLE' ? 'REGULAR_UNAVAILABLE' : 'TODAY_AVAILABLE',
        d.photoUrl || '',
        d.scheduleNoteEn || '',
        d.scheduleNoteFa || '',
        d.isActive ? 1 : 0,
        nowIso,
        hasExistingOrders ? 1 : 0
      );
    }

    // Repair synthetic order snapshots when a previous fixture was written with
    // a broken Persian encoding. New orders already snapshot from dish_slots;
    // Repair only demonstrably corrupted Persian text; valid snapshots remain
    // historical even when a fixture's current title changes.
    db.prepare(`
      UPDATE order_items
      SET title_fa_snapshot = (SELECT title_fa FROM dish_slots WHERE dish_slots.id = order_items.dish_id)
      WHERE (instr(title_fa_snapshot,char(65533)) > 0 OR instr(title_fa_snapshot,'Ø') > 0 OR instr(title_fa_snapshot,'Ù') > 0)
      AND EXISTS (
        SELECT 1 FROM orders
        WHERE orders.id = order_items.order_id
          AND orders.is_synthetic_test_order = 1
      )
    `).run();

    return {
      seededUsers: SYNTHETIC_TEST_USERS.length,
      seededCooks: SYNTHETIC_TEST_COOKS.length,
      seededDishes: SYNTHETIC_TEST_DISHES.length
    };
  });
}

export function authenticateByToken(db, authToken) {
  if (!authToken) return null;
  const row = db
    .prepare(
      `SELECT id, role, display_name, preferred_locale, auth_token FROM users WHERE auth_token = ?`
    )
    .get(String(authToken).trim());
  if (!row) return null;
  return {
    id: row.id,
    role: row.role,
    displayName: row.display_name,
    preferredLocale: row.preferred_locale,
    authToken: row.auth_token
  };
}

function mapReviewRow(row) {
  return {
    id: row.id,
    orderId: row.order_id,
    reviewerUserId: row.reviewer_user_id,
    reviewerDisplayName: row.reviewer_display_name || row.reviewer_role,
    reviewerRole: row.reviewer_role,
    targetCookId: row.target_cook_id,
    direction: row.direction,
    rating: Number(row.rating),
    commentEscaped: row.comment_escaped,
    createdAtIso: row.created_at_iso
  };
}

export function getCookHonestReviewSummaryAndList(db, cookId) {
  const aggRow = db
    .prepare(
      `SELECT COUNT(*) AS review_count, AVG(rating) AS avg_rating
       FROM order_reviews
       WHERE target_cook_id = ? AND direction = 'CUSTOMER_TO_COOK'`
    )
    .get(cookId);

  const reviewCount = Number(aggRow?.review_count || 0);
  const averageRating =
    reviewCount > 0 && aggRow?.avg_rating !== null && aggRow?.avg_rating !== undefined
      ? Number(Number(aggRow.avg_rating).toFixed(2))
      : null;

  const reviewRows = db
    .prepare(
      `SELECT r.*, u.display_name AS reviewer_display_name
       FROM order_reviews r
       JOIN users u ON u.id = r.reviewer_user_id
       WHERE r.target_cook_id = ? AND r.direction = 'CUSTOMER_TO_COOK'
       ORDER BY r.created_at_iso DESC`
    )
    .all(cookId);

  return {
    reviewSummary: {
      reviewCount,
      averageRating
    },
    reviews: reviewRows.map(mapReviewRow)
  };
}

export function listOrderReviewsForOrder(db, orderId) {
  const rows = db
    .prepare(
      `SELECT r.*, u.display_name AS reviewer_display_name
       FROM order_reviews r
       JOIN users u ON u.id = r.reviewer_user_id
       WHERE r.order_id = ?
       ORDER BY r.created_at_iso ASC`
    )
    .all(orderId);
  return rows.map(mapReviewRow);
}

/**
 * Lists public synthetic cook fixtures and their active dish slots for Customer MapLibre discovery.
 * Includes TODAY_AVAILABLE and REGULAR_UNAVAILABLE dishes plus honest SQLite review aggregates.
 */
export function listPublicDiscoveryCooks(db, { locale = 'en-CA', bounds = null } = {}) {
  let cookRows;
  if (
    bounds &&
    Number.isFinite(bounds.minLat) &&
    Number.isFinite(bounds.maxLat) &&
    Number.isFinite(bounds.minLng) &&
    Number.isFinite(bounds.maxLng)
  ) {
    cookRows = db
      .prepare(
        `SELECT * FROM cook_profiles
         WHERE public_lat BETWEEN ? AND ?
           AND public_lng BETWEEN ? AND ?
         ORDER BY id ASC`
      )
      .all(bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng);
  } else {
    cookRows = db.prepare(`SELECT * FROM cook_profiles ORDER BY id ASC`).all();
  }

  const dishStmt = db.prepare(
    `SELECT * FROM dish_slots
     WHERE cook_id = ? AND is_active = 1
     ORDER BY CASE WHEN availability_mode = 'TODAY_AVAILABLE' THEN 0 ELSE 1 END, id ASC`
  );

  const cooks = cookRows.map((cookRow) => {
    const dishes = dishStmt.all(cookRow.id);
    const { reviewSummary, reviews } = getCookHonestReviewSummaryAndList(db, cookRow.id);
    return sanitizeCookForPublicDiscovery(cookRow, dishes, locale, reviewSummary, reviews);
  });

  return {
    locale,
    isSyntheticTestDataset: true,
    syntheticBadgeLabel: 'TEST ONLY',
    cooks,
    geoJson: buildCookDiscoveryGeoJSON(cooks, locale)
  };
}

/**
 * Allows an authenticated COOK to update their own kitchen's cook-set delivery fee and fulfillment options.
 */
export function updateCookDeliverySettings(
  db,
  authUser,
  { cookId, deliveryFeeCents, supportsDelivery, supportsPickup, deliveryRadiusKm, fulfillmentMode }
) {
  return withImmediateTransaction(db, () => {
    const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cookId);
    requireCookOwnership(authUser, cookRow);

    const modes = { DELIVERY_ONLY: [false, true], PICKUP_ONLY: [true, false], BOTH: [true, true] };
    if (fulfillmentMode !== undefined) {
      if (!Object.hasOwn(modes, fulfillmentMode)) {
        throw new SofrehGuardError('INVALID_FULFILLMENT_MODE', 'Invalid fulfillment mode.', 400);
      }
      [supportsPickup, supportsDelivery] = modes[fulfillmentMode];
    }
    if ([supportsPickup, supportsDelivery].some((v) => v !== undefined && typeof v !== 'boolean')) {
      throw new SofrehGuardError('INVALID_FULFILLMENT_CONFIG', 'Fulfillment flags must be booleans.', 400);
    }
    const parsedFee = deliveryFeeCents === undefined ? Number(cookRow.delivery_fee_cents) : Number(deliveryFeeCents);
    if (!Number.isInteger(parsedFee) || parsedFee < 0 || parsedFee > 5000) {
      throw new SofrehGuardError(
        'INVALID_DELIVERY_FEE',
        'Cook-set delivery fee must be an integer between 0 and 5000 cents (CA$0.00 - CA$50.00).',
        400
      );
    }

    const nextSupportsPickup =
      supportsPickup !== undefined ? (supportsPickup ? 1 : 0) : cookRow.supports_pickup;
    const nextSupportsDelivery =
      supportsDelivery !== undefined ? (supportsDelivery ? 1 : 0) : cookRow.supports_delivery;

    if (!nextSupportsPickup && !nextSupportsDelivery) {
      throw new SofrehGuardError(
        'INVALID_FULFILLMENT_CONFIG',
        'At least one fulfillment option (pickup or delivery) must remain enabled.',
        400
      );
    }

    const nextRadius =
      deliveryRadiusKm !== undefined ? Number(deliveryRadiusKm) : Number(cookRow.delivery_radius_km);
    if (!Number.isFinite(nextRadius) || nextRadius < 0 || nextRadius > 100) {
      throw new SofrehGuardError('INVALID_DELIVERY_RADIUS', 'Invalid delivery radius.', 400);
    }
    const nowIso = new Date().toISOString();

    db.prepare(
      `UPDATE cook_profiles
       SET delivery_fee_cents = ?,
           supports_pickup = ?,
           supports_delivery = ?,
           delivery_radius_km = ?,
           updated_at_iso = ?
       WHERE id = ?`
    ).run(parsedFee, nextSupportsPickup, nextSupportsDelivery, nextRadius, nowIso, cookId);

    const updatedCook = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cookId);
    const dishes = db.prepare(`SELECT * FROM dish_slots WHERE cook_id = ?`).all(cookId);
    const { reviewSummary, reviews } = getCookHonestReviewSummaryAndList(db, cookId);
    return sanitizeCookForPublicDiscovery(
      updatedCook,
      dishes,
      authUser.preferredLocale || 'en-CA',
      reviewSummary,
      reviews
    );
  });
}

/**
 * Allows an authenticated COOK to update or create a dish slot in their own kitchen.
 */
export function updateCookDishPortions(
  db,
  authUser,
  { cookId, dishId, totalPortions, remainingPortions, priceCents, availabilityMode }
) {
  return withImmediateTransaction(db, () => {
    const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cookId);
    requireCookOwnership(authUser, cookRow);

    const dishRow = db
      .prepare(`SELECT * FROM dish_slots WHERE id = ? AND cook_id = ?`)
      .get(dishId, cookId);
    if (!dishRow) {
      throw new SofrehGuardError('NOT_FOUND', 'Dish slot not found in your kitchen.', 404);
    }

    const nextTotal =
      totalPortions !== undefined ? Number(totalPortions) : Number(dishRow.total_portions);
    const nextRemaining =
      remainingPortions !== undefined
        ? Number(remainingPortions)
        : Number(dishRow.remaining_portions);
    const nextPrice =
      priceCents !== undefined ? Number(priceCents) : Number(dishRow.price_cents);
    const nextAvailability = availabilityMode === undefined ? dishRow.availability_mode : availabilityMode;
    if (!['TODAY_AVAILABLE', 'REGULAR_UNAVAILABLE'].includes(nextAvailability)) {
      throw new SofrehGuardError('INVALID_AVAILABILITY_MODE', 'Invalid availability mode.', 400);
    }
    if (!Number.isInteger(nextPrice) || nextPrice <= 0 || nextPrice > 1000000) {
      throw new SofrehGuardError('INVALID_PRICE', 'Price must be positive integer cents.', 400);
    }

    if (
      !Number.isInteger(nextTotal) ||
      !Number.isInteger(nextRemaining) ||
      nextRemaining < 0 ||
      nextRemaining > nextTotal
    ) {
      throw new SofrehGuardError(
        'INVALID_PORTIONS',
        'Remaining portions must be between 0 and total portions.',
        400
      );
    }

    const nowIso = new Date().toISOString();
    db.prepare(
      `UPDATE dish_slots
        SET total_portions = ?, remaining_portions = ?, price_cents = ?, updated_at_iso = ?, availability_mode = ?
       WHERE id = ? AND cook_id = ?`
    ).run(nextTotal, nextRemaining, nextPrice, nowIso, nextAvailability, dishId, cookId);

    return db.prepare(`SELECT * FROM dish_slots WHERE id = ?`).get(dishId);
  });
}

/**
 * Builds the sanitized, server-calculated persisted cart view for an authenticated CUSTOMER.
 * Never exposes exact_pickup_address_private.
 */
function buildPersistedCartView(db, customerUserId, locale = 'en-CA') {
  const norm = normalizeLocale(locale);
  const cartRow = db
    .prepare(`SELECT * FROM carts WHERE customer_user_id = ?`)
    .get(customerUserId);

  if (!cartRow || !cartRow.cook_id) {
    return {
      customerUserId,
      cookId: null,
      kitchenName: null,
      neighborhood: null,
      supportsPickup: true,
      supportsDelivery: true,
      fulfillmentType: cartRow?.fulfillment_type || 'pickup',
      deliveryAddress: cartRow?.delivery_address_private || null,
      items: [],
      subtotalCents: 0,
      deliveryFeeCents: 0,
      totalCents: 0,
      updatedAtIso: cartRow?.updated_at_iso || new Date().toISOString()
    };
  }

  const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cartRow.cook_id);
  if (!cookRow) {
    return {
      customerUserId,
      cookId: null,
      kitchenName: null,
      neighborhood: null,
      supportsPickup: true,
      supportsDelivery: true,
      fulfillmentType: 'pickup',
      deliveryAddress: null,
      items: [],
      subtotalCents: 0,
      deliveryFeeCents: 0,
      totalCents: 0,
      updatedAtIso: new Date().toISOString()
    };
  }

  const itemRows = db
    .prepare(
      `SELECT ci.dish_id, ci.quantity, ci.updated_at_iso,
              d.title_en, d.title_fa, d.price_cents, d.remaining_portions,
              d.availability_mode, d.photo_url
       FROM cart_items ci
       JOIN dish_slots d ON d.id = ci.dish_id
       WHERE ci.customer_user_id = ? AND d.cook_id = ? AND d.is_active = 1
       ORDER BY d.id ASC`
    )
    .all(customerUserId, cookRow.id);

  let subtotalCents = 0;
  const items = itemRows.map((row) => {
    const unitPriceCents = Number(row.price_cents);
    const quantity = Number(row.quantity);
    const lineTotalCents = unitPriceCents * quantity;
    subtotalCents += lineTotalCents;
    const titleLocalized = {
      'en-CA': row.title_en,
      'fa-IR': row.title_fa
    };
    return {
      dishId: row.dish_id,
      title: titleLocalized[norm],
      titleLocalized,
      photoUrl: row.photo_url || '',
      unitPriceCents,
      quantity,
      lineTotalCents,
      remainingPortions: Number(row.remaining_portions),
      availabilityMode:
        row.availability_mode === 'REGULAR_UNAVAILABLE'
          ? 'REGULAR_UNAVAILABLE'
          : 'TODAY_AVAILABLE'
    };
  });

  let effectiveFulfillment = cartRow.fulfillment_type;
  if (effectiveFulfillment === 'pickup' && !cookRow.supports_pickup && cookRow.supports_delivery) {
    effectiveFulfillment = 'delivery';
  } else if (
    effectiveFulfillment === 'delivery' &&
    !cookRow.supports_delivery &&
    cookRow.supports_pickup
  ) {
    effectiveFulfillment = 'pickup';
  }

  const deliveryFeeCents =
    items.length > 0 && effectiveFulfillment === 'delivery'
      ? Number(cookRow.delivery_fee_cents)
      : 0;
  const totalCents = subtotalCents + deliveryFeeCents;

  return {
    customerUserId,
    cookId: cookRow.id,
    kitchenName: norm === 'fa-IR' ? cookRow.kitchen_name_fa : cookRow.kitchen_name_en,
    neighborhood: cookRow.neighborhood,
    supportsPickup: Boolean(cookRow.supports_pickup),
    supportsDelivery: Boolean(cookRow.supports_delivery),
    fulfillmentType: effectiveFulfillment,
    deliveryAddress: cartRow.delivery_address_private || null,
    items,
    subtotalCents,
    deliveryFeeCents,
    totalCents,
    updatedAtIso: cartRow.updated_at_iso
  };
}

/**
 * Returns the authenticated CUSTOMER's persisted multi-item cart from SQLite.
 */
export function getCustomerCart(db, authUser, locale = 'en-CA') {
  requireRole(authUser, 'CUSTOMER');
  return buildPersistedCartView(db, authUser.id, locale);
}

function validateCookFulfillmentMode(cookRow, fulfillmentType) {
  if (fulfillmentType !== 'pickup' && fulfillmentType !== 'delivery') {
    throw new SofrehGuardError(
      'INVALID_FULFILLMENT_TYPE',
      'Fulfillment type must be either pickup or delivery.',
      400
    );
  }
  if (fulfillmentType === 'pickup' && !cookRow.supports_pickup) {
    throw new SofrehGuardError(
      'FULFILLMENT_NOT_SUPPORTED',
      'This cook does not currently offer pickup.',
      400
    );
  }
  if (fulfillmentType === 'delivery' && !cookRow.supports_delivery) {
    throw new SofrehGuardError(
      'FULFILLMENT_NOT_SUPPORTED',
      'This cook does not currently offer delivery.',
      400
    );
  }
}

/**
 * Upserts the authenticated CUSTOMER's persisted multi-item cart in SQLite inside BEGIN IMMEDIATE.
 * Enforces cook-specific pickup/delivery restrictions, rejects REGULAR_UNAVAILABLE items,
 * validates stock quantities, and returns server-calculated totals.
 */
export function upsertCustomerCart(
  db,
  authUser,
  { cookId, fulfillmentType, deliveryAddress, items } = {},
  locale = 'en-CA'
) {
  requireRole(authUser, 'CUSTOMER');

  return withImmediateTransaction(db, () => {
    const nowIso = new Date().toISOString();

    if (!cookId || !Array.isArray(items) || items.length === 0) {
      db.prepare(`DELETE FROM cart_items WHERE customer_user_id = ?`).run(authUser.id);
      db.prepare(`DELETE FROM carts WHERE customer_user_id = ?`).run(authUser.id);
      return buildPersistedCartView(db, authUser.id, locale);
    }

    const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cookId);
    if (!cookRow) {
      throw new SofrehGuardError('NOT_FOUND', 'Cook kitchen not found.', 404);
    }

    const resolvedFulfillment =
      fulfillmentType || (cookRow.supports_pickup ? 'pickup' : 'delivery');
    validateCookFulfillmentMode(cookRow, resolvedFulfillment);

    // Consolidate duplicate dishIds
    const mergedQuantities = new Map();
    for (const rawItem of items) {
      const qty = Number(rawItem?.quantity);
      if (!rawItem?.dishId || !Number.isInteger(qty) || qty < 0) {
        throw new SofrehGuardError(
          'INVALID_ITEM_QUANTITY',
          'Cart item quantity must be a non-negative integer.',
          400
        );
      }
      if (qty > 0) {
        mergedQuantities.set(
          rawItem.dishId,
          (mergedQuantities.get(rawItem.dishId) || 0) + qty
        );
      }
    }

    const getDishStmt = db.prepare(
      `SELECT * FROM dish_slots WHERE id = ? AND cook_id = ? AND is_active = 1`
    );

    for (const [dishId, qty] of mergedQuantities.entries()) {
      const dishRow = getDishStmt.get(dishId, cookId);
      if (!dishRow) {
        throw new SofrehGuardError(
          'DISH_NOT_FOUND',
          `Dish ${dishId} is not available from cook ${cookId}.`,
          404
        );
      }
      if (dishRow.availability_mode === 'REGULAR_UNAVAILABLE') {
        throw new SofrehGuardError(
          'DISH_UNAVAILABLE_TODAY',
          `Dish "${dishRow.title_en}" is a regular menu item and is not available today.`,
          409
        );
      }
      if (!cookRow.is_synthetic_test_fixture && Date.parse(dishRow.service_window_end_iso) <= Date.now()) {
        throw new SofrehGuardError('DISH_WINDOW_CLOSED', 'The service window has ended.', 409);
      }
      if (Number(dishRow.remaining_portions) < qty) {
        throw new SofrehGuardError(
          'INSUFFICIENT_PORTIONS',
          `Insufficient portions for "${dishRow.title_en}": requested ${qty}, only ${dishRow.remaining_portions} remaining.`,
          409
        );
      }
    }

    db.prepare(
      `INSERT INTO carts (customer_user_id, cook_id, fulfillment_type, delivery_address_private, updated_at_iso)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(customer_user_id) DO UPDATE SET
         cook_id = excluded.cook_id,
         fulfillment_type = excluded.fulfillment_type,
         delivery_address_private = excluded.delivery_address_private,
         updated_at_iso = excluded.updated_at_iso`
    ).run(
      authUser.id,
      cookId,
      resolvedFulfillment,
      deliveryAddress ? String(deliveryAddress).trim() : null,
      nowIso
    );

    db.prepare(`DELETE FROM cart_items WHERE customer_user_id = ?`).run(authUser.id);
    const insertCartItem = db.prepare(
      `INSERT INTO cart_items (customer_user_id, dish_id, quantity, updated_at_iso)
       VALUES (?, ?, ?, ?)`
    );
    for (const [dishId, qty] of mergedQuantities.entries()) {
      insertCartItem.run(authUser.id, dishId, qty, nowIso);
    }

    return buildPersistedCartView(db, authUser.id, locale);
  });
}

/**
 * Updates a single dish's quantity (or removes it when quantity === 0) in the CUSTOMER's persisted cart.
 */
export function updateCustomerCartItemQuantity(
  db,
  authUser,
  { cookId, dishId, quantity, fulfillmentType, deliveryAddress } = {},
  locale = 'en-CA'
) {
  requireRole(authUser, 'CUSTOMER');

  return withImmediateTransaction(db, () => {
    const nowIso = new Date().toISOString();
    const existingCart = db
      .prepare(`SELECT * FROM carts WHERE customer_user_id = ?`)
      .get(authUser.id);

    const targetCookId = cookId || existingCart?.cook_id;
    if (!targetCookId) {
      throw new SofrehGuardError('INVALID_CART_INPUT', 'cookId is required.', 400);
    }

    const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(targetCookId);
    if (!cookRow) {
      throw new SofrehGuardError('NOT_FOUND', 'Cook kitchen not found.', 404);
    }

    const nextFulfillment =
      fulfillmentType ||
      (existingCart?.cook_id === targetCookId ? existingCart.fulfillment_type : null) ||
      (cookRow.supports_pickup ? 'pickup' : 'delivery');
    validateCookFulfillmentMode(cookRow, nextFulfillment);

    const nextDeliveryAddress =
      deliveryAddress !== undefined
        ? deliveryAddress
          ? String(deliveryAddress).trim()
          : null
        : existingCart?.delivery_address_private || null;

    // If only changing fulfillment mode or deliveryAddress without dishId
    if (!dishId) {
      db.prepare(
        `INSERT INTO carts (customer_user_id, cook_id, fulfillment_type, delivery_address_private, updated_at_iso)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(customer_user_id) DO UPDATE SET
           cook_id = excluded.cook_id,
           fulfillment_type = excluded.fulfillment_type,
           delivery_address_private = excluded.delivery_address_private,
           updated_at_iso = excluded.updated_at_iso`
      ).run(authUser.id, targetCookId, nextFulfillment, nextDeliveryAddress, nowIso);
      return buildPersistedCartView(db, authUser.id, locale);
    }

    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty < 0) {
      throw new SofrehGuardError(
        'INVALID_ITEM_QUANTITY',
        'Quantity must be a non-negative integer.',
        400
      );
    }

    const dishRow = db
      .prepare(`SELECT * FROM dish_slots WHERE id = ? AND cook_id = ? AND is_active = 1`)
      .get(dishId, targetCookId);
    if (!dishRow) {
      throw new SofrehGuardError(
        'DISH_NOT_FOUND',
        `Dish ${dishId} is not available from cook ${targetCookId}.`,
        404
      );
    }

    if (qty > 0) {
      if (!cookRow.is_synthetic_test_fixture && Date.parse(dishRow.service_window_end_iso) <= Date.now()) {
        throw new SofrehGuardError('DISH_WINDOW_CLOSED', 'The service window has ended.', 409);
      }
      if (dishRow.availability_mode === 'REGULAR_UNAVAILABLE') {
        throw new SofrehGuardError(
          'DISH_UNAVAILABLE_TODAY',
          `Dish "${dishRow.title_en}" is a regular menu item and is not available today.`,
          409
        );
      }
      if (Number(dishRow.remaining_portions) < qty) {
        throw new SofrehGuardError(
          'INSUFFICIENT_PORTIONS',
          `Insufficient portions for "${dishRow.title_en}": requested ${qty}, only ${dishRow.remaining_portions} remaining.`,
          409
        );
      }
    }

    // If switching cook, clear old cook's cart_items first
    if (existingCart && existingCart.cook_id && existingCart.cook_id !== targetCookId) {
      db.prepare(`DELETE FROM cart_items WHERE customer_user_id = ?`).run(authUser.id);
    }

    db.prepare(
      `INSERT INTO carts (customer_user_id, cook_id, fulfillment_type, delivery_address_private, updated_at_iso)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(customer_user_id) DO UPDATE SET
         cook_id = excluded.cook_id,
         fulfillment_type = excluded.fulfillment_type,
         delivery_address_private = excluded.delivery_address_private,
         updated_at_iso = excluded.updated_at_iso`
    ).run(authUser.id, targetCookId, nextFulfillment, nextDeliveryAddress, nowIso);

    if (qty === 0) {
      db.prepare(
        `DELETE FROM cart_items WHERE customer_user_id = ? AND dish_id = ?`
      ).run(authUser.id, dishId);
    } else {
      db.prepare(
        `INSERT INTO cart_items (customer_user_id, dish_id, quantity, updated_at_iso)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(customer_user_id, dish_id) DO UPDATE SET
           quantity = excluded.quantity,
           updated_at_iso = excluded.updated_at_iso`
      ).run(authUser.id, dishId, qty, nowIso);
    }

    return buildPersistedCartView(db, authUser.id, locale);
  });
}

/**
 * Clears the authenticated CUSTOMER's persisted cart in SQLite.
 */
export function clearCustomerCart(db, authUser, locale = 'en-CA') {
  requireRole(authUser, 'CUSTOMER');
  return withImmediateTransaction(db, () => {
    db.prepare(`DELETE FROM cart_items WHERE customer_user_id = ?`).run(authUser.id);
    db.prepare(`DELETE FROM carts WHERE customer_user_id = ?`).run(authUser.id);
    return buildPersistedCartView(db, authUser.id, locale);
  });
}

function computeOrderPayloadHash({ cookId, fulfillmentType, deliveryAddress, items }) {
  const normalizedItems = [...items]
    .map((i) => ({ dishId: String(i.dishId), quantity: Number(i.quantity) }))
    .sort((a, b) => a.dishId.localeCompare(b.dishId));
  const canonical = JSON.stringify({
    cookId: String(cookId),
    fulfillmentType: String(fulfillmentType),
    deliveryAddress: fulfillmentType === 'delivery' ? String(deliveryAddress || '').trim() : null,
    items: normalizedItems
  });
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/**
 * Places a customer order inside a SQLite `BEGIN IMMEDIATE` transaction:
 * - Enforces CUSTOMER role boundary
 * - Supports Idempotency-Key deduplication without double stock deduction
 * - Supports ordering directly from persisted SQLite cart or explicit multi-item array
 * - Verifies cook fulfillment support (pickup vs delivery vs both)
 * - Rejects REGULAR_UNAVAILABLE menu items
 * - Atomically checks and decrements `remaining_portions` for each ordered dish
 * - Calculates subtotal, cook-set delivery fee, and total on the server
 * - Records simulated payment (`SIMULATED_AUTHORIZED`)
 */
export function createOrderTransactional(db, authUser, orderInput) {
  requireRole(authUser, 'CUSTOMER');

  return withImmediateTransaction(db, () => {
    const rawInput = orderInput || {};
    const persistedCart = buildPersistedCartView(db, authUser.id, authUser.preferredLocale || 'en-CA');

    const cookId = rawInput.cookId || persistedCart.cookId;
    const fulfillmentType =
      rawInput.fulfillmentType || persistedCart.fulfillmentType || 'pickup';
    const deliveryAddress =
      rawInput.deliveryAddress !== undefined
        ? rawInput.deliveryAddress
        : persistedCart.deliveryAddress;
    const customerNotes = rawInput.customerNotes;
    const simulatedPaymentMethod = rawInput.simulatedPaymentMethod || 'SIMULATED_CARD';
    const idempotencyKey = rawInput.idempotencyKey
      ? String(rawInput.idempotencyKey).trim()
      : null;

    // A client may retry after the persisted cart was cleared by the original
    // successful request. With only the original idempotency key, return that
    // order before requiring cart/order fields again.
    if (
      idempotencyKey &&
      !rawInput.cookId &&
      !rawInput.fulfillmentType &&
      rawInput.deliveryAddress === undefined &&
      !Array.isArray(rawInput.items)
    ) {
      const existingIdem = db
        .prepare(
          `SELECT * FROM order_idempotency_keys WHERE customer_user_id = ? AND idempotency_key = ?`
        )
        .get(authUser.id, idempotencyKey);

      if (existingIdem) {
        const existingOrderRow = db
          .prepare(
            `SELECT o.*, c.kitchen_name_en, c.kitchen_name_fa, c.exact_pickup_address_private, c.pickup_address_consent
             FROM orders o
             JOIN cook_profiles c ON c.id = o.cook_id
             WHERE o.id = ?`
          )
          .get(existingIdem.order_id);
        const existingItems = db
          .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
          .all(existingIdem.order_id);
        const existingReviews = listOrderReviewsForOrder(db, existingIdem.order_id);
        return sanitizeOrderForCustomer(
          authUser,
          existingOrderRow,
          existingItems,
          existingReviews
        );
      }
    }

    const rawItems =
      Array.isArray(rawInput.items) && rawInput.items.length > 0
        ? rawInput.items
        : persistedCart.cookId === cookId && persistedCart.items.length > 0
          ? persistedCart.items.map((i) => ({ dishId: i.dishId, quantity: i.quantity }))
          : [];

    if (!cookId || !Array.isArray(rawItems) || rawItems.length === 0) {
      throw new SofrehGuardError(
        'INVALID_ORDER_INPUT',
        'Order requires a valid cookId and at least one dish item.',
        400
      );
    }

    // Consolidate duplicate dishId entries so stock checks cannot be split across lines
    const mergedMap = new Map();
    for (const entry of rawItems) {
      const qty = Number(entry?.quantity);
      if (!entry?.dishId || !Number.isInteger(qty) || qty <= 0) {
        throw new SofrehGuardError(
          'INVALID_ITEM_QUANTITY',
          'Each order item must specify a positive integer quantity.',
          400
        );
      }
      mergedMap.set(entry.dishId, (mergedMap.get(entry.dishId) || 0) + qty);
    }
    const items = Array.from(mergedMap.entries()).map(([dishId, quantity]) => ({
      dishId,
      quantity
    }));

    // Idempotency check before mutating portions
    const payloadHash = computeOrderPayloadHash({
      cookId,
      fulfillmentType,
      deliveryAddress,
      items
    });

    if (idempotencyKey) {
      const existingIdem = db
        .prepare(
          `SELECT * FROM order_idempotency_keys WHERE customer_user_id = ? AND idempotency_key = ?`
        )
        .get(authUser.id, idempotencyKey);

      if (existingIdem) {
        if (existingIdem.payload_hash !== payloadHash) {
          throw new SofrehGuardError(
            'IDEMPOTENCY_KEY_CONFLICT',
            'Idempotency key was already used with a different order payload.',
            409
          );
        }
        const existingOrderRow = db
          .prepare(
            `SELECT o.*, c.kitchen_name_en, c.kitchen_name_fa, c.exact_pickup_address_private, c.pickup_address_consent
             FROM orders o
             JOIN cook_profiles c ON c.id = o.cook_id
             WHERE o.id = ?`
          )
          .get(existingIdem.order_id);
        const existingItems = db
          .prepare(`SELECT * FROM order_items WHERE order_id = ?`)
          .all(existingIdem.order_id);
        const existingReviews = listOrderReviewsForOrder(db, existingIdem.order_id);
        return sanitizeOrderForCustomer(
          authUser,
          existingOrderRow,
          existingItems,
          existingReviews
        );
      }
    }

    const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cookId);
    if (!cookRow) {
      throw new SofrehGuardError('NOT_FOUND', 'Cook kitchen not found.', 404);
    }

    validateCookFulfillmentMode(cookRow, fulfillmentType);

    if (
      fulfillmentType === 'delivery' &&
      (!deliveryAddress || String(deliveryAddress).trim().length < 5)
    ) {
      throw new SofrehGuardError(
        'DELIVERY_ADDRESS_REQUIRED',
        'A delivery street address is required when selecting delivery.',
        400
      );
    }

    let subtotalCents = 0;
    const resolvedItems = [];

    const getDishStmt = db.prepare(
      `SELECT * FROM dish_slots WHERE id = ? AND cook_id = ? AND is_active = 1`
    );
    const decrementDishStmt = db.prepare(
      `UPDATE dish_slots
       SET remaining_portions = remaining_portions - ?,
           updated_at_iso = ?
       WHERE id = ? AND cook_id = ? AND availability_mode = 'TODAY_AVAILABLE' AND remaining_portions >= ?`
    );

    const nowIso = new Date().toISOString();

    for (const item of items) {
      const qty = Number(item.quantity);
      const dishRow = getDishStmt.get(item.dishId, cookId);
      if (!dishRow) {
        throw new SofrehGuardError(
          'DISH_NOT_FOUND',
          `Dish ${item.dishId} is not available from cook ${cookId}.`,
          404
        );
      }

      if (dishRow.availability_mode === 'REGULAR_UNAVAILABLE') {
        throw new SofrehGuardError(
          'DISH_UNAVAILABLE_TODAY',
          `Dish "${dishRow.title_en}" is a regular menu item and is not cooked today.`,
          409
        );
      }

      if (Number(dishRow.remaining_portions) < qty) {
        throw new SofrehGuardError(
          'INSUFFICIENT_PORTIONS',
          `Insufficient portions for "${dishRow.title_en}": requested ${qty}, only ${dishRow.remaining_portions} remaining.`,
          409
        );
      }

      if (!cookRow.is_synthetic_test_fixture && Date.parse(dishRow.service_window_end_iso) <= Date.now()) {
        throw new SofrehGuardError('DISH_WINDOW_CLOSED', 'The service window has ended.', 409);
      }
      const updateResult = decrementDishStmt.run(qty, nowIso, dishRow.id, cookId, qty);
      if (updateResult.changes !== 1) {
        throw new SofrehGuardError(
          'INSUFFICIENT_PORTIONS',
          `Concurrent portion reservation conflict for "${dishRow.title_en}".`,
          409
        );
      }

      const unitPriceCents = Number(dishRow.price_cents);
      const lineTotalCents = unitPriceCents * qty;
      subtotalCents += lineTotalCents;

      resolvedItems.push({
        id: `item-${crypto.randomUUID()}`,
        dishId: dishRow.id,
        titleEnSnapshot: dishRow.title_en,
        titleFaSnapshot: dishRow.title_fa,
        quantity: qty,
        unitPriceCents,
        lineTotalCents
      });
    }

    // Cook-set delivery fee is applied when fulfillmentType === 'delivery', 0 for 'pickup'
    const deliveryFeeCents =
      fulfillmentType === 'delivery' ? Number(cookRow.delivery_fee_cents) : 0;
    const totalCents = subtotalCents + deliveryFeeCents;

    const orderId = `ord-${crypto.randomUUID().slice(0, 8)}`;
    const simulatedPaymentReference = `SIM-PAY-${crypto.randomUUID().slice(0, 12).toUpperCase()}`;

    db.prepare(
      `INSERT INTO orders (
        id, customer_user_id, cook_id, status, fulfillment_type,
        subtotal_cents, delivery_fee_cents, total_cents,
        simulated_payment_method, simulated_payment_status, simulated_payment_reference,
        delivery_address_private, customer_notes, idempotency_key,
        is_synthetic_test_order, synthetic_badge_label,
        created_at_iso, updated_at_iso
      ) VALUES (?, ?, ?, 'PENDING', ?, ?, ?, ?, ?, 'SIMULATED_AUTHORIZED', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      orderId,
      authUser.id,
      cookId,
      fulfillmentType,
      subtotalCents,
      deliveryFeeCents,
      totalCents,
      simulatedPaymentMethod === 'SIMULATED_INTERAC' ? 'SIMULATED_INTERAC' : 'SIMULATED_CARD',
      simulatedPaymentReference,
      fulfillmentType === 'delivery' ? String(deliveryAddress).trim() : null,
      customerNotes ? String(customerNotes).trim() : null,
      idempotencyKey,
      Number(cookRow.is_synthetic_test_fixture),
      cookRow.is_synthetic_test_fixture ? 'TEST ONLY' : '',
      nowIso,
      nowIso
    );

    const insertItemStmt = db.prepare(
      `INSERT INTO order_items (
        id, order_id, dish_id, title_en_snapshot, title_fa_snapshot,
        quantity, unit_price_cents, line_total_cents
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const ri of resolvedItems) {
      insertItemStmt.run(
        ri.id,
        orderId,
        ri.dishId,
        ri.titleEnSnapshot,
        ri.titleFaSnapshot,
        ri.quantity,
        ri.unitPriceCents,
        ri.lineTotalCents
      );
    }

    if (idempotencyKey) {
      db.prepare(
        `INSERT INTO order_idempotency_keys (customer_user_id, idempotency_key, payload_hash, order_id, created_at_iso)
         VALUES (?, ?, ?, ?, ?)`
      ).run(authUser.id, idempotencyKey, payloadHash, orderId, nowIso);
    }

    // Clear persisted cart if it belonged to this cook
    if (persistedCart.cookId === cookId) {
      db.prepare(`DELETE FROM cart_items WHERE customer_user_id = ?`).run(authUser.id);
      db.prepare(`DELETE FROM carts WHERE customer_user_id = ?`).run(authUser.id);
    }

    const joinedOrder = db
      .prepare(
        `SELECT o.*, c.kitchen_name_en, c.kitchen_name_fa, c.exact_pickup_address_private, c.pickup_address_consent
         FROM orders o
         JOIN cook_profiles c ON c.id = o.cook_id
         WHERE o.id = ?`
      )
      .get(orderId);
    const itemRows = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId);

    enqueueOrderNotification(db,cookRow.user_id,orderId,'PENDING');
    return sanitizeOrderForCustomer(authUser, joinedOrder, itemRows, []);
  });
}

const VALID_COOK_TRANSITIONS = {
  PENDING: new Set(['ACCEPTED', 'REJECTED']),
  ACCEPTED: new Set(['PREPARING', 'READY', 'CANCELLED']),
  PREPARING: new Set(['READY', 'CANCELLED']),
  READY: new Set(['COMPLETED'])
};

/**
 * Transitions an order status on behalf of the owning COOK inside a `BEGIN IMMEDIATE` transaction.
 * Restores dish portions and marks simulated payment `SIMULATED_REFUNDED` if REJECTED or CANCELLED.
 * Marks simulated payment `SIMULATED_PAID` when COMPLETED.
 */
export function transitionOrderStatusTransactional(db, authUser, { orderId, nextStatus }) {
  requireRole(authUser, 'COOK');

  return withImmediateTransaction(db, () => {
    const orderRow = db
      .prepare(
        `SELECT o.*, u.display_name AS customer_display_name
         FROM orders o
         JOIN users u ON u.id = o.customer_user_id
         WHERE o.id = ?`
      )
      .get(orderId);

    if (!orderRow) {
      throw new SofrehGuardError('NOT_FOUND', 'Order not found.', 404);
    }

    const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(orderRow.cook_id);
    requireCookOwnership(authUser, cookRow);

    const allowedNext = VALID_COOK_TRANSITIONS[orderRow.status];
    if (!allowedNext || !allowedNext.has(nextStatus)) {
      throw new SofrehGuardError(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition order from ${orderRow.status} to ${nextStatus}.`,
        400
      );
    }

    const nowIso = new Date().toISOString();
    let nextPaymentStatus = orderRow.simulated_payment_status;

    if (nextStatus === 'REJECTED' || nextStatus === 'CANCELLED') {
      nextPaymentStatus = 'SIMULATED_REFUNDED';
      const itemRows = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId);
      const restoreStmt = db.prepare(
        `UPDATE dish_slots
         SET remaining_portions = MIN(total_portions, remaining_portions + ?),
             updated_at_iso = ?
         WHERE id = ?`
      );
      for (const item of itemRows) {
        restoreStmt.run(Number(item.quantity), nowIso, item.dish_id);
      }
    } else if (nextStatus === 'COMPLETED') {
      nextPaymentStatus = 'SIMULATED_PAID';
    }

    db.prepare(
      `UPDATE orders
       SET status = ?, simulated_payment_status = ?, updated_at_iso = ?
       WHERE id = ?`
    ).run(nextStatus, nextPaymentStatus, nowIso, orderId);

    const updatedOrder = db
      .prepare(
        `SELECT o.*, u.display_name AS customer_display_name
         FROM orders o
         JOIN users u ON u.id = o.customer_user_id
         WHERE o.id = ?`
      )
      .get(orderId);
    const itemRows = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId);
    const reviews = listOrderReviewsForOrder(db, orderId);

    enqueueOrderNotification(db,orderRow.customer_user_id,orderId,nextStatus);
    return sanitizeOrderForCook(authUser, cookRow, updatedOrder, itemRows, reviews);
  });
}

/**
 * Lists all orders belonging to the authenticated CUSTOMER.
 */
export function listCustomerOrders(db, authUser) {
  requireRole(authUser, 'CUSTOMER');

  const orderRows = db
    .prepare(
      `SELECT o.*, c.kitchen_name_en, c.kitchen_name_fa, c.exact_pickup_address_private, c.pickup_address_consent
       FROM orders o
       JOIN cook_profiles c ON c.id = o.cook_id
       WHERE o.customer_user_id = ?
       ORDER BY o.created_at_iso DESC`
    )
    .all(authUser.id);

  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`);
  return orderRows.map((row) =>
    sanitizeOrderForCustomer(
      authUser,
      row,
      itemsStmt.all(row.id),
      listOrderReviewsForOrder(db, row.id)
    )
  );
}

/**
 * Retrieves a single order by ID for an authenticated CUSTOMER (enforcing customer ownership).
 */
export function getCustomerOrderById(db, authUser, orderId) {
  requireRole(authUser, 'CUSTOMER');
  const orderRow = db
    .prepare(
      `SELECT o.*, c.kitchen_name_en, c.kitchen_name_fa, c.exact_pickup_address_private, c.pickup_address_consent
       FROM orders o
       JOIN cook_profiles c ON c.id = o.cook_id
       WHERE o.id = ?`
    )
    .get(orderId);
  if (!orderRow) {
    throw new SofrehGuardError('NOT_FOUND', 'Order not found.', 404);
  }
  const items = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`).all(orderId);
  const reviews = listOrderReviewsForOrder(db, orderId);
  return sanitizeOrderForCustomer(authUser, orderRow, items, reviews);
}

/**
 * Lists all orders for a cook's kitchen (enforcing COOK role & kitchen ownership).
 */
export function listCookKitchenOrders(db, authUser, cookId) {
  requireRole(authUser, 'COOK');
  const cookRow = db.prepare(`SELECT * FROM cook_profiles WHERE id = ?`).get(cookId);
  requireCookOwnership(authUser, cookRow);

  const orderRows = db
    .prepare(
      `SELECT o.*, u.display_name AS customer_display_name
       FROM orders o
       JOIN users u ON u.id = o.customer_user_id
       WHERE o.cook_id = ?
       ORDER BY o.created_at_iso DESC`
    )
    .all(cookId);

  const itemsStmt = db.prepare(`SELECT * FROM order_items WHERE order_id = ?`);
  return orderRows.map((row) =>
    sanitizeOrderForCook(
      authUser,
      cookRow,
      row,
      itemsStmt.all(row.id),
      listOrderReviewsForOrder(db, row.id)
    )
  );
}

/**
 * Persists a two-way rating (1-5) and HTML-escaped text review between participants of a COMPLETED order.
 * Prevents self-reviews, duplicate reviews, non-completed order reviews, and foreign-order reviews.
 */
export function createOrderReviewTransactional(
  db,
  authUser,
  { orderId, rating, comment } = {}
) {
  if (!authUser || !authUser.id) {
    throw new SofrehGuardError(
      'UNAUTHENTICATED',
      'Authentication token is required to submit a review.',
      401
    );
  }

  return withImmediateTransaction(db, () => {
    const orderRow = db
      .prepare(
        `SELECT o.*, c.user_id AS cook_user_id
         FROM orders o
         JOIN cook_profiles c ON c.id = o.cook_id
         WHERE o.id = ?`
      )
      .get(orderId);

    if (!orderRow) {
      throw new SofrehGuardError('NOT_FOUND', 'Order not found.', 404);
    }

    // Explicit self-review protection
    if (orderRow.customer_user_id === orderRow.cook_user_id) {
      throw new SofrehGuardError(
        'SELF_REVIEW_FORBIDDEN',
        'Self-reviews are not allowed.',
        403
      );
    }

    let direction;
    let targetUserId;

    if (authUser.role === 'CUSTOMER') {
      if (authUser.id === orderRow.cook_user_id) {
        throw new SofrehGuardError(
          'SELF_REVIEW_FORBIDDEN',
          'A cook cannot review their own kitchen.',
          403
        );
      }
      if (orderRow.customer_user_id !== authUser.id) {
        throw new SofrehGuardError(
          'REVIEW_FORBIDDEN_FOREIGN_ORDER',
          'Customer can only review an order they participated in.',
          403
        );
      }
      direction = 'CUSTOMER_TO_COOK';
      targetUserId = orderRow.cook_user_id;
    } else if (authUser.role === 'COOK') {
      if (authUser.id === orderRow.customer_user_id) {
        throw new SofrehGuardError(
          'SELF_REVIEW_FORBIDDEN',
          'A customer cannot review themselves as a cook.',
          403
        );
      }
      if (orderRow.cook_user_id !== authUser.id) {
        throw new SofrehGuardError(
          'REVIEW_FORBIDDEN_FOREIGN_ORDER',
          'Cook can only review an order belonging to their kitchen.',
          403
        );
      }
      direction = 'COOK_TO_CUSTOMER';
      targetUserId = orderRow.customer_user_id;
    } else {
      throw new SofrehGuardError('ROLE_FORBIDDEN', 'Invalid role for review.', 403);
    }

    if (orderRow.status !== 'COMPLETED') {
      throw new SofrehGuardError(
        'REVIEW_REQUIRES_COMPLETED_ORDER',
        `Reviews are only permitted on COMPLETED orders (current status: ${orderRow.status}).`,
        409
      );
    }

    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      throw new SofrehGuardError(
        'INVALID_REVIEW_RATING',
        'Rating must be an integer between 1 and 5.',
        400
      );
    }

    const trimmedComment = String(comment ?? '').trim();
    if (!trimmedComment || trimmedComment.length > 1000) {
      throw new SofrehGuardError(
        'INVALID_REVIEW_COMMENT',
        'Review text is required and must be at most 1000 characters.',
        400
      );
    }

    const existingReview = db
      .prepare(
        `SELECT id FROM order_reviews
         WHERE order_id = ? AND reviewer_user_id = ? AND direction = ?`
      )
      .get(orderId, authUser.id, direction);

    if (existingReview) {
      throw new SofrehGuardError(
        'DUPLICATE_REVIEW',
        'A review has already been submitted by this participant for this order.',
        409
      );
    }

    const commentEscaped = escapeHtmlText(trimmedComment);
    const reviewId = `rev-${crypto.randomUUID().slice(0, 8)}`;
    const nowIso = new Date().toISOString();

    db.prepare(
      `INSERT INTO order_reviews (
        id, order_id, reviewer_user_id, reviewer_role,
        target_cook_id, target_user_id, direction,
        rating, comment_escaped, created_at_iso
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      reviewId,
      orderId,
      authUser.id,
      authUser.role,
      orderRow.cook_id,
      targetUserId,
      direction,
      parsedRating,
      commentEscaped,
      nowIso
    );

    const createdRow = db
      .prepare(
        `SELECT r.*, u.display_name AS reviewer_display_name
         FROM order_reviews r
         JOIN users u ON u.id = r.reviewer_user_id
         WHERE r.id = ?`
      )
      .get(reviewId);

    const { reviewSummary } = getCookHonestReviewSummaryAndList(db, orderRow.cook_id);

    return {
      review: mapReviewRow(createdRow),
      cookReviewSummary: reviewSummary
    };
  });
}

/**
 * Lists honest persisted reviews and aggregate rating for a cook kitchen.
 */
export function listCookReviews(db, cookId) {
  const cookRow = db.prepare(`SELECT id FROM cook_profiles WHERE id = ?`).get(cookId);
  if (!cookRow) {
    throw new SofrehGuardError('NOT_FOUND', 'Cook kitchen not found.', 404);
  }
  return getCookHonestReviewSummaryAndList(db, cookId);
}
