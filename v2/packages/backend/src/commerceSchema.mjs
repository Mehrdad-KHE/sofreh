// Additive domain schema. Run only through the explicit schema initializer.
export function initializeCommerceSchema(db) {
  function column(table,name,definition){if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);}
  column('dish_slots','options_json',"TEXT NOT NULL DEFAULT '[]'");
  column('orders','discount_cents','INTEGER NOT NULL DEFAULT 0');
  column('orders','coupon_code',"TEXT NOT NULL DEFAULT ''");
  column('orders','scheduled_slot_id','TEXT');
  column('orders','scheduled_start_iso','TEXT');
  column('order_items','options_json',"TEXT NOT NULL DEFAULT '[]'");
  column('carts','coupon_code',"TEXT NOT NULL DEFAULT ''");
  column('carts','scheduled_slot_id','TEXT');
  // No table references cart_items. Preserve every legacy line while extending
  // its key to allow independent configurations of the same dish.
  if(!db.prepare('PRAGMA table_info(cart_items)').all().some(c=>c.name==='selection_key')) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(`CREATE TABLE cart_items_upgrade (
        customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        dish_id TEXT NOT NULL REFERENCES dish_slots(id),quantity INTEGER NOT NULL CHECK(quantity>0),updated_at_iso TEXT NOT NULL,
        selection_key TEXT NOT NULL DEFAULT '',options_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY(customer_user_id,dish_id,selection_key));
        INSERT INTO cart_items_upgrade(customer_user_id,dish_id,quantity,updated_at_iso)
          SELECT customer_user_id,dish_id,quantity,updated_at_iso FROM cart_items;
        DROP TABLE cart_items; ALTER TABLE cart_items_upgrade RENAME TO cart_items;`);
      if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Cart migration failed integrity check.');
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }
  column('cart_items','option_snapshots_json',"TEXT NOT NULL DEFAULT '[]'");
  db.exec(`CREATE TABLE IF NOT EXISTS kitchen_business (
    cook_id TEXT PRIMARY KEY REFERENCES cook_profiles(id) ON DELETE CASCADE,
    prep_minutes INTEGER NOT NULL DEFAULT 30 CHECK(prep_minutes BETWEEN 0 AND 240),
    preorder_only INTEGER NOT NULL DEFAULT 0 CHECK(preorder_only IN(0,1)),
    postal_prefixes_json TEXT NOT NULL DEFAULT '[]',announcement_en TEXT NOT NULL DEFAULT '',announcement_fa TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS fulfillment_slots (
    id TEXT PRIMARY KEY,cook_id TEXT NOT NULL REFERENCES cook_profiles(id),start_iso TEXT NOT NULL,end_iso TEXT NOT NULL,
    cutoff_minutes INTEGER NOT NULL CHECK(cutoff_minutes BETWEEN 0 AND 10080),capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 1000),
    mode TEXT NOT NULL CHECK(mode IN('pickup','delivery','both')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)));
    CREATE INDEX IF NOT EXISTS fulfillment_slots_cook_idx ON fulfillment_slots(cook_id,start_iso);
    CREATE TABLE IF NOT EXISTS kitchen_coupons (
    id TEXT PRIMARY KEY,cook_id TEXT NOT NULL REFERENCES cook_profiles(id),code TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN('percent','fixed')),
    value INTEGER NOT NULL CHECK(value>0),minimum_cents INTEGER NOT NULL DEFAULT 0,max_uses INTEGER NOT NULL CHECK(max_uses>0),
    per_customer INTEGER NOT NULL DEFAULT 1 CHECK(per_customer>0),starts_iso TEXT NOT NULL,ends_iso TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
    UNIQUE(cook_id,code));
    CREATE TABLE IF NOT EXISTS kitchen_favorites (
    customer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,cook_id TEXT NOT NULL REFERENCES cook_profiles(id) ON DELETE CASCADE,
    created_at_iso TEXT NOT NULL,PRIMARY KEY(customer_user_id,cook_id));
    CREATE TABLE IF NOT EXISTS storefront_views (
    cook_id TEXT NOT NULL REFERENCES cook_profiles(id) ON DELETE CASCADE,day TEXT NOT NULL,views INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY(cook_id,day));
    CREATE TABLE IF NOT EXISTS order_messages (
    id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),author_user_id TEXT NOT NULL REFERENCES users(id),
    body TEXT NOT NULL,created_at_iso TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS order_messages_order_idx ON order_messages(order_id,created_at_iso);`);
  column('fulfillment_slots','edit_version','INTEGER NOT NULL DEFAULT 1');
  column('kitchen_coupons','edit_version','INTEGER NOT NULL DEFAULT 1');
  db.exec(`CREATE TABLE IF NOT EXISTS kitchen_identity (
    cook_id TEXT PRIMARY KEY REFERENCES cook_profiles(id) ON DELETE CASCADE,
    public_name TEXT NOT NULL DEFAULT '',links_json TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS kitchen_images (
    cook_id TEXT NOT NULL REFERENCES cook_profiles(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN('avatar','cover')),id TEXT NOT NULL UNIQUE,
    jpeg BLOB NOT NULL,updated_at_iso TEXT NOT NULL,PRIMARY KEY(cook_id,kind));`);
  column('kitchen_images','is_sample','INTEGER NOT NULL DEFAULT 0');
}
