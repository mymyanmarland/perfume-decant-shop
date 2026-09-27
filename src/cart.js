"use strict";
/* Carts: guests keep a signed cookie cart; logged-in users get a DB cart.
   On sign-in the guest cart merges into the server cart. */
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { get, all, run } = require("./db");

const COOKIE = "pds_cart";
const SECRET_FILE = path.join(__dirname, "..", "data", ".cookie_secret");

function cookieSecret() {
  let s = process.env.SESSION_SECRET;
  if (s) return s;
  try {
    s = fs.readFileSync(SECRET_FILE, "utf8").trim();
    if (s) return s;
  } catch (_) {}
  s = crypto.randomBytes(32).toString("hex");
  fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
function sign(payload) {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", cookieSecret()).update(b64).digest("base64url");
  return b64 + "." + sig;
}
function unsign(signed) {
  if (!signed || typeof signed !== "string") return null;
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const b64 = signed.slice(0, i), sig = signed.slice(i + 1);
  const expect = crypto.createHmac("sha256", cookieSecret()).update(b64).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const p = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    return Array.isArray(p) ? p : null;
  } catch { return null; }
}

/** Normalize raw items: [{variant_id, qty}] with sane ints. */
function cleanItems(items) {
  const map = new Map();
  for (const it of items || []) {
    const vid = parseInt(it.variant_id, 10);
    const qty = parseInt(it.qty, 10);
    if (!vid || !qty || qty < 1) continue;
    map.set(vid, Math.min(99, (map.get(vid) || 0) + qty));
  }
  return [...map.entries()].map(([variant_id, qty]) => ({ variant_id, qty }));
}

function getGuestCart(req) {
  return cleanItems(unsign(req.cookies ? req.cookies[COOKIE] : null));
}
function setGuestCart(res, items) {
  res.cookie(COOKIE, sign(cleanItems(items)), {
    httpOnly: true, sameSite: "lax", maxAge: 30 * 24 * 60 * 60 * 1000,
    secure: process.env.NODE_ENV === "production",
  });
}
function clearGuestCart(res) {
  res.clearCookie(COOKIE);
}

function getServerCart(userId) {
  const cart = get("SELECT id FROM carts WHERE user_id = ?", userId);
  if (!cart) return [];
  return all("SELECT variant_id, qty FROM cart_items WHERE cart_id = ?", cart.id);
}
function setServerCart(userId, items) {
  items = cleanItems(items);
  let cart = get("SELECT id FROM carts WHERE user_id = ?", userId);
  if (!cart) {
    const r = run("INSERT INTO carts (user_id, updated_at) VALUES (?, ?)", userId, Date.now());
    cart = { id: r.lastInsertRowid };
  } else {
    run("DELETE FROM cart_items WHERE cart_id = ?", cart.id);
    run("UPDATE carts SET updated_at = ? WHERE id = ?", Date.now(), cart.id);
  }
  for (const it of items) {
    run("INSERT INTO cart_items (cart_id, variant_id, qty) VALUES (?,?,?)", cart.id, it.variant_id, it.qty);
  }
}
function mergeCarts(userId, guestItems) {
  const server = getServerCart(userId);
  const map = new Map();
  for (const it of server) map.set(it.variant_id, it.qty);
  for (const it of cleanItems(guestItems)) {
    // cap merged qty by available stock
    const v = get("SELECT stock_qty FROM variants WHERE id = ? AND active = 1", it.variant_id);
    const cap = v ? v.stock_qty : 0;
    map.set(it.variant_id, Math.min(99, Math.min(cap, (map.get(it.variant_id) || 0) + it.qty)));
  }
  const merged = [...map.entries()].filter(([, q]) => q > 0).map(([variant_id, qty]) => ({ variant_id, qty }));
  setServerCart(userId, merged);
  return merged;
}
/** Effective cart items for the request (server cart if logged in, else guest). */
function effectiveCart(req) {
  if (req.user) return getServerCart(req.user.id);
  return getGuestCart(req);
}
/** Persist updated items back to the right place. */
function saveCart(req, res, items) {
  if (req.user) setServerCart(req.user.id, items);
  else setGuestCart(res, items);
}

module.exports = {
  COOKIE, getGuestCart, setGuestCart, clearGuestCart,
  getServerCart, setServerCart, mergeCarts, effectiveCart, saveCart, cleanItems,
};
