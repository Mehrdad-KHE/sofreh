import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Shared Transactional SQLite Engine for Stage 1
 * Enforces WAL journal mode, foreign keys, busy_timeout, and BEGIN IMMEDIATE transactions.
 */
export function openSofrehDatabase(dbFilePath) {
  if (dbFilePath && dbFilePath !== ':memory:') {
    const dir = path.dirname(dbFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbFilePath || ':memory:');

  // Configure SQLite pragmas: WAL mode + foreign keys + busy timeout
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  const journalRow = db.prepare('PRAGMA journal_mode = WAL;').get();
  db.exec('PRAGMA synchronous = NORMAL;');

  // Attach runtime transaction telemetry for verification tests
  db.__sofrehStats = {
    dbFilePath: dbFilePath || ':memory:',
    configuredJournalMode: journalRow ? Object.values(journalRow)[0] : 'unknown',
    beginImmediateCount: 0,
    commitCount: 0,
    rollbackCount: 0
  };

  initializeSchema(db);
  return db;
}

export function getDatabasePragmas(db) {
  const journalRow = db.prepare('PRAGMA journal_mode;').get();
  const fkRow = db.prepare('PRAGMA foreign_keys;').get();
  const busyRow = db.prepare('PRAGMA busy_timeout;').get();
  return {
    journalMode: journalRow ? String(Object.values(journalRow)[0]).toLowerCase() : '',
    foreignKeys: fkRow ? Number(Object.values(fkRow)[0]) === 1 : false,
    busyTimeoutMs: busyRow ? Number(Object.values(busyRow)[0]) : 0,
    stats: { ...db.__sofrehStats }
  };
}

/**
 * Executes a callback inside an explicit SQLite `BEGIN IMMEDIATE` transaction.
 * `BEGIN IMMEDIATE` acquires a reserved write lock immediately upon transaction start,
 * preventing concurrent write transactions from racing on dish portion inventory.
 */
export function withImmediateTransaction(db, workFn) {
  db.exec('BEGIN IMMEDIATE;');
  if (db.__sofrehStats) {
    db.__sofrehStats.beginImmediateCount += 1;
  }
  try {
    const result = workFn();
    db.exec('COMMIT;');
    if (db.__sofrehStats) {
      db.__sofrehStats.commitCount += 1;
    }
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK;');
      if (db.__sofrehStats) {
        db.__sofrehStats.rollbackCount += 1;
      }
    } catch {
      // Ignore rollback secondary error if transaction already aborted
    }
    throw err;
  }
}

function ensureColumnExists(db, tableName, columnName, columnDefinitionSql) {
  const columns = db.prepare(`PRAGMA table_info(${tableName});`).all();
  const exists = columns.some((c) => String(c.name) === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinitionSql};`);
  }
}

export function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      role TEXT NOT NULL CHECK (role IN ('CUSTOMER', 'COOK')),
      display_name TEXT NOT NULL,
      phone_private TEXT NOT NULL,
      email_private TEXT NOT NULL,
      preferred_locale TEXT NOT NULL DEFAULT 'en-CA' CHECK (preferred_locale IN ('en-CA', 'fa-IR')),
      auth_token TEXT NOT NULL UNIQUE,
      created_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customer_saved_addresses (
      id TEXT PRIMARY KEY,
      customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      address TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cook_profiles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      kitchen_name_en TEXT NOT NULL,
      kitchen_name_fa TEXT NOT NULL,
      bio_en TEXT NOT NULL,
      bio_fa TEXT NOT NULL,
      neighborhood TEXT NOT NULL,
      public_lat REAL NOT NULL,
      public_lng REAL NOT NULL,
      exact_pickup_address_private TEXT NOT NULL,
      public_address_visibility TEXT NOT NULL DEFAULT 'AREA_ONLY',
      pickup_address_consent INTEGER NOT NULL DEFAULT 1 CHECK (pickup_address_consent IN (0, 1)),
      pickup_window_en TEXT NOT NULL DEFAULT '',
      pickup_window_fa TEXT NOT NULL DEFAULT '',
      delivery_fee_cents INTEGER NOT NULL CHECK (delivery_fee_cents >= 0),
      supports_pickup INTEGER NOT NULL DEFAULT 1 CHECK (supports_pickup IN (0, 1)),
      supports_delivery INTEGER NOT NULL DEFAULT 1 CHECK (supports_delivery IN (0, 1)),
      delivery_radius_km REAL NOT NULL DEFAULT 5.0 CHECK (delivery_radius_km >= 0),
      is_synthetic_test_fixture INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic_test_fixture IN (0, 1)),
      synthetic_badge_label TEXT NOT NULL DEFAULT 'TEST ONLY',
      updated_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dish_slots (
      id TEXT PRIMARY KEY,
      cook_id TEXT NOT NULL REFERENCES cook_profiles(id) ON DELETE CASCADE,
      title_en TEXT NOT NULL,
      title_fa TEXT NOT NULL,
      description_en TEXT NOT NULL,
      description_fa TEXT NOT NULL,
      price_cents INTEGER NOT NULL CHECK (price_cents > 0),
      total_portions INTEGER NOT NULL CHECK (total_portions >= 0),
      remaining_portions INTEGER NOT NULL CHECK (remaining_portions >= 0 AND remaining_portions <= total_portions),
      service_window_start_iso TEXT NOT NULL,
      service_window_end_iso TEXT NOT NULL,
      allergens_json TEXT NOT NULL DEFAULT '[]',
      availability_mode TEXT NOT NULL DEFAULT 'TODAY_AVAILABLE' CHECK (availability_mode IN ('TODAY_AVAILABLE', 'REGULAR_UNAVAILABLE')),
      photo_url TEXT NOT NULL DEFAULT '',
      schedule_note_en TEXT NOT NULL DEFAULT '',
      schedule_note_fa TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      updated_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_user_id TEXT NOT NULL REFERENCES users(id),
      cook_id TEXT NOT NULL REFERENCES cook_profiles(id),
      status TEXT NOT NULL CHECK (status IN ('PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'COMPLETED', 'REJECTED', 'CANCELLED')),
      fulfillment_type TEXT NOT NULL CHECK (fulfillment_type IN ('pickup', 'delivery')),
      subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
      delivery_fee_cents INTEGER NOT NULL CHECK (delivery_fee_cents >= 0),
      total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
      simulated_payment_method TEXT NOT NULL CHECK (simulated_payment_method IN ('SIMULATED_CARD', 'SIMULATED_INTERAC')),
      simulated_payment_status TEXT NOT NULL CHECK (simulated_payment_status IN ('SIMULATED_PENDING', 'SIMULATED_AUTHORIZED', 'SIMULATED_PAID', 'SIMULATED_REFUNDED')),
      simulated_payment_reference TEXT NOT NULL,
      delivery_address_private TEXT,
      customer_notes TEXT,
      idempotency_key TEXT,
      is_synthetic_test_order INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic_test_order IN (0, 1)),
      synthetic_badge_label TEXT NOT NULL DEFAULT 'TEST ONLY',
      created_at_iso TEXT NOT NULL,
      updated_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      dish_id TEXT NOT NULL REFERENCES dish_slots(id),
      title_en_snapshot TEXT NOT NULL,
      title_fa_snapshot TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents > 0),
      line_total_cents INTEGER NOT NULL CHECK (line_total_cents > 0)
    );

    CREATE TABLE IF NOT EXISTS carts (
      customer_user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      cook_id TEXT REFERENCES cook_profiles(id) ON DELETE SET NULL,
      fulfillment_type TEXT NOT NULL DEFAULT 'pickup' CHECK (fulfillment_type IN ('pickup', 'delivery')),
      delivery_address_private TEXT,
      updated_at_iso TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cart_items (
      customer_user_id TEXT NOT NULL REFERENCES carts(customer_user_id) ON DELETE CASCADE,
      dish_id TEXT NOT NULL REFERENCES dish_slots(id) ON DELETE CASCADE,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      updated_at_iso TEXT NOT NULL,
      PRIMARY KEY (customer_user_id, dish_id)
    );

    CREATE TABLE IF NOT EXISTS order_idempotency_keys (
      customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      idempotency_key TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      created_at_iso TEXT NOT NULL,
      PRIMARY KEY (customer_user_id, idempotency_key)
    );

    CREATE TABLE IF NOT EXISTS order_reviews (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      reviewer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reviewer_role TEXT NOT NULL CHECK (reviewer_role IN ('CUSTOMER', 'COOK')),
      target_cook_id TEXT NOT NULL REFERENCES cook_profiles(id) ON DELETE CASCADE,
      target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('CUSTOMER_TO_COOK', 'COOK_TO_CUSTOMER')),
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment_escaped TEXT NOT NULL,
      created_at_iso TEXT NOT NULL,
      UNIQUE(order_id, reviewer_user_id, direction)
    );
  `);

  // Safe non-destructive migrations for existing SQLite databases (such as sofreh-stage1.sqlite)
  ensureColumnExists(
    db,
    'cook_profiles',
    'public_address_visibility',
    "TEXT NOT NULL DEFAULT 'AREA_ONLY'"
  );
  ensureColumnExists(
    db,
    'cook_profiles',
    'pickup_address_consent',
    'INTEGER NOT NULL DEFAULT 1'
  );
  ensureColumnExists(
    db,
    'cook_profiles',
    'pickup_window_en',
    "TEXT NOT NULL DEFAULT ''"
  );
  ensureColumnExists(
    db,
    'cook_profiles',
    'pickup_window_fa',
    "TEXT NOT NULL DEFAULT ''"
  );

  ensureColumnExists(
    db,
    'dish_slots',
    'availability_mode',
    "TEXT NOT NULL DEFAULT 'TODAY_AVAILABLE'"
  );
  ensureColumnExists(
    db,
    'dish_slots',
    'photo_url',
    "TEXT NOT NULL DEFAULT ''"
  );
  ensureColumnExists(
    db,
    'dish_slots',
    'schedule_note_en',
    "TEXT NOT NULL DEFAULT ''"
  );
  ensureColumnExists(
    db,
    'dish_slots',
    'schedule_note_fa',
    "TEXT NOT NULL DEFAULT ''"
  );

  ensureColumnExists(db, 'orders', 'idempotency_key', 'TEXT');
  migrateFixtureConstraints(db);
  db.exec(`CREATE TABLE IF NOT EXISTS dish_photos (
    dish_id TEXT PRIMARY KEY REFERENCES dish_slots(id) ON DELETE CASCADE,
    id TEXT NOT NULL UNIQUE,
    jpeg BLOB NOT NULL,
    updated_at_iso TEXT NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_json TEXT NOT NULL,updated_at_iso TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notification_jobs (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL REFERENCES push_subscriptions(endpoint) ON DELETE CASCADE,
    payload_json TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,next_attempt_ms INTEGER NOT NULL,
    done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),lease_until_ms INTEGER NOT NULL DEFAULT 0
  );`);
  ensureColumnExists(db,'notification_jobs','lease_until_ms','INTEGER NOT NULL DEFAULT 0');
  ensureColumnExists(db,'cook_profiles','is_published','INTEGER NOT NULL DEFAULT 1 CHECK(is_published IN (0,1))');
  db.exec(`CREATE TABLE IF NOT EXISTS notification_pump (
    id INTEGER PRIMARY KEY CHECK(id=1),wake_after_ms INTEGER NOT NULL DEFAULT 0,lease_until_ms INTEGER NOT NULL DEFAULT 0
  ); INSERT OR IGNORE INTO notification_pump(id) VALUES(1);`);
}

// SQLite cannot alter a CHECK constraint in place. Rebuild only tables with
// the original fixture-only constraint, preserving all rows and indexes.
function migrateFixtureConstraints(db) {
  const changes = ['cook_profiles', 'orders'].map(name => {
    const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name)?.sql;
    const changed = sql.replace(/CHECK \(is_synthetic_test_(fixture|order) = 1\)/g, 'CHECK (is_synthetic_test_$1 IN (0, 1))')
      .replace(/ CHECK \(synthetic_badge_label = 'TEST ONLY'\)/g, '');
    return { name, sql: changed, needed: changed !== sql };
  }).filter(change => change.needed);
  if (!changes.length) return;
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    withImmediateTransaction(db, () => {
      for (const { name, sql } of changes) {
        const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(name);
        db.exec(sql.replace(new RegExp(`CREATE TABLE ["\\x60]?${name}["\\x60]?`, 'i'), `CREATE TABLE ${name}_upgrade`));
        db.exec(`INSERT INTO ${name}_upgrade SELECT * FROM ${name}; DROP TABLE ${name}; ALTER TABLE ${name}_upgrade RENAME TO ${name};`);
        for (const index of indexes) db.exec(index.sql);
      }
      if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Fixture migration failed its foreign-key check.');
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }
}
