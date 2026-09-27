"use strict";
/* Customer order history, public guest tracking, cancel, reorder.
 * Mount in server.js: app.use("/api/orders", require("./routes/orders"));
 */
const express = require("express");
const { get, all, run, tx, audit } = require("../db");
const { requireAuth } = require("../auth");
const { normalizePhone } = require("../util");
const { priceCart } = require("../pricing");
const { getServerCart, saveCart } = require("../cart");
const { releaseForOrder } = require("../inventory");
const { sendEmail } = require("../email");

const router = express.Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, status, error, extra) =>
  res.status(status).json({ ok: false, error, ...(extra || {}) });
const isStaff = (u) => !!u && (u.role === "staff" || u.role === "admin");

/** Timeline of an order, built from the audit trail. */
function orderTimeline(order) {
  const events = [{ event: "order_placed", at: order.created_at }];
  const logs = all(
    `SELECT action, detail, created_at FROM audit_log
     WHERE entity = 'order' AND entity_id = ? ORDER BY id ASC`,
    String(order.id)
  );
  const seen = new Set();
  for (const l of logs) {
    if (l.action === "order_created") continue; // already covered by order_placed
    const key = `${l.action}|${l.created_at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    events.push({ event: l.action, detail: l.detail || "", at: l.created_at });
  }
  return events;
}

/* ---------------- GET /api/orders — own orders summary (auth) ---------------- */
router.get("/", requireAuth, (req, res) => {
  const rows = all(
    `SELECT o.id, o.number, o.status, o.payment_status, o.total, o.created_at,
            (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
     FROM orders o WHERE o.user_id = ? ORDER BY o.id DESC LIMIT 200`,
    req.user.id
  );
  return ok(res, { orders: rows });
});

/* ---------------- GET /api/orders/track?number=&phone= — public guest tracking ----------------
 * Returns 404 without revealing whether the order exists. */
router.get("/track", (req, res) => {
  const number = String(req.query.number || "").trim();
  const phone = String(req.query.phone || "").trim();
  const order = number ? get("SELECT * FROM orders WHERE number = ?", number) : null;
  if (!order || !phone || normalizePhone(order.phone) !== normalizePhone(phone)) {
    return fail(res, 404, "not_found");
  }
  const items = all(
    "SELECT product_name, variant_name, qty FROM order_items WHERE order_id = ? ORDER BY id ASC",
    order.id
  );
  return ok(res, {
    number: order.number,
    status: order.status,
    payment_status: order.payment_status,
    total: order.total,
    created_at: order.created_at,
    items,
    timeline: orderTimeline(order),
  });
});

/* ---------------- GET /api/orders/:number — owner or staff ---------------- */
router.get("/:number", requireAuth, (req, res) => {
  const order = get("SELECT * FROM orders WHERE number = ?", String(req.params.number || "").trim());
  if (!order) return fail(res, 404, "not_found");
  if (!isStaff(req.user) && order.user_id !== req.user.id) return fail(res, 404, "not_found");
  const items = all("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC", order.id);
  const payment = get("SELECT * FROM payments WHERE order_id = ?", order.id);
  const shipment = get("SELECT * FROM shipments WHERE order_id = ?", order.id);
  const zone = order.zone_id ? get("SELECT * FROM delivery_zones WHERE id = ?", order.zone_id) : null;
  return ok(res, { order, items, payment, shipment, zone, timeline: orderTimeline(order) });
});

/* ---------------- POST /api/orders/:number/cancel — owner only ---------------- */
const CANCELLABLE = ["pending_payment", "payment_verification", "confirmed"];

router.post("/:number/cancel", (req, res) => {
  const order = get("SELECT * FROM orders WHERE number = ?", String(req.params.number || "").trim());
  if (!order) return fail(res, 404, "not_found");
  // Owner check: logged-in owner, staff/admin, or guest proving ownership via order phone.
  const staff = isStaff(req.user);
  const owns = !!req.user && order.user_id != null && order.user_id === req.user.id;
  const guestPhone = String((req.body && req.body.phone) || req.query.phone || "").trim();
  const guestOwns = order.user_id == null && !!guestPhone &&
    normalizePhone(order.phone) === normalizePhone(guestPhone);
  if (!owns && !guestOwns && !staff) return fail(res, 404, "not_found");
  if (!CANCELLABLE.includes(order.status)) return fail(res, 400, "bad_transition");
  const reason = String((req.body && req.body.reason) || "").trim().slice(0, 500);
  const actorId = req.user ? req.user.id : null;

  tx(() => {
    if (order.status === "confirmed") {
      // COD orders reserve stock at placement — give it back.
      const lines = all(
        "SELECT product_id, variant_id, variant_name, size_ml, qty FROM order_items WHERE order_id = ?",
        order.id
      );
      releaseForOrder(order.id, lines, actorId, "Customer cancelled"); // re-entrant tx
    }
    run("UPDATE orders SET status = 'cancelled', cancel_reason = ?, updated_at = ? WHERE id = ?",
      reason, Date.now(), order.id);
  });

  const toEmail = order.email || (req.user && req.user.email);
  if (toEmail) {
    try {
      sendEmail(toEmail, "order_cancelled",
        { name: order.name, number: order.number }, (req.user && req.user.lang) || "my");
    } catch (e) { console.error("order_cancelled email failed:", e.message); }
  }
  audit(actorId, "order_cancelled", "order", order.id, reason);

  return ok(res, { number: order.number, status: "cancelled" });
});

/* ---------------- POST /api/orders/:number/reorder — owner only ---------------- */
router.post("/:number/reorder", requireAuth, (req, res) => {
  const order = get("SELECT * FROM orders WHERE number = ?", String(req.params.number || "").trim());
  if (!order || order.user_id !== req.user.id) return fail(res, 404, "not_found");
  const orderItems = all("SELECT variant_id, qty FROM order_items WHERE order_id = ?", order.id);

  const merged = new Map();
  for (const ci of getServerCart(req.user.id)) merged.set(ci.variant_id, ci.qty);
  for (const it of orderItems) {
    // only variants that still exist and are active; cap by current stock
    const v = get("SELECT id, stock_qty FROM variants WHERE id = ? AND active = 1", it.variant_id);
    if (!v || v.stock_qty <= 0) continue;
    merged.set(v.id, Math.min(99, (merged.get(v.id) || 0) + Math.min(it.qty, v.stock_qty)));
  }
  const items = [...merged.entries()].map(([variant_id, qty]) => ({ variant_id, qty }));
  saveCart(req, res, items);
  const priced = priceCart(items, { userId: req.user.id });
  return ok(res, priced);
});

module.exports = router;
