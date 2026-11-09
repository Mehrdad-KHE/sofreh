import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import {
  SUPPORTED_LOCALES,
  getDirection,
  isRTLLocale,
  t,
  formatCurrencyCents,
  MAPLIBRE_OPENFREEMAP_CONFIG,
  SYNTHETIC_TEST_COOKS,
  buildCookDiscoveryGeoJSON
} from '../packages/shared/src/index.mjs';

import {
  openSofrehDatabase,
  getDatabasePragmas,
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
  listCookReviews,
  sanitizeOrderForCook,
  createSofrehHttpServer
} from '../packages/backend/src/index.mjs';

import {
  CUSTOMER_APP_IDENTITY,
  calculateCustomerCartTotals,
  buildCustomerScreenViewModel
} from '../apps/customer-mobile/src/customerController.mjs';

import {
  COOK_APP_IDENTITY,
  buildCookScreenViewModel
} from '../apps/cook-mobile/src/cookController.mjs';
import { mountPreviewHtmlInVm } from './previewDomHarness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB_PATH = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-stage1-wal.sqlite');

function cleanupTestDbFiles(dbPath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const target = `${dbPath}${suffix}`;
    if (fs.existsSync(target)) {
      try {
        fs.unlinkSync(target);
      } catch {
        // ignore cleanup lock
      }
    }
  }
}

describe('Sofreh Stage 1 Implementation Suite (v2)', () => {
  let db;

  before(() => {
    cleanupTestDbFiles(TEST_DB_PATH);
    db = openSofrehDatabase(TEST_DB_PATH);
    seedSyntheticStage1Data(db);
  });

  after(() => {
    if (db) {
      db.close();
    }
    cleanupTestDbFiles(TEST_DB_PATH);
  });

  test('1. Shared Transactional SQLite Backend enforces WAL mode, foreign keys, and BEGIN IMMEDIATE transactions', () => {
    const pragmas = getDatabasePragmas(db);
    assert.equal(pragmas.journalMode, 'wal', 'File-backed SQLite database must run in WAL journal mode');
    assert.equal(pragmas.foreignKeys, true, 'SQLite foreign_keys pragma must be enabled');
    assert.ok(pragmas.busyTimeoutMs >= 5000, 'SQLite busy_timeout must be configured');
    assert.ok(
      pragmas.stats.beginImmediateCount >= 1,
      'Seeding must execute inside an explicit BEGIN IMMEDIATE transaction'
    );
    assert.equal(pragmas.stats.rollbackCount, 0);
  });

  test('2. Real MapLibre + OpenFreeMap config & synthetic TEST ONLY cook fixtures are valid and key-free', () => {
    assert.equal(MAPLIBRE_OPENFREEMAP_CONFIG.provider, 'MapLibre + OpenFreeMap');
    assert.equal(
      MAPLIBRE_OPENFREEMAP_CONFIG.styleUrl,
      'https://tiles.openfreemap.org/styles/liberty'
    );
    assert.equal(MAPLIBRE_OPENFREEMAP_CONFIG.requiresApiKey, false);
    assert.equal(MAPLIBRE_OPENFREEMAP_CONFIG.billingEnabled, false);

    const discovery = listPublicDiscoveryCooks(db, { locale: 'en-CA' });
    assert.equal(discovery.isSyntheticTestDataset, true);
    assert.equal(discovery.syntheticBadgeLabel, 'TEST ONLY');
    assert.equal(discovery.cooks.length, SYNTHETIC_TEST_COOKS.length);

    for (const cook of discovery.cooks) {
      assert.equal(cook.isSyntheticTestFixture, true);
      assert.equal(cook.syntheticBadgeLabel, 'TEST ONLY');
      assert.ok(cook.kitchenName.includes('TEST ONLY'));
      // Privacy check on public discovery:
      assert.equal('exactPickupAddressPrivate' in cook, false);
      assert.equal('exact_pickup_address_private' in cook, false);
      assert.equal('userId' in cook, false);
      assert.equal('phonePrivate' in cook, false);
    }

    const geoJson = buildCookDiscoveryGeoJSON(discovery.cooks, 'en-CA');
    assert.equal(geoJson.type, 'FeatureCollection');
    assert.equal(geoJson.features.length, SYNTHETIC_TEST_COOKS.length);
    for (const feature of geoJson.features) {
      assert.equal(feature.geometry.type, 'Point');
      assert.equal(feature.properties.isSyntheticTestFixture, true);
      assert.equal(feature.properties.syntheticBadgeLabel, 'TEST ONLY');
    }
  });

  test('3. Localization supports en-CA (LTR) and fa-IR (RTL) across shared dictionary and mobile view models', () => {
    assert.deepEqual(SUPPORTED_LOCALES, ['en-CA', 'fa-IR']);
    assert.equal(getDirection('en-CA'), 'ltr');
    assert.equal(isRTLLocale('en-CA'), false);
    assert.equal(getDirection('fa-IR'), 'rtl');
    assert.equal(isRTLLocale('fa-IR'), true);

    assert.match(t('en-CA', 'banner.testOnly'), /TEST ONLY/);
    assert.match(t('fa-IR', 'banner.testOnly'), /TEST ONLY/);
    assert.equal(formatCurrencyCents(1850, 'en-CA'), 'CA$18.50');
    assert.match(formatCurrencyCents(1850, 'fa-IR'), /۱۸\.۵۰/);

    const discoveryEn = listPublicDiscoveryCooks(db, { locale: 'en-CA' });
    const discoveryFa = listPublicDiscoveryCooks(db, { locale: 'fa-IR' });

    const custVmEn = buildCustomerScreenViewModel({
      locale: 'en-CA',
      cooks: discoveryEn.cooks,
      selectedCookId: 'cook-test-pari'
    });
    const custVmFa = buildCustomerScreenViewModel({
      locale: 'fa-IR',
      cooks: discoveryFa.cooks,
      selectedCookId: 'cook-test-pari'
    });

    assert.equal(custVmEn.direction, 'ltr');
    assert.equal(custVmFa.direction, 'rtl');
    assert.match(custVmFa.selectedCook.kitchenName, /مامان پری/);

    const cookVmEn = buildCookScreenViewModel({
      locale: 'en-CA',
      kitchen: discoveryEn.cooks[0]
    });
    const cookVmFa = buildCookScreenViewModel({
      locale: 'fa-IR',
      kitchen: discoveryFa.cooks[0]
    });
    assert.equal(cookVmEn.direction, 'ltr');
    assert.equal(cookVmFa.direction, 'rtl');
  });

  test('4. Separate Customer and Cook Mobile Apps have distinct app manifests, roles, and UI previews', () => {
    assert.equal(CUSTOMER_APP_IDENTITY.appId, 'ca.sofreh.customer');
    assert.equal(CUSTOMER_APP_IDENTITY.appRole, 'CUSTOMER');
    assert.equal(COOK_APP_IDENTITY.appId, 'ca.sofreh.cook');
    assert.equal(COOK_APP_IDENTITY.appRole, 'COOK');
    assert.notEqual(CUSTOMER_APP_IDENTITY.appId, COOK_APP_IDENTITY.appId);

    const customerManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'apps', 'customer-mobile', 'app.json'), 'utf8')
    );
    const cookManifest = JSON.parse(
      fs.readFileSync(path.join(__dirname, '..', 'apps', 'cook-mobile', 'app.json'), 'utf8')
    );

    assert.equal(customerManifest.expo.android.package, 'ca.sofreh.customer');
    assert.equal(cookManifest.expo.android.package, 'ca.sofreh.cook');
    assert.equal(customerManifest.expo.extra.appRole, 'CUSTOMER');
    assert.equal(cookManifest.expo.extra.appRole, 'COOK');
    assert.equal(
      customerManifest.expo.extra.mapStyleUrl,
      'https://tiles.openfreemap.org/styles/liberty'
    );

    const customerPreviewHtml = fs.readFileSync(
      path.join(__dirname, '..', 'apps', 'customer-mobile', 'preview', 'index.html'),
      'utf8'
    );
    const cookPreviewHtml = fs.readFileSync(
      path.join(__dirname, '..', 'apps', 'cook-mobile', 'preview', 'index.html'),
      'utf8'
    );
    for (const html of [customerPreviewHtml, cookPreviewHtml]) {
      assert.match(html, /<meta charset="UTF-8"/i);
      assert.match(html, /[\u0600-\u06FF]{3,}/, 'Preview HTML must contain real UTF-8 Persian text');
      assert.doesNotMatch(html, /\uFFFD|\?\?\?/, 'Preview HTML must not contain corrupted placeholders');
    }
  });

  test('5. Server-enforced role and privacy boundaries block cross-role and cross-account actions', () => {
    const customerNima = authenticateByToken(db, 'test-token-customer-nima');
    const customerSara = authenticateByToken(db, 'test-token-customer-sara');
    const cookPari = authenticateByToken(db, 'test-token-cook-pari');
    const cookKambiz = authenticateByToken(db, 'test-token-cook-kambiz');

    // Customer cannot update cook delivery settings
    assert.throws(
      () =>
        updateCookDeliverySettings(db, customerNima, {
          cookId: 'cook-test-pari',
          deliveryFeeCents: 100
        }),
      (err) => err.code === 'ROLE_FORBIDDEN' && err.httpStatus === 403
    );

    // Cook cannot place a customer order
    assert.throws(
      () =>
        createOrderTransactional(db, cookPari, {
          cookId: 'cook-test-pari',
          fulfillmentType: 'pickup',
          items: [{ dishId: 'dish-test-ghormeh-1', quantity: 1 }]
        }),
      (err) => err.code === 'ROLE_FORBIDDEN' && err.httpStatus === 403
    );

    // Cook Kambiz cannot modify Cook Pari's kitchen delivery fee or view Cook Pari's orders
    assert.throws(
      () =>
        updateCookDeliverySettings(db, cookKambiz, {
          cookId: 'cook-test-pari',
          deliveryFeeCents: 900
        }),
      (err) => err.code === 'COOK_OWNERSHIP_FORBIDDEN' && err.httpStatus === 403
    );

    assert.throws(
      () => listCookKitchenOrders(db, cookKambiz, 'cook-test-pari'),
      (err) => err.code === 'COOK_OWNERSHIP_FORBIDDEN' && err.httpStatus === 403
    );

    // Place a pickup order as Customer Nima and verify privacy rules
    const pickupOrder = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'pickup',
      simulatedPaymentMethod: 'SIMULATED_CARD',
      items: [{ dishId: 'dish-test-ghormeh-1', quantity: 1 }]
    });

    // While PENDING, exact pickup address must NOT be released to Customer Nima
    assert.equal(pickupOrder.status, 'PENDING');
    assert.equal(pickupOrder.pickupAddressReleased, null);
    assert.equal(pickupOrder.deliveryFeeCents, 0, 'Pickup order has 0 delivery fee');
    assert.equal(pickupOrder.simulatedPaymentStatus, 'SIMULATED_AUTHORIZED');

    // Customer Sara cannot access Customer Nima's order
    assert.throws(
      () => getCustomerOrderById(db, customerSara, pickupOrder.id),
      (err) => err.code === 'PRIVACY_BOUNDARY_FORBIDDEN' && err.httpStatus === 403
    );

    // Once Cook Pari accepts the pickup order, the exact pickup address is released to Customer Nima
    transitionOrderStatusTransactional(db, cookPari, {
      orderId: pickupOrder.id,
      nextStatus: 'ACCEPTED'
    });

    const acceptedOrderView = getCustomerOrderById(db, customerNima, pickupOrder.id);
    assert.equal(acceptedOrderView.status, 'ACCEPTED');
    assert.ok(
      acceptedOrderView.pickupAddressReleased &&
        acceptedOrderView.pickupAddressReleased.includes('5480 Yonge St'),
      'Confirmed pickup order releases pickup address to owning customer'
    );
  });

  test('6. Cook-set delivery fee, simulated payment lifecycle, and atomic portion rollback work inside BEGIN IMMEDIATE', () => {
    const customerNima = authenticateByToken(db, 'test-token-customer-nima');
    const cookPari = authenticateByToken(db, 'test-token-cook-pari');

    // Cook Pari updates her cook-set delivery fee to 525 cents (CA$5.25)
    const updatedCook = updateCookDeliverySettings(db, cookPari, {
      cookId: 'cook-test-pari',
      deliveryFeeCents: 525,
      supportsDelivery: true,
      supportsPickup: true
    });
    assert.equal(updatedCook.deliveryFeeCents, 525);

    // Verify customer cart calculation matches cook-set delivery fee
    const cartTotalsPickup = calculateCustomerCartTotals(
      updatedCook,
      [{ dishId: 'dish-test-zereshk-2', quantity: 2 }],
      'pickup'
    );
    assert.equal(cartTotalsPickup.subtotalCents, 3500);
    assert.equal(cartTotalsPickup.deliveryFeeCents, 0);
    assert.equal(cartTotalsPickup.totalCents, 3500);

    const cartTotalsDelivery = calculateCustomerCartTotals(
      updatedCook,
      [{ dishId: 'dish-test-zereshk-2', quantity: 2 }],
      'delivery'
    );
    assert.equal(cartTotalsDelivery.subtotalCents, 3500);
    assert.equal(cartTotalsDelivery.deliveryFeeCents, 525);
    assert.equal(cartTotalsDelivery.totalCents, 4025);

    // Place a delivery order for 2 portions of Zereshk Polo (5 remaining initially -> 3 remaining)
    const deliveryOrder = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'delivery',
      deliveryAddress: '120 Empress Ave, North York, ON (TEST ONLY)',
      simulatedPaymentMethod: 'SIMULATED_INTERAC',
      items: [{ dishId: 'dish-test-zereshk-2', quantity: 2 }]
    });

    assert.equal(deliveryOrder.subtotalCents, 3500);
    assert.equal(deliveryOrder.deliveryFeeCents, 525);
    assert.equal(deliveryOrder.totalCents, 4025);
    assert.equal(deliveryOrder.simulatedPaymentStatus, 'SIMULATED_AUTHORIZED');
    assert.equal(deliveryOrder.pickupAddressReleased, null, 'Delivery order never releases cook pickup address');

    // Cook view of PENDING delivery order keeps deliveryAddressForFulfillment null until accepted, and strips payment reference
    const cookOrders = listCookKitchenOrders(db, cookPari, 'cook-test-pari');
    const cookDeliveryView = cookOrders.find((o) => o.id === deliveryOrder.id);
    assert.ok(cookDeliveryView);
    assert.equal(
      cookDeliveryView.deliveryAddressForFulfillment,
      null,
      'PENDING delivery order must not expose customer delivery address before cook acceptance'
    );
    assert.equal('simulatedPaymentReference' in cookDeliveryView, false);

    // Attempt to over-order 99 portions -> must fail with INSUFFICIENT_PORTIONS and rollback BEGIN IMMEDIATE
    const statsBeforeRollback = getDatabasePragmas(db).stats.rollbackCount;
    assert.throws(
      () =>
        createOrderTransactional(db, customerNima, {
          cookId: 'cook-test-pari',
          fulfillmentType: 'pickup',
          items: [{ dishId: 'dish-test-zereshk-2', quantity: 99 }]
        }),
      (err) => err.code === 'INSUFFICIENT_PORTIONS' && err.httpStatus === 409
    );
    const statsAfterRollback = getDatabasePragmas(db).stats.rollbackCount;
    assert.equal(statsAfterRollback, statsBeforeRollback + 1, 'Failed order must trigger SQLite ROLLBACK');

    // Cook rejects the delivery order -> portions are restored (3 -> 5) and payment becomes SIMULATED_REFUNDED
    const rejectedCookView = transitionOrderStatusTransactional(db, cookPari, {
      orderId: deliveryOrder.id,
      nextStatus: 'REJECTED'
    });
    assert.equal(rejectedCookView.status, 'REJECTED');
    assert.equal(rejectedCookView.simulatedPaymentStatus, 'SIMULATED_REFUNDED');
    assert.equal(
      rejectedCookView.deliveryAddressForFulfillment,
      null,
      'Rejected order no longer exposes customer delivery address to cook'
    );

    const afterRejectDiscovery = listPublicDiscoveryCooks(db, { locale: 'en-CA' });
    const pariAfter = afterRejectDiscovery.cooks.find((c) => c.id === 'cook-test-pari');
    const zereshkAfter = pariAfter.dishes.find((d) => d.id === 'dish-test-zereshk-2');
    assert.equal(zereshkAfter.remainingPortions, 5, 'Rejected order must atomically restore dish portions');
  });

  test('7. HTTP REST API Server end-to-end integration test with en-CA and fa-IR headers', async () => {
    const httpDbPath = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-http-wal.sqlite');
    cleanupTestDbFiles(httpDbPath);

    const { server, db: httpDb } = createSofrehHttpServer({ dbFilePath: httpDbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // 1. Health check in fa-IR
      const healthRes = await fetch(`${baseUrl}/api/health?locale=fa-IR`);
      assert.equal(healthRes.status, 200);
      assert.equal(healthRes.headers.get('x-sofreh-direction'), 'rtl');
      const healthJson = await healthRes.json();
      assert.equal(healthJson.sqlite.journalMode, 'wal');
      assert.equal(healthJson.mapConfig.styleUrl, 'https://tiles.openfreemap.org/styles/liberty');

      // 2. Discovery in fa-IR
      const discRes = await fetch(`${baseUrl}/api/discovery/cooks?locale=fa-IR`);
      assert.equal(discRes.status, 200);
      const discJson = await discRes.json();
      assert.equal(discJson.syntheticBadgeLabel, 'TEST ONLY');
      assert.equal(discJson.geoJson.type, 'FeatureCollection');

      // 3. Unauthorized order attempt returns 401
      const unauthRes = await fetch(`${baseUrl}/api/customer/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookId: 'cook-test-kambiz',
          fulfillmentType: 'pickup',
          items: [{ dishId: 'dish-test-fesenjan-3', quantity: 1 }]
        })
      });
      assert.equal(unauthRes.status, 401);

      // 4. Customer Sara places a delivery order with Chef Kambiz (deliveryFeeCents = 600)
      const orderRes = await fetch(`${baseUrl}/api/customer/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token-customer-sara',
          'X-Sofreh-Locale': 'fa-IR'
        },
        body: JSON.stringify({
          cookId: 'cook-test-kambiz',
          fulfillmentType: 'delivery',
          deliveryAddress: '88 Sheppard Ave E, North York, ON (TEST ONLY)',
          simulatedPaymentMethod: 'SIMULATED_CARD',
          items: [{ dishId: 'dish-test-fesenjan-3', quantity: 1 }]
        })
      });
      assert.equal(orderRes.status, 201);
      const { order } = await orderRes.json();
      assert.equal(order.subtotalCents, 2100);
      assert.equal(order.deliveryFeeCents, 600);
      assert.equal(order.totalCents, 2700);
      assert.equal(order.simulatedPaymentStatus, 'SIMULATED_AUTHORIZED');

      // 5. Chef Kambiz transitions order PENDING -> ACCEPTED -> READY -> COMPLETED
      for (const nextStatus of ['ACCEPTED', 'READY', 'COMPLETED']) {
        const stRes = await fetch(`${baseUrl}/api/cook/orders/${order.id}/status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token-cook-kambiz'
          },
          body: JSON.stringify({ nextStatus })
        });
        assert.equal(stRes.status, 200);
        const stJson = await stRes.json();
        assert.equal(stJson.order.status, nextStatus);
        if (nextStatus === 'COMPLETED') {
          assert.equal(stJson.order.simulatedPaymentStatus, 'SIMULATED_PAID');
        }
      }
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      httpDb.close();
      cleanupTestDbFiles(httpDbPath);
    }
  });

  test('8. Cross-client browser preview click flow: Customer UI POSTs order -> Cook UI loads & Accepts/Rejects -> Customer UI reload/reconnect reads persisted SQLite state', async () => {
    const uiDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-cross-client-ui-wal.sqlite'
    );
    cleanupTestDbFiles(uiDbPath);

    const { server, db: uiDb } = createSofrehHttpServer({ dbFilePath: uiDbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      // Fetch both preview HTML pages directly from the running localhost server
      const [custHtmlRes, cookHtmlRes] = await Promise.all([
        fetch(`${baseUrl}/preview/customer`),
        fetch(`${baseUrl}/preview/cook`)
      ]);
      assert.equal(custHtmlRes.status, 200);
      assert.equal(cookHtmlRes.status, 200);
      const custHtml = await custHtmlRes.text();
      const cookHtml = await cookHtmlRes.text();

      // Mount Customer UI and Cook UI as separate client instances talking to the same localhost backend
      const customerClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      const cookClient = mountPreviewHtmlInVm(cookHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/cook'
      });

      await customerClient.waitForNetworkIdle();
      await cookClient.waitForNetworkIdle();

      // Verify initial Customer UI loaded synthetic cooks & 8 portions of Ghormeh Sabzi from SQLite
      assert.match(customerClient.getElementById('cookListCard').innerHTML, /8 left/);
      assert.match(customerClient.getElementById('ordersCard').innerHTML, /No orders persisted yet/);

      // STEP A: Customer clicks "#placeOrderBtn" in the Customer Mobile App UI
      customerClient.getElementById('placeOrderBtn').click();
      await customerClient.waitForNetworkIdle();

      const customerOrdersHtmlAfterPost = customerClient.getElementById('ordersCard').innerHTML;
      const orderIdMatch = customerOrdersHtmlAfterPost.match(/data-order-id="(ord-[a-z0-9-]+)"/i);
      assert.ok(orderIdMatch, 'Customer UI must render persisted order ID returned from POST /api/customer/orders');
      const orderId = orderIdMatch[1];

      // Verify Customer UI shows PENDING, SIMULATED_AUTHORIZED, pickup address hidden, and portions decremented 8 -> 7
      assert.match(customerOrdersHtmlAfterPost, new RegExp(`data-order-id="${orderId}"[^>]*data-order-status="PENDING"`));
      assert.match(customerOrdersHtmlAfterPost, /SIMULATED_AUTHORIZED/);
      assert.match(customerOrdersHtmlAfterPost, new RegExp(`data-testid="pickup-hidden-${orderId}"`));
      assert.match(customerClient.getElementById('cookListCard').innerHTML, /7 left/);

      // STEP B: Cook UI clicks "#refreshCookOrdersBtn" and loads the pending order from SQLite
      cookClient.getElementById('refreshCookOrdersBtn').click();
      await cookClient.waitForNetworkIdle();

      const cookOrdersHtmlBeforeAccept = cookClient.getElementById('ordersCard').innerHTML;
      assert.match(
        cookOrdersHtmlBeforeAccept,
        new RegExp(`data-cook-order-id="${orderId}"[^>]*data-cook-order-status="PENDING"`),
        'Cook UI must load the exact pending order placed by the Customer UI from SQLite'
      );

      // Cook UI clicks the Accept button (`#accept-btn-<orderId>`)
      const acceptBtn = cookClient.getElementById(`accept-btn-${orderId}`);
      assert.ok(acceptBtn, 'Cook UI must render #accept-btn-<orderId> for pending order');
      acceptBtn.click();
      await cookClient.waitForNetworkIdle();

      const cookOrdersHtmlAfterAccept = cookClient.getElementById('ordersCard').innerHTML;
      assert.match(
        cookOrdersHtmlAfterAccept,
        new RegExp(`data-cook-order-id="${orderId}"[^>]*data-cook-order-status="ACCEPTED"`),
        'Cook UI must show ACCEPTED status persisted in SQLite after clicking Accept'
      );

      // STEP C: Customer UI clicks "#reloadCustomerStateBtn" AND a brand-new Customer browser session reconnects
      customerClient.getElementById('reloadCustomerStateBtn').click();
      await customerClient.waitForNetworkIdle();

      const customerOrdersHtmlAfterReload = customerClient.getElementById('ordersCard').innerHTML;
      assert.match(
        customerOrdersHtmlAfterReload,
        new RegExp(`data-order-id="${orderId}"[^>]*data-order-status="ACCEPTED"`),
        'Customer UI reload button must read ACCEPTED status from shared backend'
      );
      assert.match(
        customerOrdersHtmlAfterReload,
        new RegExp(`data-testid="pickup-released-${orderId}"[^>]*>[^<]*5480 Yonge St`),
        'Customer UI reload must reveal confirmed pickup address after cook acceptance'
      );

      // Brand-new Customer browser session reconnecting from scratch
      const reconnectedCustomerClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      await reconnectedCustomerClient.waitForNetworkIdle();
      assert.match(
        reconnectedCustomerClient.getElementById('ordersCard').innerHTML,
        new RegExp(`data-order-id="${orderId}"[^>]*data-order-status="ACCEPTED"`),
        'Fresh Customer browser session must read persisted ACCEPTED state from SQLite'
      );

      // STEP D: Toggle Customer UI to fa-IR (RTL), place a second order (portions 7 -> 6), then Cook clicks Reject -> portions restore 6 -> 7
      customerClient.getElementById('localeToggleBtn').click();
      await customerClient.waitForNetworkIdle();
      assert.equal(customerClient.document.documentElement.dir, 'rtl');
      assert.equal(customerClient.document.documentElement.lang, 'fa-IR');

      customerClient.getElementById('placeOrderBtn').click();
      await customerClient.waitForNetworkIdle();
      assert.match(customerClient.getElementById('cookListCard').innerHTML, /6 پرس باقی‌مانده/);

      const allOrderIds = [
        ...customerClient
          .getElementById('ordersCard')
          .innerHTML.matchAll(/data-order-id="(ord-[a-z0-9-]+)"/gi)
      ].map((m) => m[1]);
      const secondOrderId = allOrderIds.find((id) => id !== orderId);
      assert.ok(secondOrderId, 'Second order ID must be created in SQLite');

      // Cook UI refreshes queue and clicks "#reject-btn-<secondOrderId>"
      cookClient.getElementById('refreshCookOrdersBtn').click();
      await cookClient.waitForNetworkIdle();

      const rejectBtn = cookClient.getElementById(`reject-btn-${secondOrderId}`);
      assert.ok(rejectBtn, 'Cook UI must render #reject-btn-<secondOrderId>');
      rejectBtn.click();
      await cookClient.waitForNetworkIdle();

      // Customer UI clicks "#reloadCustomerStateBtn" and verifies REJECTED + SIMULATED_REFUNDED + portions restored to 7
      customerClient.getElementById('reloadCustomerStateBtn').click();
      await customerClient.waitForNetworkIdle();

      const customerAfterRejectHtml = customerClient.getElementById('ordersCard').innerHTML;
      assert.match(
        customerAfterRejectHtml,
        new RegExp(
          `data-order-id="${secondOrderId}"[^>]*data-order-status="REJECTED"[^>]*data-payment-status="SIMULATED_REFUNDED"`
        )
      );
      assert.match(
        customerClient.getElementById('cookListCard').innerHTML,
        /7 پرس باقی‌مانده/,
        'Rejected order must restore remaining portions from 6 back to 7 in Customer UI upon reload'
      );
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      uiDb.close();
      cleanupTestDbFiles(uiDbPath);
    }
  });

  test('9. Requirement 1: Fixed Forest/Cream palette, clean normal UI, FA/EN My Orders, and persisted synthetic history survives reopen/reseed', async () => {
    const liveDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-preserved-history.sqlite'
    );
    // Portable preservation regression: never requires or imports the owner's live database.
    cleanupTestDbFiles(liveDbPath);
    const historyDb = openSofrehDatabase(liveDbPath);
    seedSyntheticStage1Data(historyDb);
    const demoOrder = createOrderTransactional(historyDb, authenticateByToken(historyDb, 'test-token-customer-nima'), {
      cookId: 'cook-test-pari', fulfillmentType: 'pickup', simulatedPaymentMethod: 'SIMULATED_CARD',
      items: [{ dishId: 'dish-test-ghormeh-1', quantity: 1 }]
    });
    transitionOrderStatusTransactional(historyDb, authenticateByToken(historyDb, 'test-token-cook-pari'), {
      orderId: demoOrder.id, nextStatus: 'ACCEPTED'
    });
    const expectedOrder = historyDb.prepare('SELECT * FROM orders WHERE id = ?').get(demoOrder.id);
    const expectedStock = historyDb.prepare("SELECT remaining_portions FROM dish_slots WHERE id = 'dish-test-ghormeh-1'").get().remaining_portions;
    historyDb.close();
    const reopenedHistory = openSofrehDatabase(liveDbPath);
    seedSyntheticStage1Data(reopenedHistory);
    assert.deepEqual(reopenedHistory.prepare('SELECT * FROM orders WHERE id = ?').get(demoOrder.id), expectedOrder);
    assert.equal(reopenedHistory.prepare("SELECT remaining_portions FROM dish_slots WHERE id = 'dish-test-ghormeh-1'").get().remaining_portions, expectedStock);
    reopenedHistory.close();

    const { DatabaseSync } = await import('node:sqlite');
    const roDb = new DatabaseSync(liveDbPath, { open: true, readOnly: true });
    try {
      const existingOrder = roDb
        .prepare(`SELECT id, status, simulated_payment_status, cook_id, fulfillment_type FROM orders WHERE id = ?`)
        .get(demoOrder.id);
      assert.ok(existingOrder, 'Synthetic accepted history survives reopen and seed');
      assert.equal(existingOrder.status, 'ACCEPTED', 'Synthetic history remains ACCEPTED');
      const ghormehRow = roDb
        .prepare(`SELECT remaining_portions FROM dish_slots WHERE id = 'dish-test-ghormeh-1'`)
        .get();
      assert.equal(Number(ghormehRow.remaining_portions), 7, 'Synthetic stock deduction remains intact');
    } finally {
      roDb.close();
      cleanupTestDbFiles(liveDbPath);
    }

    const req1DbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-req1-forest-wal.sqlite'
    );
    cleanupTestDbFiles(req1DbPath);

    const { server, db: req1Db } = createSofrehHttpServer({ dbFilePath: req1DbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const [custHtmlRes, cookHtmlRes] = await Promise.all([
        fetch(`${baseUrl}/preview/customer`),
        fetch(`${baseUrl}/preview/cook`)
      ]);
      const custHtml = await custHtmlRes.text();
      const cookHtml = await cookHtmlRes.text();

      // Verify theme chooser bar is removed from normal UI markup
      assert.doesNotMatch(custHtml, /id="themeSelectorBar"/);
      assert.doesNotMatch(cookHtml, /id="themeSelectorBar"/);

      const customerClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      const cookClient = mountPreviewHtmlInVm(cookHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/cook'
      });

      await customerClient.waitForNetworkIdle();
      await cookClient.waitForNetworkIdle();

      // Fixed Forest / Cream default theme
      assert.equal(customerClient.getElementById('appRoot').getAttribute('data-theme'), 'forest');
      assert.equal(cookClient.getElementById('cookAppRoot').getAttribute('data-theme'), 'forest');

      // Compact FA / EN language button and My Orders / سفارشهای من heading
      assert.equal(customerClient.getElementById('localeToggleBtn').textContent, 'FA');
      assert.equal(customerClient.getElementById('ordersSectionTitle').textContent, 'My Orders');
      assert.equal(cookClient.getElementById('localeToggleBtn').textContent, 'FA');
      assert.equal(cookClient.getElementById('cookOrdersSectionTitle').textContent, 'My Orders');

      // Toggle to Persian (fa-IR)
      customerClient.getElementById('localeToggleBtn').click();
      cookClient.getElementById('localeToggleBtn').click();
      await customerClient.waitForNetworkIdle();
      await cookClient.waitForNetworkIdle();

      assert.equal(customerClient.getElementById('localeToggleBtn').textContent, 'EN');
      assert.equal(customerClient.getElementById('ordersSectionTitle').textContent, 'سفارشهای من');
      assert.equal(cookClient.getElementById('localeToggleBtn').textContent, 'EN');
      assert.equal(cookClient.getElementById('cookOrdersSectionTitle').textContent, 'سفارشهای من');
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      req1Db.close();
      cleanupTestDbFiles(req1DbPath);
    }
  });

  test('10. Requirement 2: Enlarged map with bottom-edge height handle supporting mouse, touch, and keyboard, retained search & attribution, and meaningful pickup info', async () => {
    const mapDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-req2-map-wal.sqlite'
    );
    cleanupTestDbFiles(mapDbPath);

    const { server, db: mapDb } = createSofrehHttpServer({ dbFilePath: mapDbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const custHtml = await (await fetch(`${baseUrl}/preview/customer`)).text();
      const customerClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      await customerClient.waitForNetworkIdle();

      const mapEl = customerClient.getElementById('map');
      const handleEl = customerClient.getElementById('mapResizeHandle');
      // The parallax map opens at the expanded height; exercise the handle
      // from the documented minimum after verifying that initial state.
      assert.equal(mapEl.getAttribute('data-map-height'), '520');
      customerClient.window.setMapHeight(300);

      // 1. Keyboard resize: ArrowDown (+24px -> 324px) and ArrowUp (-24px -> 300px)
      handleEl.dispatchEvent({ type: 'keydown', key: 'ArrowDown' });
      assert.equal(mapEl.getAttribute('data-map-height'), '324');
      assert.equal(mapEl.style.height, '324px');

      handleEl.dispatchEvent({ type: 'keydown', key: 'ArrowUp' });
      assert.equal(mapEl.getAttribute('data-map-height'), '300');

      // 2. Mouse drag resize: mousedown at Y=200 -> mousemove to Y=270 (+70px -> 370px) -> mouseup
      handleEl.dispatchEvent({ type: 'mousedown', clientY: 200 });
      customerClient.window.dispatchEvent({ type: 'mousemove', clientY: 270 });
      customerClient.window.dispatchEvent({ type: 'mouseup' });
      assert.equal(mapEl.getAttribute('data-map-height'), '370');
      assert.equal(mapEl.style.height, '370px');

      // 3. Touch drag resize: touchstart at Y=300 -> touchmove to Y=240 (-60px -> 310px) -> touchend
      handleEl.dispatchEvent({ type: 'touchstart', touches: [{ clientY: 300 }] });
      customerClient.window.dispatchEvent({ type: 'touchmove', touches: [{ clientY: 240 }] });
      customerClient.window.dispatchEvent({ type: 'touchend' });
      assert.equal(mapEl.getAttribute('data-map-height'), '310');

      // Verify search input, OpenMapTiles/OpenStreetMap attribution, and meaningful pickup summary on map
      assert.ok(customerClient.getElementById('kitchenSearchInput'));
      const attrHtml = customerClient.getElementById('mapAttribution').innerHTML;
      assert.match(attrHtml, /OpenMapTiles/);
      assert.match(attrHtml, /OpenStreetMap/);
      const mapPickupInfo = customerClient.getElementById('mapPickupInfoBar').innerHTML;
      assert.match(mapPickupInfo, /North York/);
      assert.match(mapPickupInfo, /Pickup/i);
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      mapDb.close();
      cleanupTestDbFiles(mapDbPath);
    }
  });

  test('11. Requirement 3: Permission-gated current-user marker (granted, denied, unavailable) with zero precise location sent to or stored by backend', async () => {
    const geoDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-req3-geo-wal.sqlite'
    );
    cleanupTestDbFiles(geoDbPath);

    const { server, db: geoDb } = createSofrehHttpServer({ dbFilePath: geoDbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const custHtml = await (await fetch(`${baseUrl}/preview/customer`)).text();

      // Case A: Before permission, no current-user marker is active (never present a static sample point)
      const idleClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      await idleClient.waitForNetworkIdle();
      assert.equal(
        idleClient.getElementById('currentUserMarker').getAttribute('data-user-marker-active'),
        'false'
      );

      // Case B: Geolocation unavailable
      const unavailClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer',
        geolocationMock: null
      });
      await unavailClient.waitForNetworkIdle();
      unavailClient.getElementById('locateMeBtn').click();
      assert.equal(
        unavailClient.getElementById('geolocationStatus').getAttribute('data-geo-state'),
        'unavailable'
      );
      assert.equal(
        unavailClient.getElementById('currentUserMarker').getAttribute('data-user-marker-active'),
        'false'
      );

      // Case C: Geolocation denied (error code 1)
      const deniedClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer',
        geolocationMock: {
          getCurrentPosition(_onSuccess, onError) {
            onError({ code: 1, message: 'User denied Geolocation' });
          }
        }
      });
      await deniedClient.waitForNetworkIdle();
      deniedClient.getElementById('locateMeBtn').click();
      assert.equal(
        deniedClient.getElementById('geolocationStatus').getAttribute('data-geo-state'),
        'denied'
      );
      assert.equal(
        deniedClient.getElementById('currentUserMarker').getAttribute('data-user-marker-active'),
        'false'
      );

      // Case D: Geolocation granted -> distinct current-user marker rendered, zero coordinates sent to backend
      const grantedClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer',
        geolocationMock: {
          getCurrentPosition(onSuccess) {
            onSuccess({ coords: { latitude: 43.7615, longitude: -79.4111 } });
          }
        }
      });
      await grantedClient.waitForNetworkIdle();
      const fetchCountBeforeLocate = grantedClient.fetchHistory.length;
      grantedClient.getElementById('locateMeBtn').click();

      assert.equal(
        grantedClient.getElementById('geolocationStatus').getAttribute('data-geo-state'),
        'granted'
      );
      assert.equal(
        grantedClient.getElementById('currentUserMarker').getAttribute('data-user-marker-active'),
        'true'
      );
      assert.equal(
        grantedClient.fetchHistory.length,
        fetchCountBeforeLocate,
        'Granting browser location must not trigger any network upload to backend'
      );

      // Server-side guard: attempting to send deviceLocation in a POST request is rejected with 400 PRECISE_LOCATION_STORAGE_FORBIDDEN
      const badLocRes = await fetch(`${baseUrl}/api/customer/cart/items`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-token-customer-nima'
        },
        body: JSON.stringify({
          cookId: 'cook-test-pari',
          dishId: 'dish-test-ghormeh-1',
          quantity: 1,
          deviceLocation: { lat: 43.7615, lng: -79.4111 }
        })
      });
      assert.equal(badLocRes.status, 400);
      const badLocData = await badLocRes.json();
      assert.equal(badLocData.error.code, 'PRECISE_LOCATION_STORAGE_FORBIDDEN');
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      geoDb.close();
      cleanupTestDbFiles(geoDbPath);
    }
  });

  test('12. Requirement 4: Cook cards open complete storefronts with food photos, prices, stock, today-available vs regular-unavailable items, and honest un-fabricated reviews', async () => {
    const sfDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-req4-storefront-wal.sqlite'
    );
    cleanupTestDbFiles(sfDbPath);

    const { server, db: sfDb } = createSofrehHttpServer({ dbFilePath: sfDbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const custHtml = await (await fetch(`${baseUrl}/preview/customer`)).text();
      const customerClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      await customerClient.waitForNetworkIdle();
      customerClient.querySelectorAll('[data-category-id="all"]')[0]?.click();

      const storefrontHtml = customerClient.getElementById('cookListCard').innerHTML;
      // Actual bundled sample photos replace illustrations for the three selected meals.
      assert.match(storefrontHtml, /<img class="dish-photo" src="\/assets\/demo-food\/ghormeh-sabzi-majidi.jpg/);
      assert.match(storefrontHtml, /src="\/assets\/demo-food\/zereshk-polo.jpg/);
      assert.match(storefrontHtml, /src="\/assets\/demo-food\/tahchin.jpg/);
      assert.match(storefrontHtml, /Sample photo/);
      // Both TODAY_AVAILABLE and REGULAR_UNAVAILABLE sections rendered
      assert.match(storefrontHtml, /id="todayAvailableDishesSection"/);
      assert.match(storefrontHtml, /id="regularUnavailableDishesSection"/);
      assert.match(storefrontHtml, /data-availability-mode="TODAY_AVAILABLE"/);
      assert.match(storefrontHtml, /data-availability-mode="REGULAR_UNAVAILABLE"/);
      // Honest un-fabricated review state initially shows "No ratings yet"
      assert.match(storefrontHtml, /No ratings yet/);

      // Clicking another cook card (Chef Kambiz) opens his storefront with his regular-unavailable item
      const kambizCard = customerClient.getElementById('cook-card-cook-test-kambiz');
      assert.ok(kambizCard);
      kambizCard.click();
      const kambizStorefrontHtml = customerClient.getElementById('cookListCard').innerHTML;
      assert.match(kambizStorefrontHtml, /Chef Kambiz/);
      assert.match(kambizStorefrontHtml, /Baghali Polo/);
      assert.match(kambizStorefrontHtml, /data-availability-mode="REGULAR_UNAVAILABLE"/);
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      sfDb.close();
      cleanupTestDbFiles(sfDbPath);
    }
  });

  test('13. Requirement 5: Persisted multi-item cart, per-item quantities, server-calculated totals, transactional stock protection, idempotency, and cook-specific delivery/pickup/both restrictions', () => {
    const customerNima = authenticateByToken(db, 'test-token-customer-nima');
    const cookKambiz = authenticateByToken(db, 'test-token-cook-kambiz');

    // 1. Reject adding REGULAR_UNAVAILABLE dish to persisted cart
    assert.throws(
      () =>
        updateCustomerCartItemQuantity(db, customerNima, {
          cookId: 'cook-test-pari',
          dishId: 'dish-test-tahchin-reg-1',
          quantity: 1,
          fulfillmentType: 'pickup'
        }),
      (err) => err.code === 'DISH_UNAVAILABLE_TODAY' && err.httpStatus === 409
    );

    // 2. Enforce cook-specific fulfillment restrictions:
    // Configure Chef Kambiz as delivery-only (supportsPickup = false, supportsDelivery = true)
    updateCookDeliverySettings(db, cookKambiz, {
      cookId: 'cook-test-kambiz',
      deliveryFeeCents: 600,
      supportsPickup: false,
      supportsDelivery: true
    });

    assert.throws(
      () =>
        upsertCustomerCart(db, customerNima, {
          cookId: 'cook-test-kambiz',
          fulfillmentType: 'pickup',
          items: [{ dishId: 'dish-test-fesenjan-3', quantity: 1 }]
        }),
      (err) => err.code === 'FULFILLMENT_NOT_SUPPORTED' && err.httpStatus === 400
    );

    // Khanoom Golnar is pickup-only (supports_delivery = 0)
    assert.throws(
      () =>
        upsertCustomerCart(db, customerNima, {
          cookId: 'cook-test-golnar',
          fulfillmentType: 'delivery',
          deliveryAddress: '120 Empress Ave, North York, ON',
          items: [{ dishId: 'dish-test-kalam-5', quantity: 1 }]
        }),
      (err) => err.code === 'FULFILLMENT_NOT_SUPPORTED' && err.httpStatus === 400
    );

    // 3. Multi-item persisted cart with Maman Pari (supports both pickup and delivery)
    clearCustomerCart(db, customerNima);
    updateCustomerCartItemQuantity(db, customerNima, {
      cookId: 'cook-test-pari',
      dishId: 'dish-test-ghormeh-1',
      quantity: 2,
      fulfillmentType: 'delivery',
      deliveryAddress: '120 Empress Ave, North York, ON'
    });
    const multiCart = updateCustomerCartItemQuantity(db, customerNima, {
      cookId: 'cook-test-pari',
      dishId: 'dish-test-zereshk-2',
      quantity: 1,
      fulfillmentType: 'delivery',
      deliveryAddress: '120 Empress Ave, North York, ON'
    });

    assert.equal(multiCart.items.length, 2);
    // 2 * 1850 (3700) + 1 * 1750 (1750) = 5450 subtotal + 525 delivery fee (updated in Test 6) = 5975
    assert.equal(multiCart.subtotalCents, 5450);
    assert.equal(multiCart.deliveryFeeCents, 525);
    assert.equal(multiCart.totalCents, 5975);
    assert.equal('exactPickupAddressPrivate' in multiCart, false);
    assert.equal('pickupAddressReleased' in multiCart, false);

    // 4. Idempotent order creation from persisted multi-item cart
    const idemKey = 'idem-test-multi-cart-001';
    const orderFirst = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-pari',
      idempotencyKey: idemKey
    });
    assert.equal(orderFirst.items.length, 2);
    assert.equal(orderFirst.totalCents, 5975);

    // Persisted cart is automatically cleared upon order creation
    const cartAfterOrder = getCustomerCart(db, customerNima);
    assert.equal(cartAfterOrder.items.length, 0);

    // Replaying the exact same order with the same idempotencyKey returns the same order without double stock deduction
    const discoveryMid = listPublicDiscoveryCooks(db, { locale: 'en-CA' });
    const pariMid = discoveryMid.cooks.find((c) => c.id === 'cook-test-pari');
    const ghormehBeforeReplay = pariMid.dishes.find((d) => d.id === 'dish-test-ghormeh-1').remainingPortions;

    const orderReplay = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'delivery',
      deliveryAddress: '120 Empress Ave, North York, ON',
      idempotencyKey: idemKey,
      items: [
        { dishId: 'dish-test-ghormeh-1', quantity: 2 },
        { dishId: 'dish-test-zereshk-2', quantity: 1 }
      ]
    });
    assert.equal(orderReplay.id, orderFirst.id, 'Idempotent replay must return the original order');

    const discoveryAfterReplay = listPublicDiscoveryCooks(db, { locale: 'en-CA' });
    const ghormehAfterReplay = discoveryAfterReplay.cooks
      .find((c) => c.id === 'cook-test-pari')
      .dishes.find((d) => d.id === 'dish-test-ghormeh-1').remainingPortions;
    assert.equal(ghormehAfterReplay, ghormehBeforeReplay, 'Idempotent replay must not deduct stock a second time');

    // Reusing the same idempotencyKey with a DIFFERENT payload throws 409 IDEMPOTENCY_KEY_CONFLICT
    assert.throws(
      () =>
        createOrderTransactional(db, customerNima, {
          cookId: 'cook-test-pari',
          fulfillmentType: 'pickup',
          idempotencyKey: idemKey,
          items: [{ dishId: 'dish-test-ghormeh-1', quantity: 1 }]
        }),
      (err) => err.code === 'IDEMPOTENCY_KEY_CONFLICT' && err.httpStatus === 409
    );
  });

  test('14. Requirement 6: Server-enforced address privacy across public listings, cart, delivery orders, and accepted pickup orders', () => {
    const customerNima = authenticateByToken(db, 'test-token-customer-nima');
    const customerSara = authenticateByToken(db, 'test-token-customer-sara');
    const cookPari = authenticateByToken(db, 'test-token-cook-pari');
    const cookKambiz = authenticateByToken(db, 'test-token-cook-kambiz');

    // Test 13 temporarily exercises delivery-only restrictions for Kambiz on
    // the shared fixture DB. Restore the declared fixture contract here.
    updateCookDeliverySettings(db, cookKambiz, {
      cookId: 'cook-test-kambiz',
      deliveryFeeCents: 600,
      supportsPickup: true,
      supportsDelivery: true
    });

    // 1. Public discovery never includes exact pickup address
    const publicDiscovery = listPublicDiscoveryCooks(db, { locale: 'en-CA' });
    const rawDiscoveryJson = JSON.stringify(publicDiscovery);
    assert.doesNotMatch(rawDiscoveryJson, /5480 Yonge St/);
    assert.match(rawDiscoveryJson, /4841 Yonge St/);
    // Pari is the only AREA_ONLY fixture; Kambiz and Golnar explicitly opt in
    // to PUBLIC_EXACT in this synthetic dataset.
    assert.match(rawDiscoveryJson, /7089 Yonge St/);
    assert.equal(publicDiscovery.cooks.find((c) => c.id === 'cook-test-pari').pickupAddressVisibility, 'AREA_ONLY');
    assert.equal(publicDiscovery.cooks.find((c) => c.id === 'cook-test-kambiz').pickupAddressVisibility, 'PUBLIC_EXACT');
    assert.equal(publicDiscovery.cooks.find((c) => c.id === 'cook-test-golnar').pickupAddressVisibility, 'PUBLIC_EXACT');

    // 2. Cart response never includes exact pickup address
    const cartView = upsertCustomerCart(db, customerNima, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'pickup',
      items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
    });
    assert.doesNotMatch(JSON.stringify(cartView), /5480 Yonge St/);
    clearCustomerCart(db, customerNima);

    // 3. Delivery order:
    //    - Customer NEVER receives cook's home/pickup address even when ACCEPTED, PREPARING, READY, or COMPLETED
    //    - Owning cook receives deliveryAddressForFulfillment = null while PENDING, and receives exact delivery address
    //      ONLY when status is ACCEPTED/PREPARING/READY/COMPLETED with SIMULATED_AUTHORIZED or SIMULATED_PAID
    const delivOrder = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'delivery',
      deliveryAddress: '500 Doris Ave, North York, ON',
      items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
    });
    assert.equal(delivOrder.pickupAddressReleased, null);

    const pendingCookOrders = listCookKitchenOrders(db, cookPari, 'cook-test-pari');
    const pendingCookDelivView = pendingCookOrders.find((o) => o.id === delivOrder.id);
    assert.ok(pendingCookDelivView);
    assert.equal(
      pendingCookDelivView.deliveryAddressForFulfillment,
      null,
      'Owning cook must NOT receive customer delivery address while order is PENDING'
    );

    for (const st of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
      const cookStepView = transitionOrderStatusTransactional(db, cookPari, {
        orderId: delivOrder.id,
        nextStatus: st
      });
      assert.equal(
        cookStepView.deliveryAddressForFulfillment,
        '500 Doris Ave, North York, ON',
        `Owning cook must receive deliveryAddressForFulfillment at status ${st} with authorized/paid status`
      );

      const custDelivView = getCustomerOrderById(db, customerNima, delivOrder.id);
      assert.equal(
        custDelivView.pickupAddressReleased,
        null,
        `Delivery customer must NEVER receive cook home/pickup address at status ${st}`
      );
      assert.doesNotMatch(JSON.stringify(custDelivView), /5480 Yonge St/);
    }

    // 4. Negative cook delivery-address disclosure coverage:
    //    foreign cook, REJECTED, CANCELLED, refunded/unpaid/unauthorized payment, and unknown status/payment
    const pariCookRow = { id: 'cook-test-pari', user_id: cookPari.id };
    const kambizCookRow = { id: 'cook-test-kambiz', user_id: cookKambiz.id };
    const baseDeliveryOrderRow = {
      id: 'ord-privacy-matrix',
      cook_id: 'cook-test-pari',
      customer_display_name: 'Nima Tehrani (TEST ONLY)',
      status: 'ACCEPTED',
      fulfillment_type: 'delivery',
      subtotal_cents: 1850,
      delivery_fee_cents: 525,
      total_cents: 2375,
      simulated_payment_status: 'SIMULATED_AUTHORIZED',
      delivery_address_private: '500 Doris Ave, North York, ON',
      customer_notes: null,
      created_at_iso: new Date().toISOString(),
      updated_at_iso: new Date().toISOString()
    };

    // Foreign cook is blocked with 403 (COOK_OWNERSHIP_FORBIDDEN & PRIVACY_BOUNDARY_FORBIDDEN)
    assert.throws(
      () => listCookKitchenOrders(db, cookKambiz, 'cook-test-pari'),
      (err) => err.code === 'COOK_OWNERSHIP_FORBIDDEN' && err.httpStatus === 403
    );
    assert.throws(
      () => sanitizeOrderForCook(cookKambiz, pariCookRow, baseDeliveryOrderRow, []),
      (err) => err.code === 'COOK_OWNERSHIP_FORBIDDEN' && err.httpStatus === 403
    );
    assert.throws(
      () => sanitizeOrderForCook(cookKambiz, kambizCookRow, baseDeliveryOrderRow, []),
      (err) => err.code === 'PRIVACY_BOUNDARY_FORBIDDEN' && err.httpStatus === 403
    );

    // CANCELLED delivery order transitioned in DB returns null deliveryAddressForFulfillment and restores stock
    const cancelDelivOrder = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'delivery',
      deliveryAddress: '777 Sheppard Ave W, North York, ON',
      items: [{ dishId: 'dish-test-ghormeh-1', quantity: 1 }]
    });
    const acceptedBeforeCancel = transitionOrderStatusTransactional(db, cookPari, {
      orderId: cancelDelivOrder.id,
      nextStatus: 'ACCEPTED'
    });
    assert.equal(acceptedBeforeCancel.deliveryAddressForFulfillment, '777 Sheppard Ave W, North York, ON');
    const cancelledCookView = transitionOrderStatusTransactional(db, cookPari, {
      orderId: cancelDelivOrder.id,
      nextStatus: 'CANCELLED'
    });
    assert.equal(cancelledCookView.status, 'CANCELLED');
    assert.equal(cancelledCookView.simulatedPaymentStatus, 'SIMULATED_REFUNDED');
    assert.equal(
      cancelledCookView.deliveryAddressForFulfillment,
      null,
      'CANCELLED order must return deliveryAddressForFulfillment = null'
    );

    // Non-eligible statuses (PENDING, REJECTED, CANCELLED, unknown) return null even if payment is SIMULATED_AUTHORIZED
    for (const badStatus of ['PENDING', 'REJECTED', 'CANCELLED', 'UNKNOWN_STATUS', '', null, undefined]) {
      const sanitized = sanitizeOrderForCook(
        cookPari,
        pariCookRow,
        { ...baseDeliveryOrderRow, status: badStatus },
        []
      );
      assert.equal(
        sanitized.deliveryAddressForFulfillment,
        null,
        `Status ${String(badStatus)} must return deliveryAddressForFulfillment = null`
      );
    }

    // Non-eligible payment states (SIMULATED_PENDING, SIMULATED_REFUNDED, unauthorized, unpaid, unknown) return null even when ACCEPTED
    for (const badPayment of [
      'SIMULATED_PENDING',
      'SIMULATED_REFUNDED',
      'UNAUTHORIZED',
      'UNPAID',
      'REFUNDED',
      'UNKNOWN_PAYMENT',
      '',
      null,
      undefined
    ]) {
      const sanitized = sanitizeOrderForCook(
        cookPari,
        pariCookRow,
        { ...baseDeliveryOrderRow, status: 'ACCEPTED', simulated_payment_status: badPayment },
        []
      );
      assert.equal(
        sanitized.deliveryAddressForFulfillment,
        null,
        `Payment state ${String(badPayment)} must return deliveryAddressForFulfillment = null`
      );
    }

    // 5. Pickup order reveals consented pickup address ONLY to owning customer after cook acceptance with simulated authorization
    const pickupOrd = createOrderTransactional(db, customerSara, {
      cookId: 'cook-test-pari',
      fulfillmentType: 'pickup',
      items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
    });
    assert.equal(pickupOrd.pickupAddressReleased, null, 'Hidden while PENDING');

    transitionOrderStatusTransactional(db, cookPari, {
      orderId: pickupOrd.id,
      nextStatus: 'ACCEPTED'
    });
    const saraAcceptedView = getCustomerOrderById(db, customerSara, pickupOrd.id);
    assert.match(saraAcceptedView.pickupAddressReleased, /5480 Yonge St/);

    // Foreign customer (Nima) is blocked from reading Sara's accepted pickup order
    assert.throws(
      () => getCustomerOrderById(db, customerNima, pickupOrd.id),
      (err) => err.code === 'PRIVACY_BOUNDARY_FORBIDDEN' && err.httpStatus === 403
    );
  });

  test('15. Requirement 7: Two-way ratings and HTML-escaped text reviews persisted only on COMPLETED orders between participants with honest aggregates', () => {
    const customerNima = authenticateByToken(db, 'test-token-customer-nima');
    const customerSara = authenticateByToken(db, 'test-token-customer-sara');
    const cookGolnar = authenticateByToken(db, 'test-token-cook-golnar');
    const cookKambiz = authenticateByToken(db, 'test-token-cook-kambiz');

    // Initially Khanoom Golnar has 0 reviews and null averageRating (honest aggregate)
    const initialReviews = listCookReviews(db, 'cook-test-golnar');
    assert.equal(initialReviews.reviewSummary.reviewCount, 0);
    assert.equal(initialReviews.reviewSummary.averageRating, null);

    // Place a pickup order with Khanoom Golnar for Kalam Polo (dish-test-kalam-5)
    const golnarOrder = createOrderTransactional(db, customerNima, {
      cookId: 'cook-test-golnar',
      fulfillmentType: 'pickup',
      items: [{ dishId: 'dish-test-kalam-5', quantity: 1 }]
    });

    // 1. Cannot review while PENDING or ACCEPTED (must be COMPLETED)
    assert.throws(
      () =>
        createOrderReviewTransactional(db, customerNima, {
          orderId: golnarOrder.id,
          rating: 5,
          comment: 'Too early!'
        }),
      (err) => err.code === 'REVIEW_REQUIRES_COMPLETED_ORDER' && err.httpStatus === 409
    );

    transitionOrderStatusTransactional(db, cookGolnar, {
      orderId: golnarOrder.id,
      nextStatus: 'ACCEPTED'
    });
    transitionOrderStatusTransactional(db, cookGolnar, {
      orderId: golnarOrder.id,
      nextStatus: 'READY'
    });
    transitionOrderStatusTransactional(db, cookGolnar, {
      orderId: golnarOrder.id,
      nextStatus: 'COMPLETED'
    });

    // 2. Foreign customer (Sara) and foreign cook (Kambiz) cannot review Nima+Golnar's order
    assert.throws(
      () =>
        createOrderReviewTransactional(db, customerSara, {
          orderId: golnarOrder.id,
          rating: 5,
          comment: 'Not my order'
        }),
      (err) => err.code === 'REVIEW_FORBIDDEN_FOREIGN_ORDER' && err.httpStatus === 403
    );
    assert.throws(
      () =>
        createOrderReviewTransactional(db, cookKambiz, {
          orderId: golnarOrder.id,
          rating: 5,
          comment: 'Not my kitchen'
        }),
      (err) => err.code === 'REVIEW_FORBIDDEN_FOREIGN_ORDER' && err.httpStatus === 403
    );

    // 3. Customer Nima submits a 5-star review with HTML characters -> persisted & HTML-escaped
    const custRevResult = createOrderReviewTransactional(db, customerNima, {
      orderId: golnarOrder.id,
      rating: 5,
      comment: 'Amazing <script>alert("xss")</script> & fresh herbs!'
    });
    assert.equal(custRevResult.review.direction, 'CUSTOMER_TO_COOK');
    assert.equal(custRevResult.review.rating, 5);
    assert.equal(
      custRevResult.review.commentEscaped,
      'Amazing &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; fresh herbs!'
    );
    assert.equal(custRevResult.cookReviewSummary.reviewCount, 1);
    assert.equal(custRevResult.cookReviewSummary.averageRating, 5);

    // 4. Duplicate review from Customer Nima on the same order is blocked
    assert.throws(
      () =>
        createOrderReviewTransactional(db, customerNima, {
          orderId: golnarOrder.id,
          rating: 4,
          comment: 'Second review attempt'
        }),
      (err) => err.code === 'DUPLICATE_REVIEW' && err.httpStatus === 409
    );

    // 5. Cook Golnar submits a two-way review (COOK_TO_CUSTOMER) for Customer Nima on the same completed order
    const cookRevResult = createOrderReviewTransactional(db, cookGolnar, {
      orderId: golnarOrder.id,
      rating: 4,
      comment: "Great pickup communication from 'Nima'!"
    });
    assert.equal(cookRevResult.review.direction, 'COOK_TO_CUSTOMER');
    assert.equal(cookRevResult.review.rating, 4);
    assert.match(cookRevResult.review.commentEscaped, /&#39;Nima&#39;/);

    // Duplicate review from Cook Golnar on the same order is also blocked
    assert.throws(
      () =>
        createOrderReviewTransactional(db, cookGolnar, {
          orderId: golnarOrder.id,
          rating: 5,
          comment: 'Duplicate cook review'
        }),
      (err) => err.code === 'DUPLICATE_REVIEW' && err.httpStatus === 409
    );
  });

  test('16. Requirement 8: Three-dot settings menu for profile, addresses, app info, and DEMO / Simulated Payment Methods (masked 4242 select/remove without PAN/CVV)', async () => {
    const setDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-req8-settings-wal.sqlite'
    );
    cleanupTestDbFiles(setDbPath);

    const { server, db: setDb } = createSofrehHttpServer({ dbFilePath: setDbPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;

    try {
      const custHtml = await (await fetch(`${baseUrl}/preview/customer`)).text();
      const customerClient = mountPreviewHtmlInVm(custHtml, {
        apiBase: baseUrl,
        urlPath: '/preview/customer'
      });
      await customerClient.waitForNetworkIdle();

      const settingsPanel = customerClient.getElementById('customerSettingsPanel');
      assert.equal(settingsPanel.getAttribute('data-open'), 'false');

      // Open three-dot settings menu
      customerClient.getElementById('customerTopMenuBtn').click();
      assert.equal(settingsPanel.getAttribute('data-open'), 'true');

      const panelHtml = settingsPanel.innerHTML;
      // Contains Profile, Addresses, DEMO Payment Methods, and App Info sections
      assert.match(panelHtml, /id="profileSettingsSection"/);
      assert.match(panelHtml, /id="addressesSettingsSection"/);
      assert.match(panelHtml, /id="demoPaymentSettingsPanel"/);
      assert.match(panelHtml, /id="appInfoSettingsSection"/);

      // Shows masked card ending 4242 and fake alternate Interac method
      assert.match(panelHtml, /4242/);
      assert.match(panelHtml, /demo\.payer@example\.invalid/);

      // Must NOT contain any input fields for full card number (PAN) or CVV
      assert.doesNotMatch(panelHtml, /placeholder=".*CVV/i);
      assert.doesNotMatch(panelHtml, /name="cardNumber"/i);

      // Select the alternate fake payment method
      const selectAltBtn = customerClient.getElementById('select-pay-pm-demo-interac-fake');
      assert.ok(selectAltBtn);
      selectAltBtn.click();
      assert.match(
        customerClient.getElementById('checkoutCard').innerHTML,
        /demo\.payer@example\.invalid/
      );

      // Remove masked card 4242 locally
      const remove4242Btn = customerClient.getElementById('remove-pay-pm-demo-visa-4242');
      assert.ok(remove4242Btn);
      remove4242Btn.click();
      assert.doesNotMatch(
        customerClient.getElementById('demoPaymentMethodsList').innerHTML,
        /data-demo-payment-row="pm-demo-visa-4242"/
      );

      // Restore default demo payment methods
      customerClient.getElementById('restoreDemoPaymentMethodsBtn').click();
      assert.match(
        customerClient.getElementById('demoPaymentMethodsList').innerHTML,
        /data-demo-payment-row="pm-demo-visa-4242"/
      );
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      setDb.close();
      cleanupTestDbFiles(setDbPath);
    }
  });

  test('17. Requirement 9: Multi-line rollback, last-unit contention, and cart-only idempotent retry', () => {
    const integrityDbPath = path.join(
      __dirname,
      '..',
      'packages',
      'backend',
      'data',
      'test-req9-integrity-wal.sqlite'
    );
    cleanupTestDbFiles(integrityDbPath);
    const integrityDb = openSofrehDatabase(integrityDbPath);
    seedSyntheticStage1Data(integrityDb);

    try {
      const customerNima = authenticateByToken(integrityDb, 'test-token-customer-nima');
      const customerSara = authenticateByToken(integrityDb, 'test-token-customer-sara');
      const cookPari = authenticateByToken(integrityDb, 'test-token-cook-pari');

      // A later-line stock failure must roll back the earlier line and the order row.
      updateCookDishPortions(integrityDb, cookPari, {
        cookId: 'cook-test-pari',
        dishId: 'dish-test-ghormeh-1',
        totalPortions: 5,
        remainingPortions: 5
      });
      updateCookDishPortions(integrityDb, cookPari, {
        cookId: 'cook-test-pari',
        dishId: 'dish-test-zereshk-2',
        totalPortions: 1,
        remainingPortions: 1
      });
      const beforeMultiLineOrders = integrityDb
        .prepare(`SELECT COUNT(*) AS count FROM orders WHERE customer_user_id = ?`)
        .get(customerNima.id).count;
      assert.throws(
        () =>
          createOrderTransactional(integrityDb, customerNima, {
            cookId: 'cook-test-pari',
            fulfillmentType: 'pickup',
            items: [
              { dishId: 'dish-test-ghormeh-1', quantity: 1 },
              { dishId: 'dish-test-zereshk-2', quantity: 2 }
            ]
          }),
        (err) => err.code === 'INSUFFICIENT_PORTIONS' && err.httpStatus === 409
      );
      const afterMultiLineOrders = integrityDb
        .prepare(`SELECT COUNT(*) AS count FROM orders WHERE customer_user_id = ?`)
        .get(customerNima.id).count;
      const afterMultiLineDiscovery = listPublicDiscoveryCooks(integrityDb, { locale: 'en-CA' });
      const pariAfterMultiLine = afterMultiLineDiscovery.cooks.find((c) => c.id === 'cook-test-pari');
      assert.equal(afterMultiLineOrders, beforeMultiLineOrders);
      assert.equal(
        pariAfterMultiLine.dishes.find((d) => d.id === 'dish-test-ghormeh-1').remainingPortions,
        5,
        'Earlier line reservation must roll back when a later line fails'
      );
      assert.equal(
        pariAfterMultiLine.dishes.find((d) => d.id === 'dish-test-zereshk-2').remainingPortions,
        1,
        'Failed later line must leave its stock unchanged'
      );

      // Two sequential checkouts competing for the last portion cannot oversell it.
      const firstLastUnit = createOrderTransactional(integrityDb, customerNima, {
        cookId: 'cook-test-pari',
        fulfillmentType: 'pickup',
        items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
      });
      assert.ok(firstLastUnit.id);
      assert.throws(
        () =>
          createOrderTransactional(integrityDb, customerSara, {
            cookId: 'cook-test-pari',
            fulfillmentType: 'pickup',
            items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
          }),
        (err) => err.code === 'INSUFFICIENT_PORTIONS' && err.httpStatus === 409
      );
      assert.equal(
        listPublicDiscoveryCooks(integrityDb, { locale: 'en-CA' }).cooks
          .find((c) => c.id === 'cook-test-pari')
          .dishes.find((d) => d.id === 'dish-test-zereshk-2').remainingPortions,
        0
      );

      // A retry with only the original key succeeds after the original cart was cleared.
      clearCustomerCart(integrityDb, customerSara);
      updateCustomerCartItemQuantity(integrityDb, customerSara, {
        cookId: 'cook-test-pari',
        dishId: 'dish-test-ghormeh-1',
        quantity: 1,
        fulfillmentType: 'pickup'
      });
      const cartOnlyKey = 'idem-test-cart-only-retry-001';
      const cartOrder = createOrderTransactional(integrityDb, customerSara, {
        idempotencyKey: cartOnlyKey
      });
      assert.equal(getCustomerCart(integrityDb, customerSara).items.length, 0);
      const cartOnlyReplay = createOrderTransactional(integrityDb, customerSara, {
        idempotencyKey: cartOnlyKey
      });
      assert.equal(cartOnlyReplay.id, cartOrder.id);
    } finally {
      integrityDb.close();
      cleanupTestDbFiles(integrityDbPath);
    }
  });

  test('18. Independent SQLite connections concurrently compete for one remaining portion', { timeout: 20000 }, async () => {
    const raceDbPath = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-concurrent-checkout.sqlite');
    cleanupTestDbFiles(raceDbPath);
    const raceDb = openSofrehDatabase(raceDbPath);
    const workers = [];
    try {
      seedSyntheticStage1Data(raceDb);
      const cook = authenticateByToken(raceDb, 'test-token-cook-pari');
      updateCookDishPortions(raceDb, cook, {
        cookId: 'cook-test-pari', dishId: 'dish-test-zereshk-2',
        totalPortions: 1, remainingPortions: 1
      });
      const beforeOrders = Number(raceDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n);
      const beforeItems = Number(raceDb.prepare('SELECT COUNT(*) AS n FROM order_items').get().n);
      const gateBuffer = new SharedArrayBuffer(8);
      const gate = new Int32Array(gateBuffer);
      const tasks = ['nima', 'sara'].map((name) => {
        const worker = new Worker(new URL('./checkoutRaceWorker.mjs', import.meta.url), {
          workerData: {
            dbPath: raceDbPath, gate: gateBuffer,
            token: `test-token-customer-${name}`, key: `last-unit-${name}`
          }
        });
        workers.push(worker);
        let resolveReady;
        const ready = new Promise((resolve) => { resolveReady = resolve; });
        const done = new Promise((resolve, reject) => {
          let result;
          worker.on('message', (message) => {
            if (message.type === 'ready') resolveReady();
            if (message.type === 'result') result = message;
          });
          worker.once('error', reject);
          worker.once('exit', (code) => {
            if (code !== 0 || !result) reject(new Error(`Checkout worker exited ${code} without a result`));
            else resolve(result);
          });
        });
        return { ready, done };
      });
      const completed = Promise.all(tasks.map((task) => task.done));
      await Promise.race([Promise.all(tasks.map((task) => task.ready)), completed]);
      Atomics.store(gate, 0, 1);
      Atomics.notify(gate, 0, 2);
      const results = await completed;
      assert.equal(Atomics.load(gate, 1), 2, 'Both independent connections entered the coordinated checkout');
      assert.equal(results.filter((r) => r.ok).length, 1, 'Exactly one checkout succeeds');
      const loser = results.find((r) => !r.ok);
      assert.equal(loser.code, 'INSUFFICIENT_PORTIONS');
      assert.equal(loser.status, 409);
      const stock = raceDb.prepare('SELECT remaining_portions FROM dish_slots WHERE id = ?').get('dish-test-zereshk-2');
      assert.equal(stock.remaining_portions, 0, 'One portion is deducted exactly once');
      assert.equal(Number(raceDb.prepare('SELECT COUNT(*) AS n FROM dish_slots WHERE remaining_portions < 0').get().n), 0);
      assert.equal(Number(raceDb.prepare('SELECT COUNT(*) AS n FROM orders').get().n), beforeOrders + 1);
      assert.equal(Number(raceDb.prepare('SELECT COUNT(*) AS n FROM order_items').get().n), beforeItems + 1);
      assert.equal(Number(raceDb.prepare("SELECT COUNT(*) AS n FROM order_idempotency_keys WHERE idempotency_key LIKE 'last-unit-%'").get().n), 1);
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()));
      raceDb.close();
      cleanupTestDbFiles(raceDbPath);
    }
  });

  test('19. HTTP responses enforce delivery-address privacy and fail closed for invalid fixture states', { timeout: 20000 }, async () => {
    const privacyDbPath = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-http-privacy.sqlite');
    cleanupTestDbFiles(privacyDbPath);
    const { server, db: privacyDb } = createSofrehHttpServer({ dbFilePath: privacyDbPath });
    try {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      async function request(route, actor, method = 'GET', body) {
        const response = await fetch(baseUrl + route, {
          method,
          headers: {
            ...(actor ? { Authorization: `Bearer test-token-${actor}` } : {}),
            ...(body ? { 'Content-Type': 'application/json' } : {})
          },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        return { status: response.status, body: await response.json() };
      }
      const homes = privacyDb.prepare('SELECT exact_pickup_address_private, public_address_visibility FROM cook_profiles').all()
        .filter((row) => row.public_address_visibility !== 'PUBLIC_EXACT')
        .map((row) => row.exact_pickup_address_private);
      const discovery = await request('/api/discovery/cooks');
      assert.equal(discovery.status, 200);
      const discoveryText = JSON.stringify(discovery.body);
      for (const home of homes) assert.equal(discoveryText.includes(home), false);
      function assertNoPrivateDiscoveryFields(value) {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
          assert.doesNotMatch(key, /private|exact.*(?:address|lat|lng|coord)|(?:precise|device|home).*(?:lat|lng|coord)/i);
          assertNoPrivateDiscoveryFields(child);
        }
      }
      assertNoPrivateDiscoveryFields(discovery.body);
      const destination = '500 Synthetic Test Lane, Toronto (DEMO)';
      const created = await request('/api/customer/orders', 'customer-nima', 'POST', {
        cookId: 'cook-test-pari', fulfillmentType: 'delivery', deliveryAddress: destination,
        items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
      });
      assert.equal(created.status, 201);
      const orderId = created.body.order.id;
      const kitchenRoute = '/api/cook/kitchen/cook-test-pari/orders';
      async function assertViews(expectedDestination) {
        const cookResponse = await request(kitchenRoute, 'cook-pari');
        assert.equal(cookResponse.status, 200);
        const order = cookResponse.body.orders.find((row) => row.id === orderId);
        assert.ok(order);
        assert.equal(order.deliveryAddressForFulfillment, expectedDestination);
        const customerResponse = await request(`/api/customer/orders/${orderId}`, 'customer-nima');
        assert.equal(customerResponse.status, 200);
        assert.equal(customerResponse.body.order.pickupAddressReleased, null);
        for (const home of homes) assert.equal(JSON.stringify(customerResponse.body).includes(home), false);
      }
      await assertViews(null); // PENDING + SIMULATED_AUTHORIZED
      assert.equal((await request(kitchenRoute, 'cook-kambiz')).status, 403);
      assert.equal((await request(`/api/customer/orders/${orderId}`, 'customer-sara')).status, 403);
      assert.equal((await request(`/api/cook/orders/${orderId}/status`, 'cook-kambiz', 'POST', { nextStatus: 'ACCEPTED' })).status, 403);
      const foreignKitchen = await request('/api/cook/kitchen/cook-test-kambiz/orders', 'cook-kambiz');
      assert.equal(foreignKitchen.status, 200);
      assert.equal(foreignKitchen.body.orders.some((row) => row.id === orderId), false);
      assert.equal(JSON.stringify(foreignKitchen.body).includes(destination), false);
      const accepted = await request(`/api/cook/orders/${orderId}/status`, 'cook-pari', 'POST', { nextStatus: 'ACCEPTED' });
      assert.equal(accepted.status, 200);
      await assertViews(destination);

      // Only this disposable fixture DB permits invalid persisted rows, to test
      // fail-closed serialization if legacy/corrupt data reaches the HTTP layer.
      privacyDb.exec('PRAGMA ignore_check_constraints = ON');
      try {
        const setState = privacyDb.prepare('UPDATE orders SET status = ?, simulated_payment_status = ? WHERE id = ?');
        for (const state of ['ACCEPTED', 'PREPARING', 'READY', 'COMPLETED']) {
          for (const payment of ['SIMULATED_AUTHORIZED', 'SIMULATED_PAID']) {
            setState.run(state, payment, orderId);
            await assertViews(destination);
          }
        }
        for (const state of ['PENDING', 'REJECTED', 'CANCELLED', 'UNKNOWN_STATUS']) {
          setState.run(state, 'SIMULATED_AUTHORIZED', orderId);
          await assertViews(null);
        }
        for (const payment of ['SIMULATED_PENDING', 'SIMULATED_REFUNDED', 'UNAUTHORIZED', 'UNPAID', 'UNKNOWN_PAYMENT']) {
          setState.run('ACCEPTED', payment, orderId);
          await assertViews(null);
        }
      } finally {
        privacyDb.exec('PRAGMA ignore_check_constraints = OFF');
      }
    } finally {
      if (typeof server.closeAllConnections === 'function') server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
      privacyDb.close();
      cleanupTestDbFiles(privacyDbPath);
    }
  });

  test('20. Cook settings and customer saved addresses persist with ownership and cross-client UI round trips', { timeout: 20000 }, async () => {
    const settingsDbPath = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-settings-closure.sqlite');
    cleanupTestDbFiles(settingsDbPath);
    let instance = createSofrehHttpServer({ dbFilePath: settingsDbPath });
    let baseUrl;
    async function listen() {
      await new Promise((resolve) => instance.server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${instance.server.address().port}`;
    }
    async function close() {
      instance.server.closeAllConnections();
      await new Promise((resolve) => instance.server.close(resolve));
      instance.db.close();
    }
    async function api(route, actor = 'customer-nima', method = 'GET', body) {
      const response = await fetch(baseUrl + route, { method,
        headers: { Authorization: `Bearer test-token-${actor}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: response.status, body: await response.json() };
    }
    async function mount(role) {
      const html = await (await fetch(`${baseUrl}/preview/${role}`)).text();
      const client = mountPreviewHtmlInVm(html, { apiBase: baseUrl, urlPath: `/preview/${role}` });
      await client.waitForNetworkIdle();
      return client;
    }
    try {
      await listen();
      const kitchen = '/api/cook/kitchen/cook-test-pari';
      for (const malformed of [null, [], 'not-an-object', 42, false]) {
        const response = await fetch(baseUrl + '/api/customer/addresses', {
          method: 'POST', headers: { Authorization: 'Bearer test-token-customer-nima', 'Content-Type': 'application/json' },
          body: JSON.stringify(malformed)
        });
        assert.equal(response.status, 400, `Malformed body ${JSON.stringify(malformed)} must be rejected`);
        assert.equal((await response.json()).error.code, 'INVALID_JSON_BODY');
      }
      const dish = `${kitchen}/dishes/dish-test-ghormeh-1`;
      assert.equal((await api(dish, 'cook-kambiz', 'PATCH', { availabilityMode: 'REGULAR_UNAVAILABLE' })).status, 403);
      assert.equal((await api(dish, 'cook-pari', 'PATCH', { availabilityMode: 'SOMETIMES' })).status, 400);
      assert.equal((await api(dish, 'cook-pari', 'PATCH', { priceCents: -1 })).status, 400);
      assert.equal((await api(`${kitchen}/delivery-settings`, 'cook-pari', 'PATCH', { fulfillmentMode: 'UNKNOWN' })).status, 400);
      assert.equal((await api(`${kitchen}/delivery-settings`, 'cook-kambiz', 'PATCH', { fulfillmentMode: 'BOTH' })).status, 403);
      const cook = await mount('cook');
      cook.getElementById('availability-dish-test-ghormeh-1').value = 'REGULAR_UNAVAILABLE';
      cook.getElementById('price-dish-test-ghormeh-1').value = '1999';
      cook.getElementById('total-dish-test-ghormeh-1').value = '10';
      cook.getElementById('remaining-dish-test-ghormeh-1').value = '6';
      cook.querySelectorAll('[data-save-dish]').find((b) => b.getAttribute('data-save-dish') === 'dish-test-ghormeh-1').click();
      await cook.waitForNetworkIdle();
      let discovery = await api('/api/discovery/cooks');
      let pari = discovery.body.cooks.find((c) => c.id === 'cook-test-pari');
      let meal = pari.dishes.find((d) => d.id === 'dish-test-ghormeh-1');
      assert.equal(meal.availabilityMode, 'REGULAR_UNAVAILABLE');
      assert.equal(meal.priceCents, 1999);
      assert.equal(meal.remainingPortions, 6);
      assert.equal((await api('/api/customer/cart/items', 'customer-nima', 'POST', {
        cookId: 'cook-test-pari', dishId: meal.id, quantity: 1, fulfillmentType: 'pickup'
      })).status, 409);
      const customer = await mount('customer');
      assert.match(customer.getElementById('cookListCard').innerHTML, /data-dish-card-id="dish-test-ghormeh-1" data-availability-mode="REGULAR_UNAVAILABLE"/);
      assert.doesNotMatch(customer.getElementById('customerSettingsPanel').innerHTML, /id="customerAccountSelect"/);
      assert.match(customer.getElementById('customerSettingsPanel').innerHTML, /id="currentDemoCustomer">Nima/);
      cook.getElementById('cookFulfillmentMode').value = 'DELIVERY_ONLY';
      cook.getElementById('saveFeeBtn').click();
      await cook.waitForNetworkIdle();
      discovery = await api('/api/discovery/cooks');
      pari = discovery.body.cooks.find((c) => c.id === 'cook-test-pari');
      assert.equal(pari.supportsPickup, false);
      assert.equal(pari.supportsDelivery, true);
      assert.equal((await api('/api/customer/cart/items', 'customer-nima', 'POST', {
        cookId: pari.id, dishId: 'dish-test-zereshk-2', quantity: 1, fulfillmentType: 'pickup'
      })).status, 400);
      for (const [mode, pickup, delivery] of [['PICKUP_ONLY', true, false], ['BOTH', true, true]]) {
        const result = await api(`${kitchen}/delivery-settings`, 'cook-pari', 'PATCH', { fulfillmentMode: mode });
        assert.equal(result.status, 200);
        assert.equal(result.body.cook.supportsPickup, pickup);
        assert.equal(result.body.cook.supportsDelivery, delivery);
      }
      customer.getElementById('settingsAddressLabelInput').value = 'Demo <img src=x onerror=alert(1)>';
      customer.getElementById('settingsDeliveryAddressInput').value = '123 Fictional Test Street (DEMO)';
      customer.getElementById('saveSavedAddressBtn').click();
      await customer.waitForNetworkIdle();
      const addresses = await api('/api/customer/addresses');
      assert.equal(addresses.body.addresses.length, 1);
      const addressId = addresses.body.addresses[0].id;
      assert.match(customer.getElementById('customerSettingsPanel').innerHTML, /&lt;img src=x/);
      assert.doesNotMatch(customer.getElementById('customerSettingsPanel').innerHTML, /<img src=x/);
      const addressRoute = `/api/customer/addresses/${addressId}`;
      assert.equal((await api('/api/customer/addresses', 'customer-sara')).body.addresses.length, 0);
      for (const method of ['GET', 'PUT', 'DELETE']) {
        assert.equal((await api(addressRoute, 'customer-sara', method, method === 'PUT' ? { label: 'forged', address: '999 Fake Road' } : undefined)).status, 403);
      }
      assert.equal((await api('/api/customer/addresses', 'cook-pari')).status, 403);
      assert.equal((await api('/api/customer/addresses', 'customer-nima', 'POST', { label: 'x', address: '123 Fake Road', customer_user_id: 'forged' })).status, 400);
      await close();
      instance = createSofrehHttpServer({ dbFilePath: settingsDbPath });
      await listen();
      assert.equal((await api(addressRoute)).body.address.address, '123 Fictional Test Street (DEMO)');
      const reloaded = await mount('customer');
      assert.equal(reloaded.getElementById('settingsDeliveryAddressInput').value, '123 Fictional Test Street (DEMO)');
      const reloadedCook = await mount('cook');
      assert.match(reloadedCook.getElementById('feeCard').innerHTML, /id="availability-dish-test-ghormeh-1">[\s\S]*?value="REGULAR_UNAVAILABLE" selected/);
      assert.equal((await api(dish, 'cook-pari', 'PATCH', { availabilityMode: 'TODAY_AVAILABLE' })).status, 200);
      assert.equal((await api('/api/customer/cart/items', 'customer-nima', 'POST', {
        cookId: 'cook-test-pari', dishId: 'dish-test-ghormeh-1', quantity: 1, fulfillmentType: 'pickup'
      })).status, 200);
      const unsafeAddress = '<img src=x onerror=alert(1)> DEMO address';
      reloaded.getElementById('settingsDeliveryAddressInput').value = unsafeAddress;
      reloaded.getElementById('saveSavedAddressBtn').click();
      await reloaded.waitForNetworkIdle();
      assert.equal((await api(addressRoute)).body.address.address, unsafeAddress);
      assert.match(reloaded.getElementById('customerSettingsPanel').innerHTML, /&lt;img src=x/);
      assert.doesNotMatch(reloaded.getElementById('customerSettingsPanel').innerHTML, /<img src=x/);
      const delivery = await api('/api/customer/orders', 'customer-nima', 'POST', {
        cookId: 'cook-test-pari', fulfillmentType: 'delivery', deliveryAddress: unsafeAddress,
        items: [{ dishId: 'dish-test-zereshk-2', quantity: 1 }]
      });
      assert.equal(delivery.status, 201);
      assert.equal((await api(`/api/cook/orders/${delivery.body.order.id}/status`, 'cook-pari', 'POST', { nextStatus: 'ACCEPTED' })).status, 200);
      const cookWithAddress = await mount('cook');
      assert.match(cookWithAddress.getElementById('ordersCard').innerHTML, /&lt;img src=x/);
      assert.doesNotMatch(cookWithAddress.getElementById('ordersCard').innerHTML, /<img src=x/);
      reloaded.getElementById('deleteSavedAddressBtn').click();
      await reloaded.waitForNetworkIdle();
      assert.equal((await api('/api/customer/addresses')).body.addresses.length, 0);
    } finally {
      if (instance.server.listening) await close();
      cleanupTestDbFiles(settingsDbPath);
    }
  });

  test('21. Final polish serves local licensed assets and preserves honest fresh/location feedback', async () => {
    const file = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-final-polish.sqlite');
    cleanupTestDbFiles(file);
    const { server, db: polishDb } = createSofrehHttpServer({ dbFilePath: file });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const html = await (await fetch(baseUrl + '/preview/customer')).text();
      const client = mountPreviewHtmlInVm(html, { apiBase: baseUrl, urlPath: '/preview/customer' });
      await client.waitForNetworkIdle();
      client.querySelectorAll('[data-category-id="all"]')[0]?.click();
      const card = client.getElementById('cookListCard').innerHTML;
      assert.match(card, /Maman Pari Saffron Kitchen/);
      assert.doesNotMatch(card, /TEST ONLY|SYNTHETIC TEST FIXTURE/);
      assert.match(card, /id="regularUnavailableDishesSection"/);
      assert.match(card, /id="todayAvailableDishesSection"/);
      assert.match(card, /data-testid="fresh-today"/);
      assert.match(html, /class="map-stage" id="mapStage">\s*<button[^>]*class="locate-btn"[^>]*id="locateMeBtn"/);
      assert.equal((html.match(/id="mapAttribution"/g) || []).length, 1);
      assert.match(html, /attributionControl: false/);
      assert.match(html, /openstreetmap.org\/copyright/);
      assert.match(html, /openmaptiles.org/);
      assert.match(client.getElementById('testBanner').textContent, /Demo/);
      const discovery = await (await fetch(baseUrl + '/api/discovery/cooks')).json();
      assert.ok(discovery.cooks.every((cook) => cook.isSyntheticTestFixture));
      for (const asset of ['ghormeh-sabzi-majidi.jpg', 'zereshk-polo.jpg', 'tahchin.jpg']) {
        const response = await fetch(`${baseUrl}/assets/demo-food/${asset}`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('content-type'), 'image/jpeg');
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.deepEqual([...bytes.slice(0, 3)], [255, 216, 255]);
      }
      for (const key of ['pari','kambiz','golnar']) {
        const response = await fetch(`${baseUrl}/assets/kitchens/${key}.svg`);
        assert.equal(response.status, 200);
        assert.match(await response.text(), /Demo|demo/);
      }
      const credits = await (await fetch(baseUrl + '/assets/credits.html')).text();
      assert.match(credits, /Amin Majidi/);
      assert.match(credits, /Qomboy/);
      assert.match(credits, /creativecommons.org\/licenses\/by-sa\/3.0/);
      assert.equal((await fetch(baseUrl + '/assets/unlisted-file')).status, 404);
      let finishLocation;
      const locationClient = mountPreviewHtmlInVm(html, {
        apiBase: baseUrl, urlPath: '/preview/customer',
        geolocationMock: { getCurrentPosition(success, error) { finishLocation = error; } }
      });
      await locationClient.waitForNetworkIdle();
      locationClient.getElementById('locateMeBtn').click();
      assert.equal(locationClient.getElementById('geolocationStatus').getAttribute('data-geo-state'), 'requesting');
      finishLocation({ code: 3 });
      assert.match(locationClient.getElementById('geolocationStatus').textContent, /timed out/);
      polishDb.prepare("UPDATE dish_slots SET availability_mode = 'REGULAR_UNAVAILABLE' WHERE cook_id = ?").run('cook-test-pari');
      const noFresh = mountPreviewHtmlInVm(html, { apiBase: baseUrl, urlPath: '/preview/customer' });
      await noFresh.waitForNetworkIdle();
      assert.doesNotMatch(noFresh.getElementById('cookListCard').innerHTML, /data-testid="fresh-today"/);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      polishDb.close();
      cleanupTestDbFiles(file);
    }
  });

  test('22. Every existing dish has a local sample photo; FA wordmark and Sold out copy preserve category-free menus', async () => {
    const dbFile = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-photos-wordmark.sqlite');
    cleanupTestDbFiles(dbFile);
    const { server, db: photoDb } = createSofrehHttpServer({ dbFilePath: dbFile });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const discovery = await (await fetch(baseUrl + '/api/discovery/cooks')).json();
      assert.equal(discovery.categories, undefined);
      const dishes = discovery.cooks.flatMap((cook) => cook.dishes);
      assert.equal(dishes.length, 12);
      assert.ok(dishes.every((dish) => dish.isSamplePhoto && dish.photoUrl.startsWith('/assets/demo-food/')));
      for (const dish of dishes) {
        const response = await fetch(baseUrl + dish.photoUrl);
        assert.equal(response.status, 200, dish.id);
        const bytes = new Uint8Array(await response.arrayBuffer());
        assert.deepEqual([...bytes.slice(0, 3)], [255, 216, 255]);
      }
      const font = await fetch(baseUrl + '/assets/fonts/NotoNastaliqUrdu.ttf');
      assert.equal(font.status, 200);
      assert.equal(font.headers.get('content-type'), 'font/ttf');
      assert.deepEqual([...new Uint8Array(await font.arrayBuffer()).slice(0, 4)], [0, 1, 0, 0]);
      const license = await (await fetch(baseUrl + '/assets/fonts/OFL-NotoNastaliqUrdu.txt')).text();
      assert.match(license, /SIL OPEN FONT LICENSE Version 1.1/);
      const png = await fetch(baseUrl + '/assets/brand/wordmark-fa.png');
      assert.equal(png.status, 200);
      assert.deepEqual([...new Uint8Array(await png.arrayBuffer()).slice(0, 4)], [137, 80, 78, 71]);
      const credits = await (await fetch(baseUrl + '/assets/credits.html')).text();
      for (const author of ['stringparts','Diako1971','Krista','Amin Dehdarian','AilinParsa']) assert.ok(credits.includes(author));
      const html = await (await fetch(baseUrl + '/preview/customer')).text();
      assert.doesNotMatch(html, /id="categoryFilter"/);
      const customer = mountPreviewHtmlInVm(html, { apiBase: baseUrl, urlPath: '/preview/customer' });
      await customer.waitForNetworkIdle();
      customer.querySelectorAll('[data-category-id="all"]')[0]?.click();
      assert.match(customer.getElementById('cookListCard').innerHTML, /Sold out/);
      assert.match(customer.getElementById('cookListCard').innerHTML, /Regular Menu/);
      assert.equal(customer.getElementById('appTitle').textContent, 'Sofreh');
      customer.getElementById('localeToggleBtn').click();
      await customer.waitForNetworkIdle();
      assert.equal(customer.getElementById('appTitle').textContent, 'سفره');
      assert.equal(customer.getElementById('appTitle').getAttribute('data-wordmark'), 'fa');
      assert.match(customer.getElementById('cookListCard').innerHTML, /منوی ثابت/);
      assert.match(customer.getElementById('cookListCard').innerHTML, /تمام شد/);
      const cookHtml = await (await fetch(baseUrl + '/preview/cook')).text();
      const cook = mountPreviewHtmlInVm(cookHtml, { apiBase: baseUrl, urlPath: '/preview/cook' });
      await cook.waitForNetworkIdle();
      assert.match(cook.getElementById('feeCard').innerHTML, /Sold out/);
      cook.getElementById('localeToggleBtn').click();
      await cook.waitForNetworkIdle();
      assert.equal(cook.getElementById('appTitle').textContent, 'سفره');
      assert.equal(cook.getElementById('appTitle').getAttribute('data-wordmark'), 'fa');
      assert.match(cook.getElementById('feeCard').innerHTML, /تمام شد/);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      photoDb.close();
      cleanupTestDbFiles(dbFile);
    }
  });

  test('23. Customer Home Cart Orders navigate existing sections; Settings opens only from the top menu', async () => {
    const navDbFile = path.join(__dirname, '..', 'packages', 'backend', 'data', 'test-customer-nav.sqlite');
    cleanupTestDbFiles(navDbFile);
    const { server, db: navDb } = createSofrehHttpServer({ dbFilePath: navDbFile });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    try {
      const html = await (await fetch(baseUrl + '/preview/customer')).text();
      const navHtml = html.match(/<nav class="ue-bottom-nav"[\s\S]*?<\/nav>/)[0];
      assert.doesNotMatch(navHtml, /Settings|navTabAccount/);
      assert.match(navHtml, /navTabDiscover[\s\S]*?navTabCart[\s\S]*?navTabOrders/);
      const client = mountPreviewHtmlInVm(html, { apiBase: baseUrl, urlPath: '/preview/customer' });
      await client.waitForNetworkIdle();
      const scrolled = [];
      for (const section of ['mapStage','checkoutCard','ordersCard']) {
        client.getElementById(section).scrollIntoView = (options) => scrolled.push({ section, options });
      }
      assert.equal(client.getElementById('customerSettingsPanel').getAttribute('data-open'), 'false');
      client.getElementById('customerTopMenuBtn').click();
      assert.equal(client.getElementById('customerSettingsPanel').getAttribute('data-open'), 'true');
      for (const [button, section, label] of [
        ['navTabDiscover','mapStage','Home'], ['navTabCart','checkoutCard','Cart'], ['navTabOrders','ordersCard','Orders']
      ]) {
        assert.equal(client.getElementById(button).textContent, label);
        client.getElementById(button).click();
        assert.equal(scrolled.at(-1).section, section);
        assert.equal(scrolled.at(-1).options.behavior, 'smooth');
        assert.equal(client.getElementById(button).getAttribute('data-active'), 'true');
        assert.equal(client.getElementById('customerSettingsPanel').getAttribute('data-open'), 'false');
      }
      client.getElementById('localeToggleBtn').click();
      await client.waitForNetworkIdle();
      assert.equal(client.getElementById('navTabDiscover').textContent, 'خانه');
      assert.equal(client.getElementById('navTabCart').textContent, 'سبد');
      assert.equal(client.getElementById('navTabOrders').textContent, 'سفارش‌ها');
      client.getElementById('customerTopMenuBtn').click();
      assert.equal(client.getElementById('customerSettingsPanel').getAttribute('data-open'), 'true');
      assert.match(client.getElementById('customerSettingsPanel').innerHTML, /addressesSettingsSection/);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      navDb.close();
      cleanupTestDbFiles(navDbFile);
    }
  });
});
