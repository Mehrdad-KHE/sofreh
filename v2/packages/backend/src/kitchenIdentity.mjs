import { randomUUID } from 'node:crypto';
import { SofrehGuardError, requireRole } from './privacy.mjs';
import { normalizeUploadedPhoto } from './photos.mjs';

function ownKitchen(db, user) {
  requireRole(user, 'COOK');
  const row = db.prepare('SELECT id FROM cook_profiles WHERE user_id=?').get(user.id);
  if (!row) throw new SofrehGuardError('KITCHEN_REQUIRED', 'Create a kitchen first.', 409);
  return row;
}
const hosts = { instagram: ['instagram.com', 'www.instagram.com'], tiktok: ['tiktok.com', 'www.tiktok.com'], youtube: ['youtube.com', 'www.youtube.com', 'youtu.be'] };

export function publicKitchenIdentity(db, cookId) {
  const row = db.prepare('SELECT public_name,links_json FROM kitchen_identity WHERE cook_id=?').get(cookId);
  const images = db.prepare('SELECT kind,id,is_sample FROM kitchen_images WHERE cook_id=?').all(cookId);
  const image = kind => { const found = images.find(i => i.kind === kind); return found ? '/media/kitchens/' + found.id + '.jpg' : ''; };
  return { publicName: row?.public_name || '', links: JSON.parse(row?.links_json || '{}'), avatarUrl: image('avatar'), coverUrl: image('cover'), avatarIsSample:Boolean(images.find(i=>i.kind==='avatar')?.is_sample), coverIsSample:Boolean(images.find(i=>i.kind==='cover')?.is_sample) };
}

export function saveKitchenIdentity(db, user, input) {
  const kitchen = ownKitchen(db, user);
  if (typeof input.publicName !== 'string' || input.publicName.trim().length > 100) throw new SofrehGuardError('INVALID_FIELD', 'Check the public cook name.', 400);
  if (!input.links || typeof input.links !== 'object' || Array.isArray(input.links) || Object.keys(input.links).some(key => !Object.hasOwn(hosts, key))) throw new SofrehGuardError('INVALID_LINK', 'Choose a supported social profile.', 400);
  const links = {};
  for (const key of Object.keys(hosts)) {
    const value = input.links[key] ?? '';
    if (typeof value !== 'string' || value.length > 300) throw new SofrehGuardError('INVALID_LINK', 'Check the profile link.', 400);
    if (!value.trim()) continue;
    let url; try { url = new URL(value.trim()); } catch { throw new SofrehGuardError('INVALID_LINK', 'Use a full HTTPS profile link.', 400); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !hosts[key].includes(url.hostname)) throw new SofrehGuardError('INVALID_LINK', 'Use the selected service’s HTTPS profile link.', 400);
    links[key] = url.href;
  }
  db.prepare(`INSERT INTO kitchen_identity(cook_id,public_name,links_json) VALUES(?,?,?)
    ON CONFLICT(cook_id) DO UPDATE SET public_name=excluded.public_name,links_json=excluded.links_json`)
    .run(kitchen.id, input.publicName.trim(), JSON.stringify(links));
  return publicKitchenIdentity(db, kitchen.id);
}

export async function uploadKitchenImage(db, user, kind, input) {
  const kitchen = ownKitchen(db, user);
  if (!['avatar', 'cover'].includes(kind)) throw new SofrehGuardError('NOT_FOUND', 'Image type not found.', 404);
  if(input.isSample!==undefined&&typeof input.isSample!=='boolean')throw new SofrehGuardError('INVALID_FIELD','Check the image label.',400);
  const jpeg = await normalizeUploadedPhoto(input);
  const id = randomUUID();
  db.prepare(`INSERT INTO kitchen_images(cook_id,kind,id,jpeg,updated_at_iso,is_sample) VALUES(?,?,?,?,?,?)
    ON CONFLICT(cook_id,kind) DO UPDATE SET id=excluded.id,jpeg=excluded.jpeg,updated_at_iso=excluded.updated_at_iso,is_sample=excluded.is_sample`)
    .run(kitchen.id, kind, id, jpeg, new Date().toISOString(),Number(input.isSample===true));
  return publicKitchenIdentity(db, kitchen.id);
}
