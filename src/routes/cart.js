"use strict";
/* Cart: view priced cart, add/update/remove items.
   All mutations cap qty by variant stock and return the priced cart
   (with optional coupon/zone_id query passthrough). */
const express = require("express");
const { get } = require("../db");
const { priceCart } = require("../pricing");
const { effectiveCart, saveCart, cleanItems } = require("../cart");

const router = express.Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, status, error, extra = {}) =>
  res.status(status).json({ ok: false, error, ...extra });

function pricedCart(req, items) {
  const zoneRaw = req.query.zone_id;
  return priceCart(items, {
    couponCode: req.query.coupon || "",
    zoneId: zoneRaw != null && zoneRaw !== "" ? parseInt(zoneRaw, 10) || null : null,
    userId: req.user ? req.user.id : null,
  });
}

/** Variant row joined to product status, for add/update validation. */
function findVariant(id) {
  return get(
    `SELECT v.id, v.stock_qty, v.active, p.status AS pstatus
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.id = ?`,
    id
  );
}
function checkVariant(res, vid) {
  const v = findVariant(vid);
  if (!v) { fail(res, 404, "not_found"); return null; }
  if (!v.active || v.pstatus !== "active") { fail(res, 400, "unavailable"); return null; }
  return v;
}

router.get("/cart", (req, res) => {
  ok(res, pricedCart(req, effectiveCart(req)));
});

router.post("/cart/items", (req, res) => {
  const body = req.body || {};
  const vid = parseInt(body.variant_id, 10);
  if (!vid) return fail(res, 400, "validation", { fieldErrors: { variant_id: "required" } });
  let qty = parseInt(body.qty, 10);
  if (!qty || qty < 1) qty = 1;

  const v = checkVariant(res, vid);
  if (!v) return;
  qty = Math.min(qty, v.stock_qty);
  if (qty < 1) return fail(res, 400, "insufficient_stock", { available: v.stock_qty });

  const items = cleanItems(effectiveCart(req));
  const ex = items.find((i) => i.variant_id === vid);
  if (ex) ex.qty = Math.min(99, Math.min(v.stock_qty, ex.qty + qty));
  else items.push({ variant_id: vid, qty });

  saveCart(req, res, items);
  ok(res, pricedCart(req, items));
});

router.put("/cart/items/:variant_id", (req, res) => {
  const vid = parseInt(req.params.variant_id, 10);
  if (!vid) return fail(res, 400, "validation", { fieldErrors: { variant_id: "invalid" } });
  const qty = parseInt((req.body || {}).qty, 10);

  const items = cleanItems(effectiveCart(req)).filter((i) => i.variant_id !== vid);
  if (qty > 0) {
    const v = checkVariant(res, vid);
    if (!v) return;
    const capped = Math.min(99, Math.min(qty, v.stock_qty));
    if (capped < 1) return fail(res, 400, "insufficient_stock", { available: v.stock_qty });
    items.push({ variant_id: vid, qty: capped });
  }
  saveCart(req, res, items);
  ok(res, pricedCart(req, items));
});

router.delete("/cart/items/:variant_id", (req, res) => {
  const vid = parseInt(req.params.variant_id, 10);
  const items = cleanItems(effectiveCart(req)).filter((i) => i.variant_id !== vid);
  saveCart(req, res, items);
  ok(res, pricedCart(req, items));
});

module.exports = router;
