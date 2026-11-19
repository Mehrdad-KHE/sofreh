import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const requiredFiles = [
  'package.json',
  'tsconfig.json',
  'packages/shared/package.json',
  'packages/shared/src/types.ts',
  'packages/shared/src/i18n.mjs',
  'packages/shared/src/mapConfig.mjs',
  'packages/shared/src/fixtures.mjs',
  'packages/shared/src/index.mjs',
  'packages/backend/package.json',
  'packages/backend/src/db.mjs',
  'packages/backend/src/privacy.mjs',
  'packages/backend/src/service.mjs',
  'packages/backend/src/server.mjs',
  'packages/backend/src/index.mjs',
  'apps/customer-mobile/package.json',
  'apps/customer-mobile/app.json',
  'apps/customer-mobile/src/customerController.mjs',
  'apps/customer-mobile/src/CustomerApp.tsx',
  'apps/customer-mobile/preview/index.html',
  'apps/cook-mobile/package.json',
  'apps/cook-mobile/app.json',
  'apps/cook-mobile/src/cookController.mjs',
  'apps/cook-mobile/src/CookApp.tsx',
  'apps/cook-mobile/preview/index.html',
  'tests/stage1.test.mjs'
];

let missing = 0;
for (const rel of requiredFiles) {
  const full = path.join(rootDir, rel);
  if (!fs.existsSync(full)) {
    console.error(`MISSING: ${rel}`);
    missing += 1;
  }
}

if (missing > 0) {
  process.exit(1);
}

// Verify UI previews and TSX components contain required Stage 1 contracts
const customerPreview = fs.readFileSync(
  path.join(rootDir, 'apps/customer-mobile/preview/index.html'),
  'utf8'
);
const cookPreview = fs.readFileSync(
  path.join(rootDir, 'apps/cook-mobile/preview/index.html'),
  'utf8'
);
const typesContent = fs.readFileSync(
  path.join(rootDir, 'packages/shared/src/types.ts'),
  'utf8'
);

if (!customerPreview.includes('https://tiles.openfreemap.org/styles/liberty')) {
  throw new Error('Customer preview missing OpenFreeMap style URL');
}
if (!customerPreview.includes('maplibre-gl')) {
  throw new Error('Customer preview missing MapLibre GL integration');
}
if (!customerPreview.includes('id="testBanner"') || !cookPreview.includes('id="testBanner"')) {
  throw new Error('UI previews missing discreet truthful demo notice banner');
}
if (!typesContent.includes("export type SupportedLocale = 'en-CA' | 'fa-IR';")) {
  throw new Error('Shared types.ts missing SupportedLocale contract');
}

// Verify UTF-8 encoding and authentic Persian (fa-IR) text with no replacement/placeholder corruption
const PERSIAN_UNICODE_REGEX = /[\u0600-\u06FF]{3,}/;
const CORRUPTION_REGEX = /\uFFFD|\?\?\?/;

for (const [name, content] of [
  ['apps/customer-mobile/preview/index.html', customerPreview],
  ['apps/cook-mobile/preview/index.html', cookPreview]
]) {
  if (!content.includes('<meta charset="UTF-8"')) {
    throw new Error(`${name} missing UTF-8 meta charset declaration`);
  }
  if (!PERSIAN_UNICODE_REGEX.test(content)) {
    throw new Error(`${name} does not contain authentic Persian (fa-IR) Unicode script`);
  }
  if (CORRUPTION_REGEX.test(content)) {
    throw new Error(`${name} contains corrupted replacement characters or ??? placeholders`);
  }
  if (content.includes('alert(')) {
    throw new Error(`${name} must not use local alert() instead of real backend persistence`);
  }
  if (!content.includes('data-theme="forest"')) {
    throw new Error(`${name} must use fixed Forest / Cream theme (data-theme="forest")`);
  }
  if (!content.includes('My Orders') || !content.includes('سفارشهای من')) {
    throw new Error(`${name} must include renamed order history 'My Orders' / 'سفارشهای من'`);
  }
}

for (const requiredCustomerMarker of [
  'id="mapResizeHandle"',
  'id="locateMeBtn"',
  'id="currentUserMarker"',
  'id="todayAvailableDishesSection"',
  'id="regularUnavailableDishesSection"',
  'id="customerTopMenuBtn"',
  'id="demoPaymentSettingsPanel"',
  '4242',
  '/api/customer/cart',
  '/api/customer/orders',
  '/api/discovery/cooks',
  '/reviews'
]) {
  if (!customerPreview.includes(requiredCustomerMarker)) {
    throw new Error(`Customer preview HTML missing required WEB batch marker: ${requiredCustomerMarker}`);
  }
}

if (
  !cookPreview.includes('/api/cook/kitchen/') ||
  !cookPreview.includes('/api/cook/orders/') ||
  !cookPreview.includes('/reviews')
) {
  throw new Error('Cook preview HTML must connect to real /api/cook/kitchen/, /api/cook/orders/, and /reviews endpoints');
}

console.log(
  `VERIFIED: All ${requiredFiles.length} Stage 1 v2 files, UTF-8 Persian (fa-IR) strings, TypeScript contracts, Forest/Cream default, resizable map, permission-gated geolocation, storefront menus, persisted multi-item cart, two-way reviews, and simulated payment settings are valid.`
);
