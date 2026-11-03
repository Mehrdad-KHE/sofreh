import crypto from 'node:crypto';
import { requireRole, SofrehGuardError } from './privacy.mjs';
import { withImmediateTransaction } from './db.mjs';

function owned(db, actor, id) {
  requireRole(actor, 'CUSTOMER');
  const row = db.prepare('SELECT * FROM customer_saved_addresses WHERE id = ?').get(id);
  if (!row || row.customer_user_id !== actor.id) {
    throw new SofrehGuardError('ADDRESS_FORBIDDEN', 'Saved address is unavailable to this customer.', 403);
  }
  return row;
}
function view(row) {
  return { id: row.id, label: row.label, address: row.address, updatedAtIso: row.updated_at_iso };
}
export function listSavedAddresses(db, actor) {
  requireRole(actor, 'CUSTOMER');
  return db.prepare('SELECT * FROM customer_saved_addresses WHERE customer_user_id = ? ORDER BY updated_at_iso DESC')
    .all(actor.id).map(view);
}
export function saveAddress(db, actor, id, input) {
  requireRole(actor, 'CUSTOMER');
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new SofrehGuardError('INVALID_ADDRESS_INPUT', 'Address body must be a JSON object.', 400);
  }
  return withImmediateTransaction(db, () => {
    if (id) owned(db, actor, id);
    if (Object.keys(input).some((k) => !['label', 'address'].includes(k))) {
      throw new SofrehGuardError('INVALID_ADDRESS_INPUT', 'Only label and address are accepted.', 400);
    }
    if (typeof input.label !== 'string' || !input.label.trim() || input.label.length > 60 ||
        typeof input.address !== 'string' || input.address.trim().length < 5 || input.address.length > 500) {
      throw new SofrehGuardError('INVALID_ADDRESS_INPUT', 'Supply a label and delivery address.', 400);
    }
    const key = id || `addr-${crypto.randomUUID()}`;
    db.prepare(`INSERT INTO customer_saved_addresses (id, customer_user_id, label, address, updated_at_iso)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET label=excluded.label, address=excluded.address, updated_at_iso=excluded.updated_at_iso`)
      .run(key, actor.id, input.label.trim(), input.address.trim(), new Date().toISOString());
    return view(owned(db, actor, key));
  });
}
export function getSavedAddress(db, actor, id) { return view(owned(db, actor, id)); }
export function deleteSavedAddress(db, actor, id) {
  return withImmediateTransaction(db, () => {
    owned(db, actor, id);
    db.prepare('DELETE FROM customer_saved_addresses WHERE id = ? AND customer_user_id = ?').run(id, actor.id);
  });
}
