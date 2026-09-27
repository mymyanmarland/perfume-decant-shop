"use strict";
/* Server-side pricing. ALL totals are computed here from DB truth.
   Never trust subtotal/discount/total submitted by the browser. */
const { get, all, setting } = require("./db");

/**
 * items: [{ variant_id, qty }]
 * Returns { lines, subtotal, discount, deliveryFee, total, coupon, zone, errors }
 * lines: [{ variant_id, product_id, product_name, variant_name, size_ml, unit_price, qty, line_total, stock_ok }]
 */
function priceCart(items, { couponCode = "", zoneId = null, userId = null } = {}) {
  const lines = [];
  const errors = [];
  for (const it of items) {
    const v = get(
      `SELECT v.*, p.name AS product_name, p.status AS pstatus, p.slug AS pslug
       FROM variants v JOIN products p ON p.id = v.product_id
       WHERE v.id = ?`, it.variant_id);
    if (!v || !v.active || v.pstatus !== "active") {
      errors.push({ variant_id: it.variant_id, error: "unavailable" });
      continue;
    }
    const qty = Math.max(1, Math.min(99, parseInt(it.qty, 10) || 1));
    if (v.stock_qty < qty) {
      errors.push({ variant_id: it.variant_id, error: "insufficient_stock", available: v.stock_qty });
      continue;
    }
    lines.push({
      variant_id: v.id, product_id: v.product_id, product_name: v.product_name,
      variant_name: v.name, size_ml: v.size_ml, unit_price: v.price,
      qty, line_total: v.price * qty, stock_qty: v.stock_qty,
    });
  }
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);

  // Coupon
  let discount = 0, coupon = null, freeDelivery = false;
  if (couponCode) {
    const c = get("SELECT * FROM coupons WHERE code = ? COLLATE NOCASE", couponCode.trim());
    const now = Date.now();
    if (c && c.active && (!c.starts_at || c.starts_at <= now) && (!c.ends_at || c.ends_at >= now)
        && (c.max_uses == null || c.used_count < c.max_uses) && subtotal >= c.min_order) {
      const already = userId ? get("SELECT id FROM coupon_usage WHERE coupon_id = ? AND user_id = ?", c.id, userId) : null;
      if (!already) {
        coupon = { id: c.id, code: c.code, type: c.type, value: c.value };
        if (c.type === "percent") discount = Math.floor(subtotal * c.value / 100);
        else if (c.type === "fixed") discount = Math.min(c.value, subtotal);
        else if (c.type === "free_delivery") freeDelivery = true;
      } else {
        errors.push({ error: "coupon_used" });
      }
    } else {
      errors.push({ error: "coupon_invalid" });
    }
  }

  // Delivery fee (server-side from zone)
  let deliveryFee = 0, zone = null;
  if (zoneId) {
    zone = get("SELECT * FROM delivery_zones WHERE id = ? AND active = 1", zoneId);
  }
  const freeThreshold = parseInt(setting("free_delivery_threshold", "0"), 10) || 0;
  if (zone) {
    deliveryFee = (freeThreshold > 0 && (subtotal - discount) >= freeThreshold) || freeDelivery ? 0 : zone.fee;
  }

  const total = Math.max(0, subtotal - discount + deliveryFee);
  return { lines, subtotal, discount, deliveryFee, total, coupon, zone, freeDelivery, errors };
}

/** Validate that every line's ml requirement is covered by source bottles. */
function checkMlAvailability(lines) {
  const problems = [];
  for (const l of lines) {
    const row = get(
      `SELECT COALESCE(SUM(current_ml - reserved_ml), 0) AS avail
       FROM source_bottles WHERE product_id = ?`, l.product_id);
    const need = l.size_ml * l.qty;
    if ((row?.avail || 0) < need) {
      problems.push({ variant_id: l.variant_id, error: "insufficient_ml", need, avail: row?.avail || 0 });
    }
  }
  return problems;
}

module.exports = { priceCart, checkMlAvailability };
