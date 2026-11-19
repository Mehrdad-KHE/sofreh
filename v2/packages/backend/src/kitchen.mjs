import { randomUUID } from 'node:crypto';
import { SofrehGuardError, requireRole, requireCookOwnership, sanitizeCookForPublicDiscovery } from './privacy.mjs';
import { withImmediateTransaction } from './db.mjs';

export const KITCHEN_AREAS = Object.freeze({
  willowdale: { name: 'Willowdale', lat: 43.7701, lng: -79.4124 },
  northYork: { name: 'North York Centre', lat: 43.7673, lng: -79.4120 },
  downtown: { name: 'Downtown Toronto', lat: 43.6532, lng: -79.3832 },
  scarborough: { name: 'Scarborough Centre', lat: 43.7764, lng: -79.2318 },
  richmondHill: { name: 'Richmond Hill', lat: 43.8828, lng: -79.4403 }
});

function text(input, key, max = 180, required = true) {
  const value = input[key];
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) {
    throw new SofrehGuardError('INVALID_FIELD', `Please check ${key}.`, 400);
  }
  return value.trim();
}
function integer(value, name, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) throw new SofrehGuardError('INVALID_FIELD', `Please check ${name}.`, 400);
  return value;
}

export function getOwnKitchen(db, user, locale='en-CA') {
  requireRole(user, 'COOK');
  const row = db.prepare('SELECT * FROM cook_profiles WHERE user_id=?').get(user.id);
  if (!row) return null;
  const dishes=db.prepare('SELECT * FROM dish_slots WHERE cook_id=? AND is_active=1').all(row.id);
  return { id: row.id, isPublished:Boolean(row.is_published), storefront:sanitizeCookForPublicDiscovery(row,dishes,locale), nameEn: row.kitchen_name_en, nameFa: row.kitchen_name_fa, bioEn: row.bio_en, bioFa: row.bio_fa,
    neighborhood: row.neighborhood, pickupAddress: row.exact_pickup_address_private, pickupWindowEn: row.pickup_window_en,
    pickupWindowFa: row.pickup_window_fa, dishes: db.prepare('SELECT id FROM dish_slots WHERE cook_id=?').all(row.id) };
}

export function saveOwnKitchen(db, user, input, locale='en-CA') {
  requireRole(user, 'COOK');
  const area = KITCHEN_AREAS[input.area];
  if (!area) throw new SofrehGuardError('INVALID_AREA', 'Choose an available kitchen area.', 400);
  const values = [text(input,'nameEn'),text(input,'nameFa'),text(input,'bioEn',1500,false),text(input,'bioFa',1500,false),
    area.name,area.lat,area.lng,text(input,'pickupAddress',500),text(input,'pickupWindowEn'),text(input,'pickupWindowFa')];
  const mode = input.fulfillmentMode;
  if (!['pickup','delivery','both'].includes(mode)) throw new SofrehGuardError('INVALID_FULFILLMENT', 'Choose pickup, delivery or both.', 400);
  const fee = integer(input.deliveryFeeCents,'delivery fee',0,50000);
  const radius = integer(input.deliveryRadiusKm,'delivery radius',0,100);
  if(input.isPublished!==undefined&&typeof input.isPublished!=='boolean')throw new SofrehGuardError('INVALID_FIELD','Please check kitchen availability.',400);
  return withImmediateTransaction(db, () => {
    const existing = db.prepare('SELECT id,is_published FROM cook_profiles WHERE user_id=?').get(user.id);
    const id = existing?.id ?? `kitchen-${randomUUID()}`;
    db.prepare(`INSERT INTO cook_profiles (id,user_id,kitchen_name_en,kitchen_name_fa,bio_en,bio_fa,neighborhood,public_lat,public_lng,
      exact_pickup_address_private,pickup_window_en,pickup_window_fa,supports_pickup,supports_delivery,delivery_fee_cents,delivery_radius_km,
      is_synthetic_test_fixture,synthetic_badge_label,is_published,updated_at_iso) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,'',?,?)
      ON CONFLICT(user_id) DO UPDATE SET kitchen_name_en=excluded.kitchen_name_en,kitchen_name_fa=excluded.kitchen_name_fa,
      bio_en=excluded.bio_en,bio_fa=excluded.bio_fa,neighborhood=excluded.neighborhood,public_lat=excluded.public_lat,public_lng=excluded.public_lng,
      exact_pickup_address_private=excluded.exact_pickup_address_private,pickup_window_en=excluded.pickup_window_en,pickup_window_fa=excluded.pickup_window_fa,
      supports_pickup=excluded.supports_pickup,supports_delivery=excluded.supports_delivery,delivery_fee_cents=excluded.delivery_fee_cents,
      delivery_radius_km=excluded.delivery_radius_km,is_published=excluded.is_published,updated_at_iso=excluded.updated_at_iso`).run(id,user.id,...values,
      mode === 'delivery' ? 0 : 1,mode === 'pickup' ? 0 : 1,fee,radius,input.isPublished===undefined?(existing?.is_published??1):Number(input.isPublished),new Date().toISOString());
    return getOwnKitchen(db,user,locale);
  });
}

export function saveOwnDish(db, user, input, dishId = null) {
  requireRole(user, 'COOK');
  const kitchen = db.prepare('SELECT * FROM cook_profiles WHERE user_id=?').get(user.id);
  if (!kitchen) throw new SofrehGuardError('KITCHEN_REQUIRED', 'Create your kitchen first.', 409);
  requireCookOwnership(user,kitchen);
  const existing = dishId ? db.prepare('SELECT * FROM dish_slots WHERE id=? AND cook_id=?').get(dishId,kitchen.id) : null;
  if (dishId && !existing) throw new SofrehGuardError('NOT_FOUND','Dish not found.',404);
  const titleEn=text(input,'titleEn'), titleFa=text(input,'titleFa');
  const descriptionEn=text(input,'descriptionEn',1500,false), descriptionFa=text(input,'descriptionFa',1500,false);
  const price=integer(input.priceCents,'price',1,100000);
  const remaining=integer(input.remainingPortions,'portions',0,10000);
  const start=Date.parse(input.serviceWindowStartIso), end=Date.parse(input.serviceWindowEndIso);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end<=start || end<=Date.now()) throw new SofrehGuardError('INVALID_WINDOW','Choose a future service window.',400);
  if (!Array.isArray(input.allergens) || input.allergens.length>20 || input.allergens.some(v=>typeof v!=='string'||v.length>80)) throw new SofrehGuardError('INVALID_ALLERGENS','Please check allergens.',400);
  if (!['TODAY_AVAILABLE','REGULAR_UNAVAILABLE'].includes(input.availabilityMode)) throw new SofrehGuardError('INVALID_AVAILABILITY','Please check availability.',400);
  // User-controlled URLs are not inserted into the page or fetched by this server.
  // Photos are optional until an authenticated upload service is configured.
  const id=existing?.id ?? `dish-${randomUUID()}`;
  db.prepare(`INSERT INTO dish_slots (id,cook_id,title_en,title_fa,description_en,description_fa,price_cents,total_portions,remaining_portions,
    service_window_start_iso,service_window_end_iso,allergens_json,availability_mode,is_active,updated_at_iso)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(id) DO UPDATE SET title_en=excluded.title_en,title_fa=excluded.title_fa,
    description_en=excluded.description_en,description_fa=excluded.description_fa,price_cents=excluded.price_cents,
    total_portions=excluded.total_portions,remaining_portions=excluded.remaining_portions,service_window_start_iso=excluded.service_window_start_iso,
    service_window_end_iso=excluded.service_window_end_iso,allergens_json=excluded.allergens_json,availability_mode=excluded.availability_mode,updated_at_iso=excluded.updated_at_iso`)
    .run(id,kitchen.id,titleEn,titleFa,descriptionEn,descriptionFa,price,remaining,remaining,new Date(start).toISOString(),new Date(end).toISOString(),
      JSON.stringify(input.allergens.map(v=>v.trim()).filter(Boolean)),input.availabilityMode,new Date().toISOString());
  return { id, kitchenId:kitchen.id };
}
