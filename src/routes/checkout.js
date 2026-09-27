"use strict";
/* Checkout + payment proofs.
 *
 * Mount in server.js:
 *   app.use("/api/checkout", require("./routes/checkout"));
 *   app.use("/api/uploads", require("./routes/checkout").uploadsRouter);
 * (uploadsRouter serves GET /api/uploads/proofs/:file)
 */
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { get, run, tx, setting, audit } = require("../db");
const { requireAuth } = require("../auth");
const {
  validMyanmarPhone, validEmail, normalizePhone,
  parseJsonArray, nextOrderNumber, PAYMENT_METHODS,
} = require("../util");
const { priceCart, checkMlAvailability } = require("../pricing");
const { effectiveCart, saveCart } = require("../cart");
const { reserveForOrder } = require("../inventory");
const { sendEmail } = require("../email");

const router = express.Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, status, error, extra) =>
  res.status(status).json({ ok: false, error, ...(extra || {}) });

/* ---------------- GET /api/checkout/payment-instructions?method= ---------------- */
const PAY_INSTRUCTION_KEYS = {
  kbzpay: "pay_kbzpay",
  wavepay: "pay_wavepay",
  ayapay: "pay_ayapay",
  bank: "pay_bank",
};

router.get("/payment-instructions", (req, res) => {
  const method = String(req.query.method || "").trim().toLowerCase();
  if (method === "cod") return ok(res, { method: "cod", instruction: "" });
  const key = PAY_INSTRUCTION_KEYS[method];
  if (!key) return fail(res, 400, "invalid_method");
  return ok(res, { method, instruction: setting(key, "") });
});

/* ---------------- POST /api/checkout ---------------- */
router.post("/", (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  const email = String(b.email || "").trim();
  const region = String(b.region || "").trim();
  const city = String(b.city || "").trim();
  const township = String(b.township || "").trim();
  const addressLine = String(b.address_line || "").trim();
  const notes = String(b.notes || "").trim().slice(0, 1000);
  const paymentMethod = String(b.payment_method || "").trim().toLowerCase();
  const couponCode = String(b.coupon_code || "").trim();
  const zoneId = b.zone_id != null && b.zone_id !== "" ? parseInt(b.zone_id, 10) : null;

  // 1. Validate inputs
  const fieldErrors = {};
  if (name.length < 2) fieldErrors.name = "required";
  if (!validMyanmarPhone(phone)) fieldErrors.phone = "invalid";
  if (email && !validEmail(email)) fieldErrors.email = "invalid";
  if (!region) fieldErrors.region = "required";
  if (!township) fieldErrors.township = "required";
  if (!addressLine) fieldErrors.address_line = "required";
  if (!PAYMENT_METHODS.includes(paymentMethod)) fieldErrors.payment_method = "invalid";

  let zone = null;
  if (zoneId == null || Number.isNaN(zoneId)) {
    fieldErrors.zone_id = "required";
  } else {
    zone = get("SELECT * FROM delivery_zones WHERE id = ? AND active = 1", zoneId);
    if (!zone) {
      fieldErrors.zone_id = "invalid";
    } else {
      const townships = parseJsonArray(zone.townships);
      if (!townships.includes(township)) fieldErrors.township = "not_in_zone";
      if (paymentMethod === "cod" && !zone.cod_available) fieldErrors.payment_method = "cod_not_available";
    }
  }
  if (Object.keys(fieldErrors).length) return fail(res, 400, "validation", { fieldErrors });

  // 2. Cart must be non-empty
  const items = effectiveCart(req);
  if (!items.length) return fail(res, 400, "cart_empty");

  // 3. Server-side pricing — the ONLY source of money
  const userId = req.user ? req.user.id : null;
  const priced = priceCart(items, { couponCode, zoneId, userId });
  if (priced.errors.length) {
    return fail(res, 400, priced.errors[0].error || "pricing", { errors: priced.errors });
  }

  // 4. ml availability against source bottles
  const problems = checkMlAvailability(priced.lines);
  if (problems.length) return fail(res, 400, "insufficient_ml", { problems });

  // 5. Atomic write: order + items + payment + coupon usage (+ COD reservation)
  const isCod = paymentMethod === "cod";
  const now = Date.now();
  let placed;
  try {
    placed = tx(() => {
      const number = nextOrderNumber(); // re-entrant tx (savepoint)
      const r = run(
        `INSERT INTO orders
         (number, user_id, name, phone, email, region, city, township, address_line, notes,
          payment_method, subtotal, discount, delivery_fee, total, coupon_code, zone_id,
          status, payment_status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        number, userId, name, normalizePhone(phone), email, region, city, township, addressLine, notes,
        paymentMethod, priced.subtotal, priced.discount, priced.deliveryFee, priced.total,
        priced.coupon ? priced.coupon.code : "", zoneId,
        isCod ? "confirmed" : "pending_payment", "pending", now, now
      );
      const orderId = Number(r.lastInsertRowid);
      for (const l of priced.lines) {
        run(
          `INSERT INTO order_items
           (order_id, variant_id, product_id, product_name, variant_name, size_ml, unit_price, qty, line_total)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          orderId, l.variant_id, l.product_id, l.product_name, l.variant_name,
          l.size_ml, l.unit_price, l.qty, l.line_total
        );
      }
      run("INSERT INTO payments (order_id, method, amount, status, created_at) VALUES (?,?,?,?,?)",
        orderId, paymentMethod, priced.total, "pending", now);
      if (priced.coupon) {
        run("INSERT INTO coupon_usage (coupon_id, user_id, order_id, used_at) VALUES (?,?,?,?)",
          priced.coupon.id, userId, orderId, now);
        run("UPDATE coupons SET used_count = used_count + 1 WHERE id = ?", priced.coupon.id);
      }
      if (isCod) {
        const linesForInventory = priced.lines.map((l) => ({
          product_id: l.product_id, variant_id: l.variant_id, variant_name: l.variant_name,
          size_ml: l.size_ml, qty: l.qty,
        }));
        reserveForOrder(orderId, linesForInventory, userId); // re-entrant tx — same atomic unit
      }
      return { number, orderId, status: isCod ? "confirmed" : "pending_payment" };
    });
  } catch (e) {
    // reserveForOrder throws insufficient_ml:<product_id> if stock raced after step 4
    if (String((e && e.message) || "").startsWith("insufficient_ml:")) {
      return fail(res, 400, "insufficient_ml");
    }
    throw e;
  }

  // 6. Clear cart, notify, audit
  saveCart(req, res, []);
  const toEmail = email || (req.user ? req.user.email : "");
  if (toEmail) {
    try {
      sendEmail(toEmail, "order_confirmation",
        { name, number: placed.number, total: priced.total },
        (req.user && req.user.lang) || "my");
    } catch (e) { console.error("order_confirmation email failed:", e.message); }
  }
  audit(userId, "order_created", "order", placed.orderId, `${placed.number} total=${priced.total}`);

  return ok(res, {
    number: placed.number,
    total: priced.total,
    payment_method: paymentMethod,
    status: placed.status,
  });
});

/* ---------------- POST /api/checkout/:number/payment-proof ---------------- */
const PROOF_DIR = path.join(__dirname, "..", "..", "data", "uploads", "proofs");
fs.mkdirSync(PROOF_DIR, { recursive: true });

const PROOF_EXT = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };
const proofStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    fs.mkdirSync(PROOF_DIR, { recursive: true });
    cb(null, PROOF_DIR);
  },
  filename: (req, file, cb) => {
    const ext = PROOF_EXT[file.mimetype] || "";
    const safeNumber = String(req.params.number || "order").replace(/[^A-Za-z0-9-]/g, "");
    cb(null, `${safeNumber}-${Date.now()}${ext}`);
  },
});
const uploadProof = multer({
  storage: proofStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (PROOF_EXT[file.mimetype]) return cb(null, true);
    cb(new Error("invalid_file_type")); // jpg/jpeg/png/webp only
  },
});

function removeUpload(p) {
  try { if (p) fs.unlinkSync(p); } catch (_) { /* already gone */ }
}

router.post("/:number/payment-proof", uploadProof.single("screenshot"), (req, res) => {
  const number = String(req.params.number || "").trim();
  const cleanup = () => removeUpload(req.file && req.file.path);

  if (!req.file) return fail(res, 400, "validation", { fieldErrors: { screenshot: "required" } });
  const txnRef = String((req.body && req.body.txn_ref) || "").trim();
  if (!txnRef) { cleanup(); return fail(res, 400, "validation", { fieldErrors: { txn_ref: "required" } }); }

  const order = get("SELECT * FROM orders WHERE number = ?", number);
  const payment = order ? get("SELECT * FROM payments WHERE order_id = ?", order.id) : null;
  const staff = !!req.user && (req.user.role === "staff" || req.user.role === "admin");
  const owns = !!order && !!req.user && order.user_id != null && order.user_id === req.user.id;
  // Guests prove ownership with the order phone number (same pattern as /track).
  const guestPhone = String((req.body && req.body.phone) || "").trim();
  const guestOwns = !!order && order.user_id == null && !!guestPhone &&
    normalizePhone(order.phone) === normalizePhone(guestPhone);
  if (!order || !payment || (!owns && !guestOwns && !staff)) { cleanup(); return fail(res, 404, "not_found"); }
  if (!["pending_payment", "payment_verification"].includes(order.status) || payment.method === "cod") {
    cleanup(); return fail(res, 400, "bad_transition");
  }

  const now = Date.now();
  tx(() => {
    run("UPDATE payments SET status = 'proof_submitted', txn_ref = ?, proof_path = ? WHERE id = ?",
      txnRef.slice(0, 120), req.file.filename, payment.id);
    run("UPDATE orders SET status = 'payment_verification', updated_at = ? WHERE id = ?", now, order.id);
  });

  const toEmail = order.email || (req.user && req.user.email);
  if (toEmail) {
    try {
      sendEmail(toEmail, "payment_received",
        { name: order.name, number: order.number }, (req.user && req.user.lang) || "my");
    } catch (e) { console.error("payment_received email failed:", e.message); }
  }
  audit(req.user ? req.user.id : null, "payment_proof_submitted", "order", order.id,
    `${order.number} txn_ref=${txnRef.slice(0, 40)}`);

  return ok(res, { ok: true });
});

// multer / upload errors → JSON envelope (must sit after the routes above)
router.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    removeUpload(err && _req.file && _req.file.path);
    if (err.code === "LIMIT_FILE_SIZE") return fail(res, 400, "file_too_large");
    return fail(res, 400, "upload_failed");
  }
  if (err && err.message === "invalid_file_type") {
    return fail(res, 400, "invalid_file_type");
  }
  return next(err);
});

/* ---------------- GET /api/uploads/proofs/:file ----------------
 * Served from uploadsRouter (mount at /api/uploads). Only the order owner
 * or staff/admin may fetch a proof file. */
const uploadsRouter = express.Router();

uploadsRouter.get("/proofs/:file", requireAuth, (req, res) => {
  const file = path.basename(String(req.params.file || ""));
  if (!file || file.startsWith(".")) return fail(res, 404, "not_found");
  // escape LIKE wildcards so the lookup is an exact-filename match
  const pattern = file.replace(/[\\%_]/g, (c) => "\\" + c);
  const payment = get("SELECT order_id FROM payments WHERE proof_path LIKE ? ESCAPE '\\'", pattern);
  if (!payment) return fail(res, 404, "not_found");
  const order = get("SELECT id, user_id FROM orders WHERE id = ?", payment.order_id);
  if (!order) return fail(res, 404, "not_found");
  const staff = req.user.role === "staff" || req.user.role === "admin";
  if (!staff && order.user_id !== req.user.id) return fail(res, 404, "not_found");
  return res.sendFile(path.join(PROOF_DIR, file), (err) => {
    if (err && !res.headersSent) fail(res, 404, "not_found");
  });
});

module.exports = router;
module.exports.uploadsRouter = uploadsRouter;
module.exports.PROOF_DIR = PROOF_DIR;
