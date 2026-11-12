import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {SofrehGuardError,requireRole} from './privacy.mjs';
import {listPublicDiscoveryCooks,getCustomerCart,setCartPreferences,getCustomerOrderById,listCookKitchenOrders,upsertCustomerCart} from './service.mjs';
import {publicBusinessConfig,listSlots,saveBusinessConfig,ownBusinessKitchen,businessOverview,saveSlot,toggleSlot,saveCoupon,toggleCoupon,favoriteKitchens,setFavorite,recordStorefrontView,orderMessages,addOrderMessage,cancelPendingOrder} from './commerce.mjs';
import {renderStorefront,renderReceipt} from './storefront.mjs';

export async function handleCommerceHttp({req,res,url,db,user,locale,readJsonBody,sendJson}){
  const p=url.pathname,method=req.method,json=(data,status=200)=>sendJson(res,status,data,locale),body=()=>readJsonBody(req);
  const html=(value,privatePage=false)=>{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...(privatePage?{'X-Robots-Tag':'noindex, nofollow'}:{})});res.end(value);};
  if(method==='GET'&&['/shop/style.css','/shop/app.js','/app/commerce-ui.js'].includes(p)){const rel=p==='/app/commerce-ui.js'?'workspace/commerce-ui.js':p.endsWith('.css')?'shop/style.css':'shop/app.js';const file=path.join(path.dirname(fileURLToPath(import.meta.url)),'../../../apps',rel);res.writeHead(200,{'Content-Type':p.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(fs.readFileSync(file));return true;}
  const kitchenPage=p.match(/^\/kitchens\/([^/]+)$/);
  if(method==='GET'&&(p==='/explore'||kitchenPage)){let cook=null;if(kitchenPage){cook=listPublicDiscoveryCooks(db,{locale}).cooks.find(c=>c.id===decodeURIComponent(kitchenPage[1]));if(!cook)throw new SofrehGuardError('NOT_FOUND','Kitchen not found.',404);recordStorefrontView(db,cook.id);}html(renderStorefront(cook,locale,cook?publicBusinessConfig(db,cook.id):null));return true;}
  const publicBusiness=p.match(/^\/api\/public\/kitchens\/([^/]+)$/);
  if(method==='GET'&&publicBusiness){const id=decodeURIComponent(publicBusiness[1]),cook=listPublicDiscoveryCooks(db,{locale}).cooks.find(c=>c.id===id);if(!cook)throw new SofrehGuardError('NOT_FOUND','Kitchen not found.',404);json({kitchen:cook,business:publicBusinessConfig(db,id),slots:listSlots(db,id)});return true;}
  if(p==='/api/cook/business'&&method==='GET'){json({business:businessOverview(db,user,Number(url.searchParams.get('days')||30))});return true;}
  if(p==='/api/cook/business'&&method==='PUT'){json({business:saveBusinessConfig(db,user,await body())});return true;}
  if(p==='/api/cook/slots'&&method==='POST'){json({slot:saveSlot(db,user,await body())},201);return true;}
  const slot=p.match(/^\/api\/cook\/slots\/([^/]+)$/);if(slot&&method==='PATCH'){json(toggleSlot(db,user,decodeURIComponent(slot[1]),(await body()).active));return true;}
  if(p==='/api/cook/coupons'&&method==='POST'){json({coupon:saveCoupon(db,user,await body())},201);return true;}
  const coupon=p.match(/^\/api\/cook\/coupons\/([^/]+)$/);if(coupon&&method==='PATCH'){json(toggleCoupon(db,user,decodeURIComponent(coupon[1]),(await body()).active));return true;}
  if(p==='/api/customer/favorites'&&method==='GET'){json({kitchenIds:favoriteKitchens(db,user)});return true;}
  const favorite=p.match(/^\/api\/customer\/favorites\/([^/]+)$/);if(favorite&&method==='PUT'){json({kitchenIds:setFavorite(db,user,decodeURIComponent(favorite[1]),(await body()).enabled)});return true;}
  if(p==='/api/customer/cart/preferences'&&method==='PUT'){json({cart:setCartPreferences(db,user,await body(),locale)});return true;}
  const repeat=p.match(/^\/api\/customer\/orders\/([^/]+)\/repeat$/);
  if(repeat&&method==='POST'){const previous=getCustomerOrderById(db,user,decodeURIComponent(repeat[1]));if(getCustomerCart(db,user,locale).items.length)throw new SofrehGuardError('CART_NOT_EMPTY','Review or clear the current cart first.',409);const cart=upsertCustomerCart(db,user,{cookId:previous.cookId,fulfillmentType:previous.fulfillmentType,items:previous.items.map(i=>({dishId:i.dishId,quantity:i.quantity,selectedOptions:(i.options||[]).map(o=>o.id)}))},locale);json({cart});return true;}
  const cancel=p.match(/^\/api\/customer\/orders\/([^/]+)\/cancel$/);if(cancel&&method==='POST'){json(cancelPendingOrder(db,user,decodeURIComponent(cancel[1])));return true;}
  const messages=p.match(/^\/api\/orders\/([^/]+)\/messages$/);if(messages&&['GET','POST'].includes(method)){const id=decodeURIComponent(messages[1]);json({messages:method==='GET'?orderMessages(db,user,id):addOrderMessage(db,user,id,(await body()).body)},method==='POST'?201:200);return true;}
  const receipt=p.match(/^\/receipts\/([^/]+)$/);if(receipt&&method==='GET'){const id=decodeURIComponent(receipt[1]);let order;if(user?.role==='COOK'){const own=ownBusinessKitchen(db,user);order=listCookKitchenOrders(db,user,own.id).find(o=>o.id===id);if(!order)throw new SofrehGuardError('NOT_FOUND','Receipt not found.',404);order={...order,kitchenNameEn:own.kitchen_name_en,kitchenNameFa:own.kitchen_name_fa};}else{requireRole(user,'CUSTOMER');order=getCustomerOrderById(db,user,id);}html(renderReceipt(order,locale,user.role),true);return true;}
  return false;
}
