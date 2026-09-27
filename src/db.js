"use strict";
/* SQLite database: schema, connection, tiny query helpers, transactions. */
const path = require("path");
const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "data", "perfume.db");
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL DEFAULT '',
  pw_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('customer','staff','admin')),
  lang TEXT NOT NULL DEFAULT 'my',
  email_verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  reset_token TEXT,
  reset_expires INTEGER,
  notif_order_updates INTEGER NOT NULL DEFAULT 1,
  notif_promos INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  region TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  township TEXT NOT NULL,
  address_line TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS brands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  description_my TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  brand_id INTEGER NOT NULL REFERENCES brands(id),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'decant' CHECK(type IN ('decant','sample','travel','full_bottle')),
  gender TEXT NOT NULL DEFAULT 'unisex' CHECK(gender IN ('men','women','unisex')),
  concentration TEXT NOT NULL DEFAULT 'Eau de Parfum',
  family TEXT NOT NULL DEFAULT '',
  top_notes TEXT NOT NULL DEFAULT '[]',
  mid_notes TEXT NOT NULL DEFAULT '[]',
  base_notes TEXT NOT NULL DEFAULT '[]',
  accords TEXT NOT NULL DEFAULT '[]',
  release_year INTEGER,
  perfumer TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  description_my TEXT NOT NULL DEFAULT '',
  seasons TEXT NOT NULL DEFAULT '[]',
  occasions TEXT NOT NULL DEFAULT '[]',
  longevity INTEGER NOT NULL DEFAULT 3 CHECK(longevity BETWEEN 1 AND 5),
  sillage INTEGER NOT NULL DEFAULT 3 CHECK(sillage BETWEEN 1 AND 5),
  origin TEXT NOT NULL DEFAULT '',
  art_seed INTEGER NOT NULL DEFAULT 0,
  authenticity TEXT NOT NULL DEFAULT '',
  authenticity_my TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','draft','archived')),
  featured INTEGER NOT NULL DEFAULT 0,
  is_new INTEGER NOT NULL DEFAULT 0,
  bestseller INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  size_ml REAL NOT NULL,
  sku TEXT NOT NULL UNIQUE,
  price INTEGER NOT NULL,
  compare_at INTEGER,
  atomizer TEXT NOT NULL DEFAULT 'Glass atomizer',
  stock_qty INTEGER NOT NULL DEFAULT 0,
  low_threshold INTEGER NOT NULL DEFAULT 3,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS source_bottles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  ref TEXT NOT NULL UNIQUE,
  original_ml REAL NOT NULL,
  current_ml REAL NOT NULL,
  reserved_ml REAL NOT NULL DEFAULT 0,
  batch TEXT NOT NULL DEFAULT '',
  supplier TEXT NOT NULL DEFAULT '',
  cost_mmk INTEGER NOT NULL DEFAULT 0,
  purchased_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bottle_id INTEGER NOT NULL REFERENCES source_bottles(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK(type IN ('purchase','reserve','deduct','release','adjust')),
  qty_ml REAL NOT NULL,
  balance_ml REAL NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS carts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cart_id INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL CHECK(qty > 0),
  UNIQUE(cart_id, variant_id)
);
CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK(type IN ('percent','fixed','free_delivery')),
  value INTEGER NOT NULL DEFAULT 0,
  min_order INTEGER NOT NULL DEFAULT 0,
  max_uses INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  starts_at INTEGER,
  ends_at INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS coupon_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coupon_id INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  used_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS delivery_zones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_my TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  townships TEXT NOT NULL DEFAULT '[]',
  fee INTEGER NOT NULL DEFAULT 0,
  eta_days TEXT NOT NULL DEFAULT '',
  cod_available INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL,
  city TEXT NOT NULL DEFAULT '',
  township TEXT NOT NULL,
  address_line TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  payment_method TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  discount INTEGER NOT NULL DEFAULT 0,
  delivery_fee INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  coupon_code TEXT NOT NULL DEFAULT '',
  zone_id INTEGER REFERENCES delivery_zones(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK(status IN ('pending_payment','payment_verification','confirmed','preparing','packed','shipped','delivered','cancelled','refunded')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','proof_submitted','under_review','paid','failed','refunded','partially_refunded')),
  cancel_reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id INTEGER REFERENCES variants(id) ON DELETE SET NULL,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  variant_name TEXT NOT NULL,
  size_ml REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  qty INTEGER NOT NULL,
  line_total INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','proof_submitted','under_review','paid','failed','refunded','partially_refunded')),
  txn_ref TEXT NOT NULL DEFAULT '',
  proof_path TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  courier TEXT NOT NULL DEFAULT '',
  tracking_ref TEXT NOT NULL DEFAULT '',
  shipped_at INTEGER,
  delivered_at INTEGER,
  note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, product_id)
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  longevity INTEGER CHECK(longevity BETWEEN 1 AND 5),
  sillage INTEGER CHECK(sillage BETWEEN 1 AND 5),
  title TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  photo_path TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','published','rejected')),
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS banners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  title_my TEXT NOT NULL DEFAULT '',
  subtitle TEXT NOT NULL DEFAULT '',
  subtitle_my TEXT NOT NULL DEFAULT '',
  cta_text TEXT NOT NULL DEFAULT '',
  cta_text_my TEXT NOT NULL DEFAULT '',
  link TEXT NOT NULL DEFAULT '',
  gradient TEXT NOT NULL DEFAULT 'peach',
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS content (
  key TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body_en TEXT NOT NULL DEFAULT '',
  body_my TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL DEFAULT '',
  entity_id TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  template TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_variants_product ON variants(product_id);
CREATE INDEX IF NOT EXISTS idx_bottles_product ON source_bottles(product_id);
CREATE INDEX IF NOT EXISTS idx_movements_bottle ON inventory_movements(bottle_id);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(number);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

db.exec(SCHEMA);

/* ---------- tiny helpers ---------- */
function get(sql, ...params) {
  return db.prepare(sql).get(...params);
}
function all(sql, ...params) {
  return db.prepare(sql).all(...params);
}
function run(sql, ...params) {
  return db.prepare(sql).run(...params);
}
let txDepth = 0;
let txSeq = 0;
/** Execute fn() inside a transaction; rolls back on throw.
 *  Re-entrant: a tx() called inside another tx() runs in a SAVEPOINT, so
 *  helpers that wrap themselves in tx() (nextOrderNumber, reserveForOrder,
 *  deductForOrder, releaseForOrder, adjustBottle, addBottle) can be composed
 *  inside a caller's transaction as one atomic unit. */
function tx(fn) {
  if (txDepth > 0) {
    const sp = `pds_sp_${++txSeq}`;
    txDepth++;
    db.exec(`SAVEPOINT "${sp}";`);
    try {
      const out = fn();
      db.exec(`RELEASE "${sp}";`);
      txDepth--;
      return out;
    } catch (e) {
      try { db.exec(`ROLLBACK TO "${sp}";`); db.exec(`RELEASE "${sp}";`); } catch (_) {}
      txDepth--;
      throw e;
    }
  }
  txDepth++;
  db.exec("BEGIN IMMEDIATE;");
  try {
    const out = fn();
    db.exec("COMMIT;");
    return out;
  } catch (e) {
    try { db.exec("ROLLBACK;"); } catch (_) {}
    throw e;
  } finally {
    txDepth--;
  }
}
function setting(key, fallback = "") {
  const row = get("SELECT value FROM settings WHERE key = ?", key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, String(value));
}
function audit(actorId, action, entity = "", entityId = "", detail = "") {
  run("INSERT INTO audit_log (actor_id, action, entity, entity_id, detail, created_at) VALUES (?,?,?,?,?,?)",
    actorId || null, action, entity, String(entityId), detail, Date.now());
}

module.exports = { db, get, all, run, tx, setting, setSetting, audit, DB_PATH };
