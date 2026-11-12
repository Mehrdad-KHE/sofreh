import { randomUUID } from 'node:crypto';
import { requireRole, requireCookOwnership, SofrehGuardError } from './privacy.mjs';

export async function uploadDishPhoto(db, user, dishId, input) {
  requireRole(user,'COOK');
  const dish=db.prepare('SELECT d.id,c.user_id FROM dish_slots d JOIN cook_profiles c ON c.id=d.cook_id WHERE d.id=?').get(dishId);
  if(!dish)throw new SofrehGuardError('NOT_FOUND','Dish not found.',404);
  requireCookOwnership(user,dish);
  const value=input.imageBase64;
  if(typeof value!=='string'||value.length>2500000||!/^[A-Za-z0-9+/]+={0,2}$/.test(value))throw new SofrehGuardError('INVALID_IMAGE','Choose a JPEG, PNG or WebP image under 1.8 MB.',400);
  const bytes=Buffer.from(value,'base64');
  const valid=bytes.subarray(0,3).equals(Buffer.from([255,216,255]))||bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP');
  if(!valid)throw new SofrehGuardError('INVALID_IMAGE','Choose a JPEG, PNG or WebP image.',400);
  const {default:sharp}=await import('sharp');
  let jpeg;
  try{let image=sharp(bytes,{limitInputPixels:20000000}).rotate().resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true});if(input.enhance===true)image=image.normalise();jpeg=await image.jpeg({quality:82}).toBuffer();}
  catch{throw new SofrehGuardError('INVALID_IMAGE','The image could not be decoded.',400);}
  // Re-encoding strips GPS/EXIF and embedded content. Only a JPEG is served.
  const id=randomUUID();
  db.prepare(`INSERT INTO dish_photos (dish_id,id,jpeg,updated_at_iso) VALUES (?,?,?,?)
    ON CONFLICT(dish_id) DO UPDATE SET id=excluded.id,jpeg=excluded.jpeg,updated_at_iso=excluded.updated_at_iso`).run(dishId,id,jpeg,new Date().toISOString());
  const url='/media/dishes/'+id+'.jpg';
  db.prepare('UPDATE dish_slots SET photo_url=? WHERE id=?').run(url,dishId);
  return {photoUrl:url};
}
