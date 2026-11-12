import { withImmediateTransaction } from './db.mjs';
import { SofrehGuardError } from './privacy.mjs';
import { ownBusinessKitchen, listSlots, listCoupons, customerReference } from './commerce.mjs';

function fail(code, message, status = 400) { throw new SofrehGuardError(code, message, status); }
function integer(value, min, max) { if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_FIELD', 'Check the value.'); return value; }
function instant(value) { if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail('INVALID_WINDOW', 'Choose a valid time.'); return new Date(value).toISOString(); }
function version(row, expected) { if (expected !== Number(row.edit_version)) fail('BUSINESS_CHANGED', 'Another edit changed this item. Reload it before saving.', 409); }

export function editSlot(db, user, id, input) {
  const kitchen = ownBusinessKitchen(db, user);
  return withImmediateTransaction(db, () => {
    const row = db.prepare('SELECT * FROM fulfillment_slots WHERE id=? AND cook_id=?').get(id, kitchen.id);
    if (!row) fail('NOT_FOUND', 'Window not found.', 404);
    version(row, input.expectedVersion);
    const start = instant(input.startIso), end = instant(input.endIso);
    if (Date.parse(start) <= Date.now() || Date.parse(end) <= Date.parse(start)) fail('INVALID_WINDOW', 'Choose a future fulfillment window.');
    if (!['pickup', 'delivery', 'both'].includes(input.mode)) fail('INVALID_FULFILLMENT', 'Choose a fulfillment method.');
    const used = Number(db.prepare("SELECT count(*) AS n FROM orders WHERE scheduled_slot_id=? AND status NOT IN ('REJECTED','CANCELLED')").get(id).n);
    if (used && (start !== row.start_iso || end !== row.end_iso || input.mode !== row.mode)) fail('BOOKED_WINDOW_LOCKED', 'A booked window keeps its time and method. Create a new window for a different schedule.', 409);
    const capacity = integer(input.capacity, 1, 1000), cutoff = integer(input.cutoffMinutes, 0, 10080);
    if (capacity < used) fail('CAPACITY_BELOW_BOOKINGS', 'Capacity cannot be less than the orders already booked.', 409);
    db.prepare('UPDATE fulfillment_slots SET start_iso=?,end_iso=?,capacity=?,cutoff_minutes=?,mode=?,edit_version=edit_version+1 WHERE id=? AND cook_id=?')
      .run(start, end, capacity, cutoff, input.mode, id, kitchen.id);
    return listSlots(db, kitchen.id, { all: true }).find(s => s.id === id);
  });
}

export function editCoupon(db, user, id, input) {
  const kitchen = ownBusinessKitchen(db, user);
  return withImmediateTransaction(db, () => {
    const row = db.prepare('SELECT * FROM kitchen_coupons WHERE id=? AND cook_id=?').get(id, kitchen.id);
    if (!row) fail('NOT_FOUND', 'Promotion not found.', 404);
    version(row, input.expectedVersion);
    if (input.code !== row.code) fail('COUPON_CODE_LOCKED', 'Keep this code or create a new promotion.', 409);
    if (!['percent', 'fixed'].includes(input.kind)) fail('INVALID_COUPON', 'Choose a discount type.');
    const start = instant(input.startsIso), end = instant(input.endsIso);
    if (Date.parse(end) <= Date.now() || Date.parse(end) <= Date.parse(start)) fail('INVALID_WINDOW', 'Choose a valid promotion window.');
    const value = integer(input.value, 1, input.kind === 'percent' ? 100 : 100000);
    const minimum = integer(input.minimumCents, 0, 1000000), limit = integer(input.maxUses, 1, 1000000), perCustomer = integer(input.perCustomer, 1, 10000);
    const used = Number(db.prepare('SELECT count(*) AS n FROM orders WHERE cook_id=? AND coupon_code=?').get(kitchen.id, row.code).n);
    if (used && (input.kind !== row.kind || value !== row.value || minimum !== row.minimum_cents || perCustomer !== row.per_customer || start !== row.starts_iso)) fail('USED_PROMOTION_LOCKED', 'An offer already used keeps its terms. You can extend its end and redemption limit, or create a new offer.', 409);
    if (limit < used) fail('LIMIT_BELOW_USES', 'The limit cannot be less than existing redemptions.', 409);
    db.prepare('UPDATE kitchen_coupons SET kind=?,value=?,minimum_cents=?,max_uses=?,per_customer=?,starts_iso=?,ends_iso=?,edit_version=edit_version+1 WHERE id=? AND cook_id=?')
      .run(input.kind, value, minimum, limit, perCustomer, start, end, id, kitchen.id);
    return listCoupons(db, user).find(c => c.id === id);
  });
}

export function customerHistory(db, user, customerId, page = 1, locale = 'en-CA') {
  const kitchen = ownBusinessKitchen(db, user);
  integer(page, 1, 100000);
  const accountId=db.prepare('SELECT DISTINCT customer_user_id FROM orders WHERE cook_id=?').all(kitchen.id)
    .find(row=>customerReference(kitchen.id,row.customer_user_id)===customerId)?.customer_user_id;
  if(!accountId)fail('NOT_FOUND','Customer history not found.',404);
  const summary = db.prepare(`SELECT u.display_name,count(*) AS n,
    sum(CASE WHEN o.status='COMPLETED' THEN 1 ELSE 0 END) AS completed,
    sum(CASE WHEN o.status='COMPLETED' THEN o.total_cents ELSE 0 END) AS value
    FROM orders o JOIN users u ON u.id=o.customer_user_id WHERE o.cook_id=? AND o.customer_user_id=? GROUP BY u.id`).get(kitchen.id, accountId);
  if (!summary) fail('NOT_FOUND', 'Customer history not found.', 404);
  const orders = db.prepare('SELECT id,status,created_at_iso,total_cents,fulfillment_type FROM orders WHERE cook_id=? AND customer_user_id=? ORDER BY created_at_iso DESC,id DESC LIMIT 20 OFFSET ?')
    .all(kitchen.id, accountId, (page - 1) * 20).map(order => ({
      id: order.id, status: order.status, createdAtIso: order.created_at_iso, totalCents: Number(order.total_cents), fulfillmentType: order.fulfillment_type,
      items: db.prepare('SELECT title_en_snapshot,title_fa_snapshot,quantity FROM order_items WHERE order_id=? ORDER BY id').all(order.id)
        .map(item => ({ title: locale === 'fa-IR' ? item.title_fa_snapshot : item.title_en_snapshot, quantity: Number(item.quantity) }))
    }));
  return { customer: { id: customerId, name: summary.display_name, orderCount: Number(summary.n), completedCount: Number(summary.completed), completedValueCents: Number(summary.value) }, page, pageCount: Math.ceil(Number(summary.n) / 20), orders };
}
