import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOOD_PHOTOGRAPHY, foodPhotograph } from '../../shared/src/sampleFoodPhotos.mjs';
import { openSofrehDatabase, getDatabasePragmas } from './db.mjs';
import {
  seedSyntheticStage1Data,
  authenticateByToken,
  listPublicDiscoveryCooks,
  updateCookDeliverySettings,
  updateCookDishPortions,
  getCustomerCart,
  upsertCustomerCart,
  updateCustomerCartItemQuantity,
  clearCustomerCart,
  createOrderTransactional,
  transitionOrderStatusTransactional,
  listCustomerOrders,
  getCustomerOrderById,
  listCookKitchenOrders,
  createOrderReviewTransactional,
  listCookReviews
} from './service.mjs';
import { SofrehGuardError } from './privacy.mjs';
import { listSavedAddresses, saveAddress, getSavedAddress, deleteSavedAddress } from './savedAddresses.mjs';
import { renderShowcase, renderSitemap, renderRobots } from './showcase.mjs';
import {handleCommerceHttp} from './commerceHttp.mjs';
import { getOwnKitchen, saveOwnKitchen, saveOwnDish, KITCHEN_AREAS } from './kitchen.mjs';
import { uploadDishPhoto } from './photos.mjs';
import { renderMobileFrame } from './mobileFrame.mjs';
import { savePushSubscription, removePushSubscription } from './notifications.mjs';
import {
  SUPPORTED_LOCALES,
  normalizeLocale,
  getDirection,
  MAPLIBRE_OPENFREEMAP_CONFIG
} from '../../shared/src/index.mjs';

function assertNoPreciseDeviceLocationInPayload(body) {
  if (!body || typeof body !== 'object') return;
  const forbiddenKeys = [
    'deviceLocation',
    'preciseLocation',
    'userLat',
    'userLng',
    'clientLat',
    'clientLng',
    'geolocationCoords'
  ];
  for (const key of forbiddenKeys) {
    if (key in body && body[key] !== null && body[key] !== undefined) {
      throw new SofrehGuardError(
        'PRECISE_LOCATION_STORAGE_FORBIDDEN',
        'Precise device geolocation coordinates must remain in browser memory and must never be sent to or stored by the backend.',
        400
      );
    }
  }
}

function readJsonBody(req, limit = 1024 * 256) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let exceeded = false;
    req.on('data', (chunk) => {
      if(exceeded)return;
      raw += chunk;
      if (raw.length > limit) {
        exceeded = true;
        raw = '';
        reject(new SofrehGuardError('PAYLOAD_TOO_LARGE', 'Request body too large.', 413));
      }
    });
    req.on('end', () => {
      if(exceeded)return;
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new SofrehGuardError('INVALID_JSON_BODY', 'Request body must be a JSON object.', 400));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new SofrehGuardError('INVALID_JSON', 'Invalid JSON request body.', 400));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, statusCode, payload, locale = 'en-CA', contentType = 'application/json; charset=utf-8') {
  const normLocale = normalizeLocale(locale);
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Language': normLocale,
    'X-Sofreh-Direction': getDirection(normLocale),
    'X-Sofreh-Stage': 'Stage-1-Test-Only',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Sofreh-Token, X-Sofreh-Locale, Idempotency-Key'
  });
  res.end(body);
}

function extractAuthToken(req) {
  const headerToken = req.headers['x-sofreh-token'];
  if (headerToken) return String(headerToken).trim();
  const authHeader = req.headers['authorization'];
  if (authHeader && String(authHeader).toLowerCase().startsWith('bearer ')) {
    return String(authHeader).slice(7).trim();
  }
  return null;
}

export function createSofrehHttpServer({ dbFilePath, database, seedFixtures = true, identityProvider = null, pushPublicKey = null } = {}) {
  const resolvedDbPath =
    dbFilePath ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'sofreh-stage1.sqlite');

  const db = database || openSofrehDatabase(resolvedDbPath);
  if (seedFixtures) seedSyntheticStage1Data(db);

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const localeParam =
      reqUrl.searchParams.get('locale') || req.headers['x-sofreh-locale'] || 'en-CA';
    const locale = normalizeLocale(localeParam);

    if (req.method === 'OPTIONS') {
      sendJson(res, 204, {}, locale);
      return;
    }

    const token = extractAuthToken(req);
    const pathname = reqUrl.pathname;

    try {
      if (identityProvider && pathname.startsWith('/api/auth/')) {
        await identityProvider.handle(req, res);
        return;
      }
      const authUser = identityProvider ? await identityProvider.userFor(req) : authenticateByToken(db, token);
      if (identityProvider && !['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin !== identityProvider.origin) {
        throw new SofrehGuardError('ORIGIN_FORBIDDEN', 'Request origin is not allowed.', 403);
      }
      if(await handleCommerceHttp({req,res,url:reqUrl,db,user:authUser,locale,readJsonBody,sendJson}))return;
      if (identityProvider && pathname === '/api/account' && req.method === 'GET') {
        sendJson(res, 200, await identityProvider.profile(req), locale); return;
      }
      if (identityProvider && req.method === 'GET' && ['/app/workspace.css','/app/workspace.js'].includes(pathname)) {
        const css = pathname.endsWith('.css');
        const assetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../apps/workspace', css ? 'style.css' : 'app.js');
        res.writeHead(200, {'Content-Type':css?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
        res.end(fs.readFileSync(assetPath)); return;
      }
      if (identityProvider && pathname === '/api/account/setup' && req.method === 'POST') {
        sendJson(res, 200, await identityProvider.setup(req, await readJsonBody(req)), locale); return;
      }
      if (identityProvider && pathname === '/api/cook/kitchen' && req.method === 'GET') {
        sendJson(res, 200, { kitchen: getOwnKitchen(db, authUser,locale), areas: KITCHEN_AREAS }, locale); return;
      }
      if (identityProvider && pathname === '/api/cook/kitchen' && req.method === 'PUT') {
        const body = await readJsonBody(req); assertNoPreciseDeviceLocationInPayload(body);
        sendJson(res, 200, { kitchen: saveOwnKitchen(db, authUser, body,locale) }, locale); return;
      }
      const ownDish = pathname.match(/^\/api\/cook\/dishes(?:\/([^/]+))?$/);
      if(identityProvider && pathname === '/api/notifications/config' && req.method === 'GET') {
        sendJson(res,200,{publicKey:pushPublicKey,enabled:Boolean(pushPublicKey)},locale);return;
      }
      if(identityProvider && pathname === '/api/notifications/subscription' && ['POST','DELETE'].includes(req.method)) {
        const body=await readJsonBody(req);
        sendJson(res,200,req.method==='POST'?savePushSubscription(db,authUser,body):removePushSubscription(db,authUser,body.endpoint),locale);return;
      }
      if(identityProvider && pathname === '/sw.js' && req.method === 'GET') {
        res.writeHead(200,{'Content-Type':'text/javascript; charset=utf-8','Cache-Control':'no-cache','Service-Worker-Allowed':'/'});
        res.end(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),'../../../apps/workspace/sw.js')));return;
      }
      if (identityProvider && ownDish && req.method === 'PUT') {
        const body = await readJsonBody(req); assertNoPreciseDeviceLocationInPayload(body);
        sendJson(res, 200, { dish: saveOwnDish(db, authUser, body, ownDish[1] ? decodeURIComponent(ownDish[1]) : null) }, locale); return;
      }
      const photoUpload = pathname.match(/^\/api\/cook\/dishes\/([^/]+)\/photo$/);
      if (identityProvider && photoUpload && req.method === 'PUT') {
        sendJson(res,200,await uploadDishPhoto(db,authUser,decodeURIComponent(photoUpload[1]),await readJsonBody(req,2600000)),locale); return;
      }
      const publicPhoto = pathname.match(/^\/media\/dishes\/([a-f0-9-]{36})\.jpg$/);
      if (identityProvider && publicPhoto && req.method === 'GET') {
        const photo = db.prepare('SELECT jpeg FROM dish_photos WHERE id=?').get(publicPhoto[1]);
        if(!photo)throw new SofrehGuardError('NOT_FOUND','Photo not found.',404);
        res.writeHead(200,{'Content-Type':'image/jpeg','Cache-Control':'public,max-age=86400,immutable','X-Content-Type-Options':'nosniff'});
        res.end(photo.jpeg);return;
      }
      if (identityProvider && req.method === 'GET' && ['/account','/app/customer','/app/cook'].includes(pathname)) {
        if (pathname !== '/account' && !authUser) {
          const entry = new URLSearchParams({role:pathname.endsWith('cook')?'COOK':'CUSTOMER'});
          if(reqUrl.searchParams.has('locale'))entry.set('locale',locale);
          res.writeHead(303,{Location:'/account?'+entry}); res.end(); return;
        }
        if (pathname.startsWith('/app/') && authUser.role !== (pathname.endsWith('cook')?'COOK':'CUSTOMER')) {
          // Entry links guide a signed-in person to their own workspace. API
          // role boundaries below still reject another role's operations.
          const entry = new URLSearchParams();
          let destination;
          if(['COOK','CUSTOMER'].includes(authUser.role))destination='/app/'+authUser.role.toLowerCase();
          else{destination='/account';entry.set('role',pathname.endsWith('cook')?'COOK':'CUSTOMER');}
          if(reqUrl.searchParams.has('locale'))entry.set('locale',locale);
          res.writeHead(303,{Location:destination+(entry.size?'?'+entry:'')});res.end();return;
        }
        const app = pathname === '/account' ? 'account' : 'workspace';
        if(app==='workspace'&&reqUrl.searchParams.get('view')==='mobile'){
          res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-src 'self'; frame-ancestors 'self'"});
          res.end(renderMobileFrame(pathname.endsWith('cook')?'cook':'customer',locale,reqUrl.searchParams.get('tab')||''));return;
        }
        const htmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../apps', app, 'index.html');
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});
        const role = pathname.endsWith('cook') || reqUrl.searchParams.get('role')==='COOK' ? 'cook' : 'customer';
        const installMetadata = `<link rel="manifest" href="/app/${role}.webmanifest"><link rel="apple-touch-icon" href="/assets/brand/app-icon-192.png"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Sofreh">`;
        let workspaceHtml=fs.readFileSync(htmlPath,'utf8').replace('</head>',installMetadata+'</head>');
        if(app==='workspace'&&reqUrl.searchParams.get('embedded')==='mobile')workspaceHtml=workspaceHtml.replace('<html ', '<html data-mobile-frame ');
        res.end(workspaceHtml); return;
      }
      const manifest = pathname.match(/^\/app\/(customer|cook)\.webmanifest$/);
      if(identityProvider && manifest && req.method==='GET'){
        sendJson(res,200,{id:'/app/'+manifest[1],name:manifest[1]==='cook'?'Sofreh Cook':'Sofreh Customer',short_name:'Sofreh',start_url:'/app/'+manifest[1],scope:'/',display:'standalone',background_color:'#fff9ef',theme_color:'#23392f',icons:[{src:'/assets/brand/app-icon-192.png',sizes:'192x192',type:'image/png',purpose:'any maskable'},{src:'/assets/brand/app-icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},locale,'application/manifest+json; charset=utf-8');return;
      }
      if(identityProvider && /^\/preview\/(customer|cook)(\/.*)?$/.test(pathname)) {
        res.writeHead(410,{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'});res.end('This preview link has been retired. / این پیوند پیش‌نمایش غیرفعال شده است.');return;
      }
      if (req.method === 'GET' && ['/', '/showcase', '/showcase/index.html'].includes(pathname)) {
        res.writeHead(308, { Location: '/en' });
        res.end();
        return;
      }
      if (req.method === 'GET' && ['/en', '/fa', '/en/', '/fa/'].includes(pathname)) {
        const language = pathname.startsWith('/fa') ? 'fa' : 'en';
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Language': language, 'Cache-Control': 'public, max-age=0, s-maxage=300' });
        res.end(renderShowcase(language, { accountsEnabled: Boolean(identityProvider) }));
        return;
      }
      if (req.method === 'GET' && ['/robots.txt', '/sitemap.xml'].includes(pathname)) {
        const xml = pathname === '/sitemap.xml';
        res.writeHead(200, { 'Content-Type': xml ? 'application/xml; charset=utf-8' : 'text/plain; charset=utf-8' });
        res.end(xml ? renderSitemap() : renderRobots());
        return;
      }
      const demoAssetTypes = {
        ...Object.fromEntries(FOOD_PHOTOGRAPHY.flatMap(name => [480, 800, 1200].map(width => [foodPhotograph(name, width).slice('/assets/'.length), 'image/webp']))),
        'demo-food/ghormeh-sabzi-majidi-480.webp': 'image/webp',
        'demo-food/ghormeh-sabzi-majidi-800.webp': 'image/webp',
        'demo-food/ghormeh-sabzi-majidi-1280.webp': 'image/webp',
        'demo-food/zereshk-polo-400.webp': 'image/webp',
        'demo-food/ash-reshteh-480.webp': 'image/webp',
        'demo-food/ash-reshteh-800.webp': 'image/webp',
        'demo-food/ash-reshteh-1280.webp': 'image/webp',
        'demo-food/ghormeh-sabzi.jpg': 'image/jpeg',
        'demo-food/ghormeh-sabzi-majidi.jpg': 'image/jpeg',
        'demo-food/zereshk-polo.jpg': 'image/jpeg',
        'demo-food/tahchin.jpg': 'image/jpeg',
        'demo-food/fesenjan.jpg': 'image/jpeg',
        'demo-food/mirza-ghasemi.jpg': 'image/jpeg',
        'demo-food/baghali-polo.jpg': 'image/jpeg',
        'demo-food/kalam-polo.jpg': 'image/jpeg',
        'demo-food/ash-reshteh.jpg': 'image/jpeg',
        'fonts/NotoNastaliqUrdu.ttf': 'font/ttf',
        'fonts/OFL-NotoNastaliqUrdu.txt': 'text/plain; charset=utf-8',
        'fonts/Vazirmatn-wght.woff2': 'font/woff2',
        'fonts/Vazirmatn-OFL.txt': 'text/plain; charset=utf-8',
        'mui-responsive.js': 'text/javascript; charset=utf-8',
        'brand/wordmark-fa.png': 'image/png',
        'brand/wordmark-fa.svg': 'image/svg+xml',
        'brand/app-icon-192.png': 'image/png',
        'brand/app-icon-512.png': 'image/png',
        'brand/app-icon.svg': 'image/svg+xml',
        'brand/wordmark-fa.html': 'text/html; charset=utf-8',
        'kitchens/pari.svg': 'image/svg+xml',
        'kitchens/kambiz.svg': 'image/svg+xml',
        'kitchens/golnar.svg': 'image/svg+xml',
        'credits.html': 'text/html; charset=utf-8'
      };
      // Browsers request this automatically for every preview page. A
      // no-content response keeps the synthetic preview console clean without
      // inventing a brand asset or exposing a filesystem path.
      if (req.method === 'GET' && pathname === '/favicon.ico') {
        res.writeHead(204, { 'Cache-Control': 'no-store' });
        res.end();
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/assets/')) {
        const assetName = pathname.slice('/assets/'.length);
        if (!Object.hasOwn(demoAssetTypes, assetName)) {
          sendJson(res, 404, { error: { code: 'NOT_FOUND' } }, locale);
          return;
        }
        const assetPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'assets', assetName);
        const assetBytes = fs.readFileSync(assetPath);
        res.writeHead(200, { 'Content-Type': demoAssetTypes[assetName], 'X-Content-Type-Options': 'nosniff' });
        res.end(assetBytes);
        return;
      }
      const addressMatch = pathname.match(/^\/api\/customer\/addresses(?:\/([^/]+))?$/);
      if (addressMatch) {
        const id = addressMatch[1] ? decodeURIComponent(addressMatch[1]) : null;
        if (req.method === 'GET') {
          sendJson(res, 200, id ? { address: getSavedAddress(db, authUser, id) } : { addresses: listSavedAddresses(db, authUser) }, locale);
          return;
        }
        if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
          const body = await readJsonBody(req);
          assertNoPreciseDeviceLocationInPayload(body);
          const address = saveAddress(db, authUser, id, body);
          sendJson(res, id ? 200 : 201, { address }, locale);
          return;
        }
        if (req.method === 'DELETE' && id) {
          deleteSavedAddress(db, authUser, id);
          sendJson(res, 200, { deleted: true }, locale);
          return;
        }
      }
      // GET /preview/customer & GET /preview/cook (Reviewable Web Previews connected to shared backend)
      if (
        req.method === 'GET' &&
        (pathname === '/preview/customer' || pathname === '/preview/customer/index.html')
      ) {
        const htmlPath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '..',
          '..',
          '..',
          'apps',
          'customer-mobile',
          'preview',
          'index.html'
        );
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(html);
        return;
      }

      if (
        req.method === 'GET' &&
        (pathname === '/preview/cook' || pathname === '/preview/cook/index.html')
      ) {
        const htmlPath = path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '..',
          '..',
          '..',
          'apps',
          'cook-mobile',
          'preview',
          'index.html'
        );
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store'
        });
        res.end(html);
        return;
      }

      if (req.method === 'GET' && pathname === '/preview/classroom') {
        const htmlPath = path.join(
          path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..',
          'apps', 'classroom-preview', 'index.html'
        );
        const html = fs.readFileSync(htmlPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end(html);
        return;
      }

      // GET /api/health
      if (req.method === 'GET' && pathname === '/api/health') {
        const pragmas = getDatabasePragmas(db);
        sendJson(
          res,
          200,
          {
            status: 'ok',
            stage: 'Stage 1',
            syntheticFixtureMode: seedFixtures ? 'TEST ONLY' : null,
            accountAuthenticationEnabled: Boolean(identityProvider),
            supportedLocales: SUPPORTED_LOCALES,
            activeLocale: locale,
            direction: getDirection(locale),
            sqlite: identityProvider ? {journalMode:pragmas.journalMode,foreignKeys:pragmas.foreignKeys,busyTimeoutMs:pragmas.busyTimeoutMs} : pragmas,
            mapConfig: MAPLIBRE_OPENFREEMAP_CONFIG
          },
          locale
        );
        return;
      }

      // GET /api/discovery/cooks
      if (req.method === 'GET' && pathname === '/api/discovery/cooks') {
        const hasBounds =
          reqUrl.searchParams.has('minLat') &&
          reqUrl.searchParams.has('maxLat') &&
          reqUrl.searchParams.has('minLng') &&
          reqUrl.searchParams.has('maxLng');

        const bounds = hasBounds
          ? {
              minLat: Number(reqUrl.searchParams.get('minLat')),
              maxLat: Number(reqUrl.searchParams.get('maxLat')),
              minLng: Number(reqUrl.searchParams.get('minLng')),
              maxLng: Number(reqUrl.searchParams.get('maxLng'))
            }
          : null;

        const result = listPublicDiscoveryCooks(db, { locale, bounds });
        sendJson(res, 200, result, locale);
        return;
      }

      // GET /api/customer/cart
      if (req.method === 'GET' && pathname === '/api/customer/cart') {
        const cart = getCustomerCart(db, authUser, locale);
        sendJson(res, 200, { cart }, locale);
        return;
      }

      // PUT /api/customer/cart
      if (req.method === 'PUT' && pathname === '/api/customer/cart') {
        const body = await readJsonBody(req);
        assertNoPreciseDeviceLocationInPayload(body);
        const cart = upsertCustomerCart(db, authUser, body, locale);
        sendJson(res, 200, { cart }, locale);
        return;
      }

      // POST /api/customer/cart/items
      if (req.method === 'POST' && pathname === '/api/customer/cart/items') {
        const body = await readJsonBody(req);
        assertNoPreciseDeviceLocationInPayload(body);
        const cart = updateCustomerCartItemQuantity(db, authUser, body, locale);
        sendJson(res, 200, { cart }, locale);
        return;
      }

      // DELETE /api/customer/cart
      if (req.method === 'DELETE' && pathname === '/api/customer/cart') {
        const cart = clearCustomerCart(db, authUser, locale);
        sendJson(res, 200, { cart }, locale);
        return;
      }

      // POST /api/customer/orders
      if (req.method === 'POST' && pathname === '/api/customer/orders') {
        const body = await readJsonBody(req);
        assertNoPreciseDeviceLocationInPayload(body);
        const headerIdempotencyKey = req.headers['idempotency-key']
          ? String(req.headers['idempotency-key']).trim()
          : undefined;
        const createdOrder = createOrderTransactional(db, authUser, {
          ...body,
          idempotencyKey: body.idempotencyKey || headerIdempotencyKey
        });
        sendJson(res, 201, { order: createdOrder }, locale);
        return;
      }

      // GET /api/customer/orders
      if (req.method === 'GET' && pathname === '/api/customer/orders') {
        const orders = listCustomerOrders(db, authUser);
        sendJson(res, 200, { orders }, locale);
        return;
      }

      // GET /api/customer/orders/:orderId
      const custOrderMatch = pathname.match(/^\/api\/customer\/orders\/([^/]+)$/);
      if (req.method === 'GET' && custOrderMatch) {
        const order = getCustomerOrderById(db, authUser, decodeURIComponent(custOrderMatch[1]));
        sendJson(res, 200, { order }, locale);
        return;
      }

      // POST /api/orders/:orderId/reviews
      const orderReviewMatch = pathname.match(/^\/api\/orders\/([^/]+)\/reviews$/);
      if (req.method === 'POST' && orderReviewMatch) {
        const orderId = decodeURIComponent(orderReviewMatch[1]);
        const body = await readJsonBody(req);
        assertNoPreciseDeviceLocationInPayload(body);
        const result = createOrderReviewTransactional(db, authUser, {
          orderId,
          rating: body.rating,
          comment: body.comment
        });
        sendJson(res, 201, result, locale);
        return;
      }

      // GET /api/cooks/:cookId/reviews
      const cookReviewsMatch = pathname.match(/^\/api\/cooks\/([^/]+)\/reviews$/);
      if (req.method === 'GET' && cookReviewsMatch) {
        const cookId = decodeURIComponent(cookReviewsMatch[1]);
        const result = listCookReviews(db, cookId);
        sendJson(res, 200, result, locale);
        return;
      }

      // GET /api/cook/kitchen/:cookId/orders
      const cookOrdersMatch = pathname.match(/^\/api\/cook\/kitchen\/([^/]+)\/orders$/);
      if (req.method === 'GET' && cookOrdersMatch) {
        const cookId = decodeURIComponent(cookOrdersMatch[1]);
        const orders = listCookKitchenOrders(db, authUser, cookId);
        sendJson(res, 200, { orders }, locale);
        return;
      }

      // PATCH /api/cook/kitchen/:cookId/delivery-settings
      const cookDeliveryMatch = pathname.match(
        /^\/api\/cook\/kitchen\/([^/]+)\/delivery-settings$/
      );
      if (req.method === 'PATCH' && cookDeliveryMatch) {
        const cookId = decodeURIComponent(cookDeliveryMatch[1]);
        const body = await readJsonBody(req);
        const updatedCook = updateCookDeliverySettings(db, authUser, {
          cookId,
          deliveryFeeCents: body.deliveryFeeCents,
          supportsDelivery: body.supportsDelivery,
          supportsPickup: body.supportsPickup,
          deliveryRadiusKm: body.deliveryRadiusKm
          ,fulfillmentMode: body.fulfillmentMode
        });
        sendJson(res, 200, { cook: updatedCook }, locale);
        return;
      }

      // PATCH /api/cook/kitchen/:cookId/dishes/:dishId
      const cookDishMatch = pathname.match(
        /^\/api\/cook\/kitchen\/([^/]+)\/dishes\/([^/]+)$/
      );
      if (req.method === 'PATCH' && cookDishMatch) {
        const cookId = decodeURIComponent(cookDishMatch[1]);
        const dishId = decodeURIComponent(cookDishMatch[2]);
        const body = await readJsonBody(req);
        const updatedDish = updateCookDishPortions(db, authUser, {
          cookId,
          dishId,
          totalPortions: body.totalPortions,
          remainingPortions: body.remainingPortions,
          expectedRemainingPortions: body.expectedRemainingPortions,
          priceCents: body.priceCents,
          availabilityMode: body.availabilityMode
        });
        sendJson(res, 200, { dish: updatedDish }, locale);
        return;
      }

      // POST /api/cook/orders/:orderId/status
      const cookOrderStatusMatch = pathname.match(/^\/api\/cook\/orders\/([^/]+)\/status$/);
      if (req.method === 'POST' && cookOrderStatusMatch) {
        const orderId = decodeURIComponent(cookOrderStatusMatch[1]);
        const body = await readJsonBody(req);
        const updatedOrder = transitionOrderStatusTransactional(db, authUser, {
          orderId,
          nextStatus: body.nextStatus
        });
        sendJson(res, 200, { order: updatedOrder }, locale);
        return;
      }

      sendJson(
        res,
        404,
        { error: { code: 'ENDPOINT_NOT_FOUND', message: `No route for ${req.method} ${pathname}` } },
        locale
      );
    } catch (err) {
      if (err instanceof SofrehGuardError) {
        sendJson(
          res,
          err.httpStatus || 400,
          { error: { code: err.code, message: err.message } },
          locale
        );
        return;
      }
      sendJson(
        res,
        500,
        {
          error: {
            code: 'INTERNAL_SERVER_ERROR',
            message: identityProvider ? 'Unexpected server error' : err instanceof Error ? err.message : 'Unexpected server error'
          }
        },
        locale
      );
    }
  });

  return { server, db };
}

// Allow direct CLI startup when invoked directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.PORT || 4120);
  const { server } = createSofrehHttpServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`Sofreh Stage 1 Backend listening on http://127.0.0.1:${port}`);
  });
}
