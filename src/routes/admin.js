"use strict";
/* Admin API router — mounted at /api/admin.
   requireStaff on everything; requireAdmin on /staff*, /settings, /audit,
   and on any user-role change. */
const express = require("express");
const { get, all, run, tx, setSetting, audit } = require("../db");
const { requireStaff, requireAdmin, createUser, publicUser, hashPassword, newSalt } = require("../auth");
const {
  validMyanmarPhone, validEmail, validPassword, slugify, parseJsonArray, canTransition,
  ORDER_STATUSES, PAYMENT_STATUSES,
} = require("../util");
const { reserveForOrder, deductForOrder, releaseForOrder, adjustBottle, addBottle } = require("../inventory");
const { sendEmail } = require("../email");

const router = express.Router();
router.use(requireStaff);

/* ---------- helpers ---------- */
const ok = (res, data) => res.json({ ok: true, data });
const bad = (res, error, status = 400, extra) =>
  res.status(status).json(Object.assign({ ok: false, error }, extra || {}));

function parseLimit(q) {
  let l = parseInt(q, 10);
  if (Number.isNaN(l) || l < 1) l = 20;
  return Math.min(l, 100);
}
/** Keyset pagination: cursor = last id, id DESC. */
function paged(req, baseSql, params = [], idExpr = "id", idKey = "id") {
  const limit = parseLimit(req.query.limit);
  const cursor = parseInt(req.query.cursor, 10);
  let sql = baseSql;
  const p = [...params];
  if (cursor > 0) {
    sql += (/\bwhere\b/i.test(baseSql) ? " AND " : " WHERE ") + `${idExpr} < ?`;
    p.push(cursor);
  }
  sql += ` ORDER BY ${idExpr} DESC LIMIT ?`;
  p.push(limit + 1);
  const rows = all(sql, ...p);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: items.length ? items[items.length - 1][idKey] : null, hasMore };
}

function orderLang(order) {
  if (order.user_id) {
    const u = get("SELECT lang FROM users WHERE id = ?", order.user_id);
    if (u && u.lang) return u.lang;
  }
  return "my";
}
function orderLines(orderId) {
  return all(
    "SELECT product_id, variant_id, variant_name, size_ml, qty FROM order_items WHERE order_id = ?",
    orderId
  ).map((l) => ({
    product_id: l.product_id, variant_id: l.variant_id,
    variant_name: l.variant_name, size_ml: l.size_ml, qty: l.qty,
  }));
}
function maybeEmail(order, template, data) {
  if (order.email) sendEmail(order.email, template, data, orderLang(order));
}

function strArr(v) {
  if (Array.isArray(v)) return JSON.stringify(v);
  if (typeof v === "string" && v) return v;
  return "[]";
}
function num(v, dflt = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function intOrNull(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? null : n;
}

/* ---------- dashboard ---------- */
router.get("/dashboard", (req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const dayStart = start.getTime();
  const monthStart = Date.now() - 30 * 24 * 60 * 60 * 1000;

  const todayOrders = get("SELECT COUNT(*) AS c FROM orders WHERE created_at >= ?", dayStart).c;
  const todaySales = get(
    "SELECT COALESCE(SUM(total),0) AS s FROM orders WHERE created_at >= ? AND status NOT IN ('cancelled','refunded')",
    dayStart).s;
  const pendingPayments = get("SELECT COUNT(*) AS c FROM payments WHERE status = 'pending'").c;
  const paymentsToVerify = get("SELECT COUNT(*) AS c FROM payments WHERE status IN ('proof_submitted','under_review')").c;
  const queue = {};
  for (const s of ["confirmed", "preparing", "packed"]) {
    queue[s] = get("SELECT COUNT(*) AS c FROM orders WHERE status = ?", s).c;
  }
  const lowStock = all(
    `SELECT v.id, v.name, v.sku, v.size_ml, v.stock_qty, v.low_threshold, p.name AS product_name
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.active = 1 AND v.stock_qty <= v.low_threshold
     ORDER BY v.stock_qty ASC LIMIT 20`);
  const bestSellers = all(
    `SELECT oi.product_id, oi.product_name, SUM(oi.qty) AS qty, SUM(oi.line_total) AS revenue
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= ? AND o.status NOT IN ('cancelled','refunded')
     GROUP BY oi.product_id ORDER BY qty DESC LIMIT 5`, monthStart);
  const recentCustomers = all(
    "SELECT id, name, email, phone, created_at FROM users WHERE role = 'customer' ORDER BY id DESC LIMIT 5");

  ok(res, { todayOrders, todaySales, pendingPayments, paymentsToVerify, fulfillmentQueue: queue, lowStock, bestSellers, recentCustomers });
});

/* ---------- orders ---------- */
router.get("/orders", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    if (!ORDER_STATUSES.includes(req.query.status)) return bad(res, "validation");
    where.push("o.status = ?"); params.push(req.query.status);
  }
  if (req.query.q) {
    where.push("(o.number LIKE ? OR o.name LIKE ? OR o.phone LIKE ?)");
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  const base = `SELECT o.*, (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS item_count FROM orders o` +
    (where.length ? " WHERE " + where.join(" AND ") : "");
  ok(res, paged(req, base, params, "o.id", "id"));
});

router.get("/orders/:number", (req, res) => {
  const order = get("SELECT * FROM orders WHERE number = ?", req.params.number);
  if (!order) return bad(res, "not_found", 404);
  const items = all("SELECT * FROM order_items WHERE order_id = ? ORDER BY id", order.id);
  const payment = get("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1", order.id) || null;
  const shipment = get("SELECT * FROM shipments WHERE order_id = ?", order.id) || null;
  const logs = all(
    "SELECT action, detail, created_at FROM audit_log WHERE entity = 'order' AND entity_id = ? ORDER BY id ASC",
    String(order.id));
  const timeline = [{ action: "order_created", detail: "", created_at: order.created_at },
    ...logs.map((l) => ({ action: l.action, detail: l.detail, created_at: l.created_at }))];
  ok(res, { order, items, payment, shipment, timeline });
});

router.patch("/orders/:number/status", (req, res) => {
  const { status, tracking_ref, courier, note } = req.body || {};
  const order = get("SELECT * FROM orders WHERE number = ?", req.params.number);
  if (!order) return bad(res, "not_found", 404);
  if (!ORDER_STATUSES.includes(status)) return bad(res, "validation");
  if (!canTransition(order.status, status)) return bad(res, "bad_transition");
  const lines = orderLines(order.id);

  try {
    tx(() => {
      run("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", status, Date.now(), order.id);
      if (status === "confirmed") {
        // only reachable from payment_verification per STATUS_FLOW
        reserveForOrder(order.id, lines, req.user.id);
      } else if (status === "packed") {
        deductForOrder(order.id, lines, req.user.id);
      } else if (status === "cancelled") {
        if (["confirmed", "preparing"].includes(order.status)) {
          releaseForOrder(order.id, lines, req.user.id, note || "Order cancelled by staff");
        }
        if (note) run("UPDATE orders SET cancel_reason = ? WHERE id = ?", String(note), order.id);
      } else if (status === "shipped") {
        const ex = get("SELECT * FROM shipments WHERE order_id = ?", order.id);
        if (ex) {
          run("UPDATE shipments SET courier = ?, tracking_ref = ?, shipped_at = ?, note = ? WHERE id = ?",
            courier || ex.courier, tracking_ref || ex.tracking_ref, Date.now(), note || ex.note, ex.id);
        } else {
          run("INSERT INTO shipments (order_id, courier, tracking_ref, shipped_at, note) VALUES (?,?,?,?,?)",
            order.id, courier || "", tracking_ref || "", Date.now(), note || "");
        }
        maybeEmail(order, "order_shipped", { name: order.name, number: order.number, tracking: tracking_ref || "" });
      } else if (status === "delivered") {
        const ex = get("SELECT * FROM shipments WHERE order_id = ?", order.id);
        if (ex) run("UPDATE shipments SET delivered_at = ? WHERE id = ?", Date.now(), ex.id);
        else run("INSERT INTO shipments (order_id, delivered_at) VALUES (?,?)", order.id, Date.now());
        maybeEmail(order, "order_delivered", { name: order.name, number: order.number });
      } else if (status === "refunded") {
        const p = get("SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1", order.id);
        if (p) run("UPDATE payments SET status = 'refunded' WHERE id = ?", p.id);
        run("UPDATE orders SET payment_status = 'refunded' WHERE id = ?", order.id);
        maybeEmail(order, "refund_confirmation", { name: order.name, number: order.number });
      }
    });
  } catch (e) {
    if (/^(insufficient_ml|deduct_shortfall):/.test(String(e.message || ""))) {
      return bad(res, "insufficient_ml");
    }
    throw e;
  }
  audit(req.user.id, "order_status", "order", order.id, `${order.status} -> ${status}${note ? " | " + note : ""}`);
  ok(res, { number: order.number, status });
});

/* ---------- payments ---------- */
router.get("/payments", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    if (!PAYMENT_STATUSES.includes(req.query.status)) return bad(res, "validation");
    where.push("p.status = ?"); params.push(req.query.status);
  }
  const base = `SELECT p.*, o.number AS order_number, o.name AS customer_name, o.phone AS customer_phone
    FROM payments p JOIN orders o ON o.id = p.order_id` +
    (where.length ? " WHERE " + where.join(" AND ") : "");
  ok(res, paged(req, base, params, "p.id", "id"));
});

router.post("/payments/:id/approve", (req, res) => {
  const p = get("SELECT * FROM payments WHERE id = ?", req.params.id);
  if (!p) return bad(res, "not_found", 404);
  if (!["pending", "proof_submitted", "under_review"].includes(p.status)) return bad(res, "bad_transition");
  const order = get("SELECT * FROM orders WHERE id = ?", p.order_id);
  if (!order) return bad(res, "not_found", 404);
  if (!canTransition(order.status, "confirmed")) return bad(res, "bad_transition");
  const lines = orderLines(order.id);
  try {
    tx(() => {
      run("UPDATE payments SET status = 'paid', reviewed_by = ?, reviewed_at = ? WHERE id = ?",
        req.user.id, Date.now(), p.id);
      run("UPDATE orders SET status = 'confirmed', payment_status = 'paid', updated_at = ? WHERE id = ?",
        Date.now(), order.id);
      reserveForOrder(order.id, lines, req.user.id);
      maybeEmail(order, "payment_approved", { name: order.name, number: order.number });
    });
  } catch (e) {
    if (/^(insufficient_ml|deduct_shortfall):/.test(String(e.message || ""))) {
      return bad(res, "insufficient_ml");
    }
    throw e;
  }
  audit(req.user.id, "payment_approve", "payment", p.id, `order ${order.number} -> confirmed`);
  ok(res, { payment_id: p.id, order_number: order.number, status: "confirmed" });
});

router.post("/payments/:id/reject", (req, res) => {
  const { note } = req.body || {};
  const p = get("SELECT * FROM payments WHERE id = ?", req.params.id);
  if (!p) return bad(res, "not_found", 404);
  if (!["pending", "proof_submitted", "under_review"].includes(p.status)) return bad(res, "bad_transition");
  const order = get("SELECT * FROM orders WHERE id = ?", p.order_id);
  if (!order) return bad(res, "not_found", 404);
  tx(() => {
    run("UPDATE payments SET status = 'failed', reviewed_by = ?, reviewed_at = ?, note = ? WHERE id = ?",
      req.user.id, Date.now(), String(note || ""), p.id);
    run("UPDATE orders SET status = 'pending_payment', payment_status = 'pending', updated_at = ? WHERE id = ?",
      Date.now(), order.id);
    maybeEmail(order, "payment_rejected", { name: order.name, number: order.number, note: note || "" });
  });
  audit(req.user.id, "payment_reject", "payment", p.id, `order ${order.number}${note ? " | " + note : ""}`);
  ok(res, { payment_id: p.id, order_number: order.number, status: "pending_payment" });
});

/* ---------- products ---------- */
function uniqueProductSlug(base, excludeId) {
  let slug = slugify(base) || "product";
  let n = 0, s = slug;
  for (;;) {
    const row = excludeId
      ? get("SELECT id FROM products WHERE slug = ? AND id != ?", s, excludeId)
      : get("SELECT id FROM products WHERE slug = ?", s);
    if (!row) return s;
    n += 1; s = `${slug}-${n}`;
  }
}

function productFromBody(b, isNew) {
  const p = {};
  const strFields = ["type", "gender", "concentration", "family", "perfumer", "description",
    "description_my", "origin", "authenticity", "authenticity_my", "status"];
  for (const f of strFields) if (b[f] !== undefined) p[f] = String(b[f]);
  const arrFields = ["top_notes", "mid_notes", "base_notes", "accords", "seasons", "occasions"];
  for (const f of arrFields) if (b[f] !== undefined) p[f] = strArr(b[f]);
  if (b.name !== undefined) p.name = String(b.name).trim();
  if (b.brand_id !== undefined) p.brand_id = intOrNull(b.brand_id);
  if (b.release_year !== undefined) p.release_year = intOrNull(b.release_year);
  if (b.longevity !== undefined) p.longevity = num(b.longevity, 3);
  if (b.sillage !== undefined) p.sillage = num(b.sillage, 3);
  if (b.art_seed !== undefined) p.art_seed = parseInt(b.art_seed, 10) || 0;
  for (const f of ["featured", "is_new", "bestseller"]) if (b[f] !== undefined) p[f] = b[f] ? 1 : 0;
  if (isNew) {
    if (!p.name) return { error: "validation" };
    if (!p.brand_id || !get("SELECT id FROM brands WHERE id = ?", p.brand_id)) return { error: "validation" };
  }
  if (p.status && !["active", "draft", "archived"].includes(p.status)) return { error: "validation" };
  if (p.type && !["decant", "sample", "travel", "full_bottle"].includes(p.type)) return { error: "validation" };
  if (p.gender && !["men", "women", "unisex"].includes(p.gender)) return { error: "validation" };
  if (p.longevity !== undefined && (p.longevity < 1 || p.longevity > 5)) return { error: "validation" };
  if (p.sillage !== undefined && (p.sillage < 1 || p.sillage > 5)) return { error: "validation" };
  return { data: p };
}

router.get("/products", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    if (!["active", "draft", "archived"].includes(req.query.status)) return bad(res, "validation");
    where.push("p.status = ?"); params.push(req.query.status);
  }
  if (req.query.q) {
    where.push("(p.name LIKE ? OR p.slug LIKE ? OR b.name LIKE ?)");
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  const base = `SELECT p.*, b.name AS brand_name, b.slug AS brand_slug
    FROM products p JOIN brands b ON b.id = p.brand_id` +
    (where.length ? " WHERE " + where.join(" AND ") : "");
  const page = paged(req, base, params, "p.id", "id");
  page.items = page.items.map((p) => ({
    ...p,
    top_notes: parseJsonArray(p.top_notes), mid_notes: parseJsonArray(p.mid_notes),
    base_notes: parseJsonArray(p.base_notes), accords: parseJsonArray(p.accords),
    seasons: parseJsonArray(p.seasons), occasions: parseJsonArray(p.occasions),
  }));
  ok(res, page);
});

router.post("/products", (req, res) => {
  const b = req.body || {};
  const { data: p, error } = productFromBody(b, true);
  if (error) return bad(res, error);
  let slug;
  if (b.slug) {
    slug = slugify(b.slug);
    if (get("SELECT id FROM products WHERE slug = ?", slug)) return bad(res, "validation", 400, { fieldErrors: { slug: "taken" } });
  } else {
    slug = uniqueProductSlug(p.name);
  }
  const r = run(
    `INSERT INTO products (brand_id, name, slug, type, gender, concentration, family,
      top_notes, mid_notes, base_notes, accords, release_year, perfumer, description, description_my,
      seasons, occasions, longevity, sillage, origin, art_seed, authenticity, authenticity_my,
      status, featured, is_new, bestseller, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    p.brand_id, p.name, slug, p.type || "decant", p.gender || "unisex",
    p.concentration || "Eau de Parfum", p.family || "",
    p.top_notes || "[]", p.mid_notes || "[]", p.base_notes || "[]", p.accords || "[]",
    p.release_year ?? null, p.perfumer || "", p.description || "", p.description_my || "",
    p.seasons || "[]", p.occasions || "[]", p.longevity ?? 3, p.sillage ?? 3,
    p.origin || "", p.art_seed ?? 0, p.authenticity || "", p.authenticity_my || "",
    p.status || "active", p.featured || 0, p.is_new || 0, p.bestseller || 0, Date.now());
  const id = r.lastInsertRowid;
  audit(req.user.id, "product_create", "product", id, `${p.name} (${slug})`);
  ok(res, { id, slug });
});

router.patch("/products/:id", (req, res) => {
  const prod = get("SELECT * FROM products WHERE id = ?", req.params.id);
  if (!prod) return bad(res, "not_found", 404);
  const b = req.body || {};
  const { data: p, error } = productFromBody(b, false);
  if (error) return bad(res, error);
  if (b.slug !== undefined) {
    const slug = slugify(b.slug) || prod.slug;
    if (get("SELECT id FROM products WHERE slug = ? AND id != ?", slug, prod.id)) {
      return bad(res, "validation", 400, { fieldErrors: { slug: "taken" } });
    }
    p.slug = slug;
  }
  if (!Object.keys(p).length) return bad(res, "validation");
  run(`UPDATE products SET ${Object.keys(p).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(p), prod.id);
  audit(req.user.id, "product_update", "product", prod.id, Object.keys(p).join(","));
  ok(res, { id: prod.id, updated: Object.keys(p) });
});

router.delete("/products/:id", (req, res) => {
  const prod = get("SELECT * FROM products WHERE id = ?", req.params.id);
  if (!prod) return bad(res, "not_found", 404);
  // Never hard delete; archive so past orders keep their snapshots.
  run("UPDATE products SET status = 'archived' WHERE id = ?", prod.id);
  audit(req.user.id, "product_archive", "product", prod.id, prod.name);
  ok(res, { id: prod.id, status: "archived" });
});

/* ---------- variants ---------- */
router.get("/products/:id/variants", (req, res) => {
  const prod = get("SELECT id FROM products WHERE id = ?", req.params.id);
  if (!prod) return bad(res, "not_found", 404);
  ok(res, { variants: all("SELECT * FROM variants WHERE product_id = ? ORDER BY sort, id", prod.id) });
});

function variantFromBody(b, isNew) {
  const v = {};
  if (b.name !== undefined) v.name = String(b.name).trim();
  if (b.size_ml !== undefined) v.size_ml = num(b.size_ml);
  if (b.sku !== undefined) v.sku = String(b.sku).trim();
  if (b.price !== undefined) v.price = Math.round(num(b.price));
  if (b.compare_at !== undefined) v.compare_at = b.compare_at === null || b.compare_at === "" ? null : Math.round(num(b.compare_at));
  if (b.atomizer !== undefined) v.atomizer = String(b.atomizer);
  if (b.stock_qty !== undefined) v.stock_qty = Math.max(0, Math.round(num(b.stock_qty)));
  if (b.low_threshold !== undefined) v.low_threshold = Math.max(0, Math.round(num(b.low_threshold)));
  if (b.active !== undefined) v.active = b.active ? 1 : 0;
  if (b.sort !== undefined) v.sort = Math.round(num(b.sort));
  if (isNew) {
    if (!v.name || !v.sku || !(v.size_ml > 0) || v.price === undefined || v.price < 0) return { error: "validation" };
  }
  if (v.size_ml !== undefined && !(v.size_ml > 0)) return { error: "validation" };
  if (v.price !== undefined && v.price < 0) return { error: "validation" };
  return { data: v };
}

router.post("/products/:id/variants", (req, res) => {
  const prod = get("SELECT id FROM products WHERE id = ?", req.params.id);
  if (!prod) return bad(res, "not_found", 404);
  const b = req.body || {};
  const { data: v, error } = variantFromBody(b, true);
  if (error) return bad(res, error);
  if (get("SELECT id FROM variants WHERE sku = ?", v.sku)) {
    return bad(res, "validation", 400, { fieldErrors: { sku: "taken" } });
  }
  const r = run(
    `INSERT INTO variants (product_id, name, size_ml, sku, price, compare_at, atomizer, stock_qty, low_threshold, active, sort)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    prod.id, v.name, v.size_ml, v.sku, v.price, v.compare_at ?? null,
    v.atomizer || "Glass atomizer", v.stock_qty ?? 0, v.low_threshold ?? 3, v.active ?? 1, v.sort ?? 0);
  const id = r.lastInsertRowid;
  audit(req.user.id, "variant_create", "variant", id, `${prod.id}:${v.sku}`);
  ok(res, { id });
});

router.patch("/variants/:vid", (req, res) => {
  const v0 = get("SELECT * FROM variants WHERE id = ?", req.params.vid);
  if (!v0) return bad(res, "not_found", 404);
  const b = req.body || {};
  const { data: v, error } = variantFromBody(b, false);
  if (error) return bad(res, error);
  if (v.sku && get("SELECT id FROM variants WHERE sku = ? AND id != ?", v.sku, v0.id)) {
    return bad(res, "validation", 400, { fieldErrors: { sku: "taken" } });
  }
  if (!Object.keys(v).length) return bad(res, "validation");
  run(`UPDATE variants SET ${Object.keys(v).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(v), v0.id);
  audit(req.user.id, "variant_update", "variant", v0.id, Object.keys(v).join(","));
  ok(res, { id: v0.id, updated: Object.keys(v) });
});

router.delete("/variants/:vid", (req, res) => {
  const v = get("SELECT * FROM variants WHERE id = ?", req.params.vid);
  if (!v) return bad(res, "not_found", 404);
  const ref = get("SELECT id FROM order_items WHERE variant_id = ? LIMIT 1", v.id);
  if (ref) {
    run("UPDATE variants SET active = 0 WHERE id = ?", v.id);
    audit(req.user.id, "variant_deactivate", "variant", v.id, "referenced by order_items");
    ok(res, { id: v.id, active: 0, deactivated: true });
  } else {
    run("DELETE FROM variants WHERE id = ?", v.id);
    audit(req.user.id, "variant_delete", "variant", v.id, v.sku);
    ok(res, { id: v.id, deleted: true });
  }
});

/* ---------- brands ---------- */
router.get("/brands", (req, res) => {
  ok(res, { brands: all("SELECT * FROM brands ORDER BY sort, name") });
});

router.post("/brands", (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  if (!name) return bad(res, "validation", 400, { fieldErrors: { name: "required" } });
  const slug = b.slug ? slugify(b.slug) : slugify(name);
  if (!slug) return bad(res, "validation", 400, { fieldErrors: { slug: "invalid" } });
  if (get("SELECT id FROM brands WHERE slug = ? OR name = ?", slug, name)) {
    return bad(res, "validation", 400, { fieldErrors: { slug: "taken" } });
  }
  const r = run(
    "INSERT INTO brands (name, slug, description, description_my, active, sort) VALUES (?,?,?,?,?,?)",
    name, slug, b.description || "", b.description_my || "",
    b.active === undefined ? 1 : (b.active ? 1 : 0), Math.round(num(b.sort)));
  const id = r.lastInsertRowid;
  audit(req.user.id, "brand_create", "brand", id, name);
  ok(res, { id, slug });
});

router.patch("/brands/:id", (req, res) => {
  const br = get("SELECT * FROM brands WHERE id = ?", req.params.id);
  if (!br) return bad(res, "not_found", 404);
  const b = req.body || {};
  const upd = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return bad(res, "validation", 400, { fieldErrors: { name: "required" } });
    if (get("SELECT id FROM brands WHERE name = ? AND id != ?", name, br.id)) {
      return bad(res, "validation", 400, { fieldErrors: { name: "taken" } });
    }
    upd.name = name;
  }
  if (b.slug !== undefined) {
    const slug = slugify(b.slug);
    if (!slug || get("SELECT id FROM brands WHERE slug = ? AND id != ?", slug, br.id)) {
      return bad(res, "validation", 400, { fieldErrors: { slug: "taken" } });
    }
    upd.slug = slug;
  }
  if (b.description !== undefined) upd.description = String(b.description);
  if (b.description_my !== undefined) upd.description_my = String(b.description_my);
  if (b.active !== undefined) upd.active = b.active ? 1 : 0;
  if (b.sort !== undefined) upd.sort = Math.round(num(b.sort));
  if (!Object.keys(upd).length) return bad(res, "validation");
  run(`UPDATE brands SET ${Object.keys(upd).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(upd), br.id);
  audit(req.user.id, "brand_update", "brand", br.id, Object.keys(upd).join(","));
  ok(res, { id: br.id, updated: Object.keys(upd) });
});

router.delete("/brands/:id", (req, res) => {
  const br = get("SELECT * FROM brands WHERE id = ?", req.params.id);
  if (!br) return bad(res, "not_found", 404);
  if (get("SELECT id FROM products WHERE brand_id = ? LIMIT 1", br.id)) {
    return bad(res, "brand_has_products", 409);
  }
  run("DELETE FROM brands WHERE id = ?", br.id);
  audit(req.user.id, "brand_delete", "brand", br.id, br.name);
  ok(res, { id: br.id, deleted: true });
});

/* ---------- inventory ---------- */
router.get("/bottles", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.product_id) { where.push("b.product_id = ?"); params.push(parseInt(req.query.product_id, 10)); }
  const base = `SELECT b.*, p.name AS product_name
    FROM source_bottles b JOIN products p ON p.id = b.product_id` +
    (where.length ? " WHERE " + where.join(" AND ") : "");
  ok(res, paged(req, base, params, "b.id", "id"));
});

router.post("/bottles", (req, res) => {
  const b = req.body || {};
  const product_id = parseInt(b.product_id, 10);
  if (!product_id || !get("SELECT id FROM products WHERE id = ?", product_id)) {
    return bad(res, "validation", 400, { fieldErrors: { product_id: "invalid" } });
  }
  const ref = String(b.ref || "").trim();
  const original_ml = num(b.original_ml);
  const current_ml = b.current_ml === undefined ? original_ml : num(b.current_ml);
  if (!ref || !(original_ml > 0) || !(current_ml >= 0) || current_ml > original_ml) {
    return bad(res, "validation", 400, { fieldErrors: { ref: "required", original_ml: "must be > 0" } });
  }
  if (get("SELECT id FROM source_bottles WHERE ref = ?", ref)) {
    return bad(res, "validation", 400, { fieldErrors: { ref: "taken" } });
  }
  let id;
  try {
    id = addBottle({
      product_id, ref, original_ml, current_ml,
      batch: String(b.batch || ""), supplier: String(b.supplier || ""),
      cost_mmk: Math.round(num(b.cost_mmk)),
      purchased_at: b.purchased_at ? intOrNull(b.purchased_at) || Date.now() : Date.now(),
      notes: String(b.notes || ""),
    }, req.user.id);
  } catch (e) {
    return bad(res, "validation");
  }
  audit(req.user.id, "bottle_create", "bottle", id, `${ref} ${current_ml}ml`);
  ok(res, { id, ref });
});

router.patch("/bottles/:id", (req, res) => {
  const b = req.body || {};
  const current_ml = num(b.current_ml, NaN);
  if (!Number.isFinite(current_ml) || current_ml < 0) {
    return bad(res, "validation", 400, { fieldErrors: { current_ml: "must be a number >= 0" } });
  }
  try {
    const { delta, balance } = adjustBottle(parseInt(req.params.id, 10), current_ml, req.user.id, String(b.note || ""));
    audit(req.user.id, "bottle_adjust", "bottle", req.params.id, `delta ${delta}ml${b.note ? " | " + b.note : ""}`);
    ok(res, { id: parseInt(req.params.id, 10), current_ml, delta, balance_ml: balance });
  } catch (e) {
    if (String(e.message) === "bottle_not_found") return bad(res, "not_found", 404);
    throw e;
  }
});

router.get("/movements", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.bottle_id) { where.push("m.bottle_id = ?"); params.push(parseInt(req.query.bottle_id, 10)); }
  if (req.query.order_id) { where.push("m.order_id = ?"); params.push(parseInt(req.query.order_id, 10)); }
  const base = `SELECT m.*, sb.ref AS bottle_ref, p.name AS product_name
    FROM inventory_movements m
    JOIN source_bottles sb ON sb.id = m.bottle_id
    JOIN products p ON p.id = sb.product_id` +
    (where.length ? " WHERE " + where.join(" AND ") : "");
  ok(res, paged(req, base, params, "m.id", "id"));
});

/* ---------- customers ---------- */
const CUSTOMER_COLS = "id, name, email, phone, role, lang, created_at";

router.get("/customers", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.q) {
    where.push("(name LIKE ? OR email LIKE ? OR phone LIKE ?)");
    const q = `%${req.query.q}%`;
    params.push(q, q, q);
  }
  const base = `SELECT ${CUSTOMER_COLS} FROM users` + (where.length ? " WHERE " + where.join(" AND ") : "");
  ok(res, paged(req, base, params, "id", "id"));
});

router.patch("/customers/:id", (req, res) => {
  const u = get(`SELECT ${CUSTOMER_COLS} FROM users WHERE id = ?`, req.params.id);
  if (!u) return bad(res, "not_found", 404);
  const b = req.body || {};
  const upd = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return bad(res, "validation", 400, { fieldErrors: { name: "required" } });
    upd.name = name;
  }
  if (b.phone !== undefined) {
    const phone = String(b.phone).trim();
    if (phone && !validMyanmarPhone(phone)) {
      return bad(res, "validation", 400, { fieldErrors: { phone: "invalid" } });
    }
    upd.phone = phone;
  }
  if (b.role !== undefined && b.role !== u.role) {
    // role changes are admin-only
    if (req.user.role !== "admin") return bad(res, "forbidden", 403);
    if (!["customer", "staff", "admin"].includes(b.role)) return bad(res, "validation");
    if (u.role === "admin" && b.role !== "admin") {
      const otherAdmins = get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id != ?", u.id).c;
      if (otherAdmins < 1) return bad(res, "last_admin", 403);
    }
    upd.role = b.role;
  }
  if (!Object.keys(upd).length) return bad(res, "validation");
  run(`UPDATE users SET ${Object.keys(upd).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(upd), u.id);
  audit(req.user.id, "customer_update", "user", u.id, Object.keys(upd).join(","));
  ok(res, { id: u.id, updated: Object.keys(upd) });
});

/* ---------- staff (requireAdmin) ---------- */
const STAFF_COLS = "id, name, email, phone, role, lang, created_at";

router.get("/staff", requireAdmin, (req, res) => {
  ok(res, { staff: all(`SELECT ${STAFF_COLS} FROM users WHERE role IN ('staff','admin') ORDER BY id`) });
});

router.post("/staff", requireAdmin, (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim();
  const phone = String(b.phone || "").trim();
  const password = b.password;
  const role = b.role || "staff";
  const fieldErrors = {};
  if (!name) fieldErrors.name = "required";
  if (!validEmail(email)) fieldErrors.email = "invalid";
  if (phone && !validMyanmarPhone(phone)) fieldErrors.phone = "invalid";
  if (!validPassword(password)) fieldErrors.password = "min 6 chars";
  if (!["staff", "admin"].includes(role)) fieldErrors.role = "invalid";
  if (Object.keys(fieldErrors).length) return bad(res, "validation", 400, { fieldErrors });
  if (get("SELECT id FROM users WHERE email = ?", email.toLowerCase())) {
    return bad(res, "validation", 400, { fieldErrors: { email: "taken" } });
  }
  const id = createUser({ name, email, phone, password, role, lang: "my" });
  audit(req.user.id, "staff_create", "user", id, `${name} <${email}> (${role})`);
  ok(res, { user: publicUser(get(`SELECT ${STAFF_COLS}, email_verified FROM users WHERE id = ?`, id)) });
});

router.patch("/staff/:id", requireAdmin, (req, res) => {
  const u = get(`SELECT ${STAFF_COLS} FROM users WHERE id = ?`, req.params.id);
  if (!u || !["staff", "admin"].includes(u.role)) return bad(res, "not_found", 404);
  const b = req.body || {};
  const upd = {};
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) return bad(res, "validation", 400, { fieldErrors: { name: "required" } });
    upd.name = name;
  }
  if (b.phone !== undefined) {
    const phone = String(b.phone).trim();
    if (phone && !validMyanmarPhone(phone)) {
      return bad(res, "validation", 400, { fieldErrors: { phone: "invalid" } });
    }
    upd.phone = phone;
  }
  if (b.password !== undefined) {
    if (!validPassword(b.password)) {
      return bad(res, "validation", 400, { fieldErrors: { password: "min 6 chars" } });
    }
    const salt = newSalt();
    upd.salt = salt;
    upd.pw_hash = hashPassword(b.password, salt);
  }
  if (b.role !== undefined && b.role !== u.role) {
    if (!["staff", "admin"].includes(b.role)) return bad(res, "validation");
    if (u.id === req.user.id) return bad(res, "cannot_change_own_role", 403);
    if (u.role === "admin" && b.role !== "admin") {
      const otherAdmins = get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND id != ?", u.id).c;
      if (otherAdmins < 1) return bad(res, "last_admin", 403);
    }
    upd.role = b.role;
  }
  if (!Object.keys(upd).length) return bad(res, "validation");
  const cols = Object.keys(upd).filter((k) => k !== "pw_hash" && k !== "salt");
  run(`UPDATE users SET ${Object.keys(upd).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(upd), u.id);
  audit(req.user.id, "staff_update", "user", u.id, cols.join(","));
  ok(res, { id: u.id, updated: cols });
});

router.delete("/staff/:id", requireAdmin, (req, res) => {
  const u = get("SELECT id, name, role FROM users WHERE id = ?", req.params.id);
  if (!u || !["staff", "admin"].includes(u.role)) return bad(res, "not_found", 404);
  if (u.id === req.user.id) return bad(res, "cannot_delete_self", 403);
  if (u.role === "admin") {
    const adminCount = get("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").c;
    if (adminCount <= 1) return bad(res, "last_admin", 403);
  }
  run("DELETE FROM users WHERE id = ?", u.id);
  audit(req.user.id, "staff_delete", "user", u.id, `${u.name} (${u.role})`);
  ok(res, { id: u.id, deleted: true });
});

/* ---------- reviews ---------- */
function recomputeRating(productId) {
  const r = get(
    "SELECT COUNT(*) AS c, COALESCE(AVG(rating),0) AS a FROM reviews WHERE product_id = ? AND status = 'published'",
    productId);
  run("UPDATE products SET rating_count = ?, rating_avg = ? WHERE id = ?", r.c, r.a, productId);
  return { rating_count: r.c, rating_avg: r.a };
}

router.get("/reviews", (req, res) => {
  const where = [];
  const params = [];
  if (req.query.status) {
    if (!["pending", "published", "rejected"].includes(req.query.status)) return bad(res, "validation");
    where.push("r.status = ?"); params.push(req.query.status);
  }
  const base = `SELECT r.*, p.name AS product_name, u.name AS user_name
    FROM reviews r
    JOIN products p ON p.id = r.product_id
    JOIN users u ON u.id = r.user_id` +
    (where.length ? " WHERE " + where.join(" AND ") : "");
  ok(res, paged(req, base, params, "r.id", "id"));
});

router.patch("/reviews/:id", (req, res) => {
  const r0 = get("SELECT * FROM reviews WHERE id = ?", req.params.id);
  if (!r0) return bad(res, "not_found", 404);
  const { status } = req.body || {};
  if (!["pending", "published", "rejected"].includes(status)) return bad(res, "validation");
  let rating;
  tx(() => {
    run("UPDATE reviews SET status = ? WHERE id = ?", status, r0.id);
    rating = recomputeRating(r0.product_id);
  });
  audit(req.user.id, "review_moderate", "review", r0.id, `${r0.status} -> ${status}`);
  ok(res, { id: r0.id, status, rating });
});

/* ---------- coupons ---------- */
const COUPON_TYPES = ["percent", "fixed", "free_delivery"];

function couponFromBody(b, isNew) {
  const c = {};
  if (b.code !== undefined) c.code = String(b.code).trim().toUpperCase();
  if (b.type !== undefined) c.type = String(b.type);
  if (b.value !== undefined) c.value = Math.round(num(b.value));
  if (b.min_order !== undefined) c.min_order = Math.round(num(b.min_order));
  if (b.max_uses !== undefined) c.max_uses = b.max_uses === null || b.max_uses === "" ? null : Math.max(1, Math.round(num(b.max_uses)));
  if (b.starts_at !== undefined) c.starts_at = intOrNull(b.starts_at);
  if (b.ends_at !== undefined) c.ends_at = intOrNull(b.ends_at);
  if (b.active !== undefined) c.active = b.active ? 1 : 0;
  if (isNew) {
    if (!c.code || !COUPON_TYPES.includes(c.type) || c.value === undefined) return { error: "validation" };
  }
  if (c.code !== undefined && !c.code) return { error: "validation" };
  if (c.type !== undefined && !COUPON_TYPES.includes(c.type)) return { error: "validation" };
  return { data: c };
}

router.get("/coupons", (req, res) => {
  ok(res, paged(req, "SELECT * FROM coupons", [], "id", "id"));
});

router.post("/coupons", (req, res) => {
  const b = req.body || {};
  const { data: c, error } = couponFromBody(b, true);
  if (error) return bad(res, error);
  if (get("SELECT id FROM coupons WHERE code = ?", c.code)) {
    return bad(res, "validation", 400, { fieldErrors: { code: "taken" } });
  }
  const r = run(
    `INSERT INTO coupons (code, type, value, min_order, max_uses, used_count, starts_at, ends_at, active, created_at)
     VALUES (?,?,?,?,?,0,?,?,?,?)`,
    c.code, c.type, c.value, c.min_order || 0, c.max_uses ?? null,
    c.starts_at ?? null, c.ends_at ?? null, c.active ?? 1, Date.now());
  const id = r.lastInsertRowid;
  audit(req.user.id, "coupon_create", "coupon", id, c.code);
  ok(res, { id, code: c.code });
});

router.patch("/coupons/:id", (req, res) => {
  const c0 = get("SELECT * FROM coupons WHERE id = ?", req.params.id);
  if (!c0) return bad(res, "not_found", 404);
  const b = req.body || {};
  const { data: c, error } = couponFromBody(b, false);
  if (error) return bad(res, error);
  if (c.code && get("SELECT id FROM coupons WHERE code = ? AND id != ?", c.code, c0.id)) {
    return bad(res, "validation", 400, { fieldErrors: { code: "taken" } });
  }
  if (!Object.keys(c).length) return bad(res, "validation");
  run(`UPDATE coupons SET ${Object.keys(c).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(c), c0.id);
  audit(req.user.id, "coupon_update", "coupon", c0.id, Object.keys(c).join(","));
  ok(res, { id: c0.id, updated: Object.keys(c) });
});

router.delete("/coupons/:id", (req, res) => {
  const c0 = get("SELECT * FROM coupons WHERE id = ?", req.params.id);
  if (!c0) return bad(res, "not_found", 404);
  run("DELETE FROM coupons WHERE id = ?", c0.id); // coupon_usage cascades
  audit(req.user.id, "coupon_delete", "coupon", c0.id, c0.code);
  ok(res, { id: c0.id, deleted: true });
});

/* ---------- delivery zones ---------- */
function zoneFromBody(b, isNew) {
  const z = {};
  if (b.name !== undefined) z.name = String(b.name).trim();
  if (b.name_my !== undefined) z.name_my = String(b.name_my);
  if (b.region !== undefined) z.region = String(b.region);
  if (b.townships !== undefined) {
    if (!Array.isArray(b.townships)) return { error: "validation" };
    z.townships = JSON.stringify(b.townships.map((t) => String(t).trim()).filter(Boolean));
  }
  if (b.fee !== undefined) z.fee = Math.max(0, Math.round(num(b.fee)));
  if (b.eta_days !== undefined) z.eta_days = String(b.eta_days);
  if (b.cod_available !== undefined) z.cod_available = b.cod_available ? 1 : 0;
  if (b.active !== undefined) z.active = b.active ? 1 : 0;
  if (b.sort !== undefined) z.sort = Math.round(num(b.sort));
  if (isNew && !z.name) return { error: "validation" };
  return { data: z };
}

router.get("/zones", (req, res) => {
  const page = paged(req, "SELECT * FROM delivery_zones", [], "id", "id");
  page.items = page.items.map((z) => ({ ...z, townships: parseJsonArray(z.townships) }));
  ok(res, page);
});

router.post("/zones", (req, res) => {
  const b = req.body || {};
  const { data: z, error } = zoneFromBody(b, true);
  if (error) return bad(res, error);
  const r = run(
    `INSERT INTO delivery_zones (name, name_my, region, townships, fee, eta_days, cod_available, active, sort)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    z.name, z.name_my || "", z.region || "", z.townships || "[]",
    z.fee ?? 0, z.eta_days || "", z.cod_available ?? 1, z.active ?? 1, z.sort ?? 0);
  const id = r.lastInsertRowid;
  audit(req.user.id, "zone_create", "zone", id, z.name);
  ok(res, { id });
});

router.patch("/zones/:id", (req, res) => {
  const z0 = get("SELECT * FROM delivery_zones WHERE id = ?", req.params.id);
  if (!z0) return bad(res, "not_found", 404);
  const b = req.body || {};
  const { data: z, error } = zoneFromBody(b, false);
  if (error) return bad(res, error);
  if (!Object.keys(z).length) return bad(res, "validation");
  run(`UPDATE delivery_zones SET ${Object.keys(z).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(z), z0.id);
  audit(req.user.id, "zone_update", "zone", z0.id, Object.keys(z).join(","));
  ok(res, { id: z0.id, updated: Object.keys(z) });
});

router.delete("/zones/:id", (req, res) => {
  const z0 = get("SELECT * FROM delivery_zones WHERE id = ?", req.params.id);
  if (!z0) return bad(res, "not_found", 404);
  run("DELETE FROM delivery_zones WHERE id = ?", z0.id); // orders.zone_id -> SET NULL
  audit(req.user.id, "zone_delete", "zone", z0.id, z0.name);
  ok(res, { id: z0.id, deleted: true });
});

/* ---------- banners ---------- */
const BANNER_FIELDS = ["title", "title_my", "subtitle", "subtitle_my", "cta_text", "cta_text_my",
  "link", "gradient", "active", "sort"];

router.get("/banners", (req, res) => {
  ok(res, { banners: all("SELECT * FROM banners ORDER BY sort, id") });
});

router.post("/banners", (req, res) => {
  const b = req.body || {};
  const title = String(b.title || "").trim();
  if (!title) return bad(res, "validation", 400, { fieldErrors: { title: "required" } });
  const r = run(
    `INSERT INTO banners (title, title_my, subtitle, subtitle_my, cta_text, cta_text_my, link, gradient, active, sort)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    title, b.title_my || "", b.subtitle || "", b.subtitle_my || "",
    b.cta_text || "", b.cta_text_my || "", b.link || "", b.gradient || "peach",
    b.active === undefined ? 1 : (b.active ? 1 : 0), Math.round(num(b.sort)));
  const id = r.lastInsertRowid;
  audit(req.user.id, "banner_create", "banner", id, title);
  ok(res, { id });
});

router.patch("/banners/:id", (req, res) => {
  const bn = get("SELECT * FROM banners WHERE id = ?", req.params.id);
  if (!bn) return bad(res, "not_found", 404);
  const b = req.body || {};
  const upd = {};
  for (const f of BANNER_FIELDS) {
    if (b[f] === undefined) continue;
    if (f === "active") upd[f] = b[f] ? 1 : 0;
    else if (f === "sort") upd[f] = Math.round(num(b[f]));
    else upd[f] = String(b[f]);
  }
  if (upd.title !== undefined && !upd.title.trim()) {
    return bad(res, "validation", 400, { fieldErrors: { title: "required" } });
  }
  if (!Object.keys(upd).length) return bad(res, "validation");
  run(`UPDATE banners SET ${Object.keys(upd).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`,
    ...Object.values(upd), bn.id);
  audit(req.user.id, "banner_update", "banner", bn.id, Object.keys(upd).join(","));
  ok(res, { id: bn.id, updated: Object.keys(upd) });
});

router.delete("/banners/:id", (req, res) => {
  const bn = get("SELECT * FROM banners WHERE id = ?", req.params.id);
  if (!bn) return bad(res, "not_found", 404);
  run("DELETE FROM banners WHERE id = ?", bn.id);
  audit(req.user.id, "banner_delete", "banner", bn.id, bn.title);
  ok(res, { id: bn.id, deleted: true });
});

/* ---------- content ---------- */
router.put("/content/:key", (req, res) => {
  const b = req.body || {};
  const upd = {};
  for (const f of ["title", "body_en", "body_my"]) {
    if (b[f] !== undefined) upd[f] = String(b[f]);
  }
  if (!Object.keys(upd).length) return bad(res, "validation");
  const ex = get("SELECT key FROM content WHERE key = ?", req.params.key);
  if (ex) {
    run(`UPDATE content SET ${Object.keys(upd).map((k) => `${k} = ?`).join(", ")} WHERE key = ?`,
      ...Object.values(upd), req.params.key);
  } else {
    run("INSERT INTO content (key, title, body_en, body_my) VALUES (?,?,?,?)",
      req.params.key, upd.title || "", upd.body_en || "", upd.body_my || "");
  }
  audit(req.user.id, "content_update", "content", req.params.key, Object.keys(upd).join(","));
  ok(res, { key: req.params.key, updated: Object.keys(upd) });
});

/* ---------- settings (requireAdmin) ---------- */
const SETTING_WHITELIST = ["shop_name", "free_delivery_threshold", "pay_kbzpay", "pay_wavepay",
  "pay_ayapay", "pay_bank", "contact_phone", "promo_notice", "promo_notice_my"];

router.get("/settings", requireAdmin, (req, res) => {
  const rows = all("SELECT key, value FROM settings");
  ok(res, { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

router.put("/settings", requireAdmin, (req, res) => {
  const b = req.body || {};
  const keys = Object.keys(b);
  if (!keys.length) return bad(res, "validation");
  const badKeys = keys.filter((k) => !SETTING_WHITELIST.includes(k));
  if (badKeys.length) {
    return bad(res, "validation", 400, { fieldErrors: Object.fromEntries(badKeys.map((k) => [k, "not allowed"])) });
  }
  for (const k of keys) {
    if (k === "free_delivery_threshold" && b[k] !== "" && !Number.isFinite(Number(b[k]))) {
      return bad(res, "validation", 400, { fieldErrors: { free_delivery_threshold: "must be numeric" } });
    }
    setSetting(k, b[k]);
  }
  audit(req.user.id, "settings_update", "settings", "", keys.join(","));
  ok(res, { updated: keys });
});

/* ---------- email outbox ---------- */
router.get("/outbox", (req, res) => {
  ok(res, paged(req, "SELECT * FROM email_outbox", [], "id", "id"));
});

router.post("/outbox/:id/resend", (req, res) => {
  const m = get("SELECT * FROM email_outbox WHERE id = ?", req.params.id);
  if (!m) return bad(res, "not_found", 404);
  console.log(`[email:resend:${m.template}] to=${m.to_email} subject=${m.subject}\n${m.body}`);
  run("UPDATE email_outbox SET sent_at = ? WHERE id = ?", Date.now(), m.id);
  audit(req.user.id, "email_resend", "email_outbox", m.id, `${m.template} -> ${m.to_email}`);
  ok(res, { id: m.id, resent: true });
});

/* ---------- audit log (requireAdmin) ---------- */
router.get("/audit", requireAdmin, (req, res) => {
  const base = `SELECT a.*, u.name AS actor_name, u.email AS actor_email
    FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id`;
  ok(res, paged(req, base, [], "a.id", "id"));
});

module.exports = router;
