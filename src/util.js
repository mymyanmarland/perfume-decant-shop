"use strict";
/* Shared validation + formatting helpers. */
const { get, run, tx } = require("./db");

/** Myanmar mobile: 09XXXXXXXXX (9-11 digits starting 09), also +959 form. */
function validMyanmarPhone(p) {
  if (typeof p !== "string") return false;
  const d = p.replace(/[\s-]/g, "");
  return /^(09\d{7,9}|\+959\d{7,9})$/.test(d);
}
function normalizePhone(p) {
  const d = String(p).replace(/[\s-]/g, "");
  if (d.startsWith("+959")) return "09" + d.slice(4);
  return d;
}
function validEmail(e) {
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim());
}
function validPassword(pw) {
  return typeof pw === "string" && pw.length >= 6 && pw.length <= 128;
}
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
/** MMK amounts are integers; format like 25,000 */
function fmtMMK(n) {
  return Number(n || 0).toLocaleString("en-US");
}
function slugify(s) {
  return String(s).toLowerCase().trim()
    .replace(/['']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function parseJsonArray(s, fallback = []) {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
/** Human-readable order number: PDS-YYYYMMDD-NNNN (per-day sequence). */
function nextOrderNumber() {
  return tx(() => {
    const d = new Date();
    const ymd = d.getFullYear().toString() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
    const row = get("SELECT COUNT(*) AS c FROM orders WHERE number LIKE ?", `PDS-${ymd}-%`);
    const seq = String(row.c + 1).padStart(4, "0");
    return `PDS-${ymd}-${seq}`;
  });
}

const PAYMENT_METHODS = ["kbzpay", "wavepay", "ayapay", "bank", "cod"];
const ORDER_STATUSES = ["pending_payment","payment_verification","confirmed","preparing","packed","shipped","delivered","cancelled","refunded"];
const PAYMENT_STATUSES = ["pending","proof_submitted","under_review","paid","failed","refunded","partially_refunded"];

/** Allowed order-status transitions. */
const STATUS_FLOW = {
  pending_payment: ["payment_verification", "cancelled"],
  payment_verification: ["confirmed", "pending_payment", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [],
  refunded: [],
};
function canTransition(from, to) {
  return (STATUS_FLOW[from] || []).includes(to);
}

module.exports = {
  validMyanmarPhone, normalizePhone, validEmail, validPassword,
  esc, fmtMMK, slugify, parseJsonArray, nextOrderNumber,
  PAYMENT_METHODS, ORDER_STATUSES, PAYMENT_STATUSES, STATUS_FLOW, canTransition,
};
