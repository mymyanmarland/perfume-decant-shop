"use strict";
/* Auth routes: register / login / logout / me / profile / change-password /
   verify-email / forgot-password / reset-password. */
const express = require("express");
const crypto = require("crypto");
const { get, run, audit } = require("../db");
const {
  COOKIE_NAME,
  createUser, createSession, setSessionCookie, clearSessionCookie,
  destroySession, publicUser, verifyPassword, newSalt, hashPassword,
  requireAuth,
} = require("../auth");
const { mergeCarts, getGuestCart, clearGuestCart } = require("../cart");
const { sendEmail } = require("../email");
const { validEmail, validPassword, validMyanmarPhone, normalizePhone } = require("../util");

const router = express.Router();

/* ---- light in-memory rate limit: 20 req/min per IP on /api/auth/* ---- */
const RL_WINDOW = 60 * 1000;
const RL_MAX = 20;
const rlHits = new Map();
setInterval(() => { rlHits.clear(); }, RL_WINDOW).unref();
function authRateLimit(req, res, next) {
  const ip = req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
  const n = (rlHits.get(ip) || 0) + 1;
  rlHits.set(ip, n);
  if (n > RL_MAX) return res.status(429).json({ ok: false, error: "rate_limited" });
  next();
}
router.use(authRateLimit);

function baseUrl() {
  return process.env.BASE_URL || "http://localhost:3000";
}
function freshPublicUser(id) {
  const u = get("SELECT id, name, email, phone, role, lang, email_verified FROM users WHERE id = ?", id);
  return publicUser(u);
}

/* ---------- POST /api/auth/register ---------- */
router.post("/register", (req, res) => {
  const b = req.body || {};
  const name = String(b.name || "").trim();
  const email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim();
  const password = b.password;
  const lang = b.lang === "en" ? "en" : "my";

  const fieldErrors = {};
  if (!name) fieldErrors.name = "required";
  if (!validEmail(email)) fieldErrors.email = "invalid";
  if (!validMyanmarPhone(phone)) fieldErrors.phone = "invalid";
  if (!validPassword(password)) fieldErrors.password = "min_6_chars";
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors });
  }
  if (get("SELECT id FROM users WHERE email = ?", email)) {
    return res.status(409).json({ ok: false, error: "email_taken", fieldErrors: { email: "taken" } });
  }

  const verifyToken = crypto.randomBytes(32).toString("hex");
  let userId;
  try {
    userId = createUser({ name, email, phone: normalizePhone(phone), password, lang });
  } catch (e) {
    if (String(e.message || "").includes("UNIQUE")) {
      return res.status(409).json({ ok: false, error: "email_taken", fieldErrors: { email: "taken" } });
    }
    throw e;
  }
  run("UPDATE users SET verify_token = ? WHERE id = ?", verifyToken, userId);

  // auto-login
  const { token, expires_at } = createSession(userId);
  setSessionCookie(res, token, expires_at);

  // merge guest cart into server cart, drop guest cookie
  mergeCarts(userId, getGuestCart(req));
  clearGuestCart(res);

  try {
    sendEmail(email, "verify_email", {
      name,
      link: `${baseUrl()}/verify.html?token=${verifyToken}`,
    }, lang);
  } catch (e) {
    console.error("[auth] verify_email failed:", e.message);
  }

  audit(userId, "user_register", "users", userId, `registered via web (${lang})`);
  return res.status(201).json({ ok: true, data: { user: freshPublicUser(userId) } });
});

/* ---------- POST /api/auth/login ---------- */
router.post("/login", (req, res) => {
  const b = req.body || {};
  const email = String(b.email || "").trim().toLowerCase();
  const password = b.password;
  if (!validEmail(email) || typeof password !== "string" || !password) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors: { email: "invalid" } });
  }
  const u = get("SELECT * FROM users WHERE email = ? COLLATE NOCASE", email);
  if (!u || !verifyPassword(password, u.salt, u.pw_hash)) {
    return res.status(401).json({ ok: false, error: "invalid_credentials" });
  }
  const { token, expires_at } = createSession(u.id);
  setSessionCookie(res, token, expires_at);
  mergeCarts(u.id, getGuestCart(req));
  clearGuestCart(res);
  return res.json({ ok: true, data: { user: freshPublicUser(u.id) } });
});

/* ---------- POST /api/auth/logout ---------- */
router.post("/logout", (req, res) => {
  destroySession(req.cookies ? req.cookies[COOKIE_NAME] : null);
  clearSessionCookie(res);
  return res.json({ ok: true, data: { ok: true } });
});

/* ---------- GET /api/auth/me ---------- */
router.get("/me", (req, res) => {
  return res.json({ ok: true, data: { user: publicUser(req.user) } });
});

/* ---------- PUT /api/auth/profile ---------- */
router.put("/profile", requireAuth, (req, res) => {
  const b = req.body || {};
  const fieldErrors = {};
  const updates = [];

  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!name) fieldErrors.name = "required";
    else updates.push(["name", name]);
  }
  if (b.phone !== undefined) {
    const phone = String(b.phone).trim();
    if (!validMyanmarPhone(phone)) fieldErrors.phone = "invalid";
    else updates.push(["phone", normalizePhone(phone)]);
  }
  if (b.lang !== undefined) {
    if (!["en", "my"].includes(b.lang)) fieldErrors.lang = "invalid";
    else updates.push(["lang", b.lang]);
  }
  if (b.notif_order_updates !== undefined) {
    updates.push(["notif_order_updates", b.notif_order_updates ? 1 : 0]);
  }
  if (b.notif_promos !== undefined) {
    updates.push(["notif_promos", b.notif_promos ? 1 : 0]);
  }
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors });
  }
  for (const [col, val] of updates) {
    run(`UPDATE users SET ${col} = ? WHERE id = ?`, val, req.user.id);
  }
  return res.json({ ok: true, data: { user: freshPublicUser(req.user.id) } });
});

/* ---------- POST /api/auth/change-password ---------- */
router.post("/change-password", requireAuth, (req, res) => {
  const b = req.body || {};
  const current = b.current;
  const next = b.new;
  const fieldErrors = {};
  if (typeof current !== "string" || !current) fieldErrors.current = "required";
  if (!validPassword(next)) fieldErrors.new = "min_6_chars";
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors });
  }
  const u = get("SELECT pw_hash, salt FROM users WHERE id = ?", req.user.id);
  if (!u || !verifyPassword(current, u.salt, u.pw_hash)) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors: { current: "incorrect" } });
  }
  const salt = newSalt();
  run("UPDATE users SET pw_hash = ?, salt = ? WHERE id = ?", hashPassword(next, salt), salt, req.user.id);
  // invalidate other sessions, keep this one
  const myToken = req.cookies ? req.cookies[COOKIE_NAME] : null;
  run("DELETE FROM sessions WHERE user_id = ? AND token != ?", req.user.id, myToken || "");
  audit(req.user.id, "password_change", "users", req.user.id, "changed via profile");
  return res.json({ ok: true, data: { ok: true } });
});

/* ---------- GET /api/auth/verify-email ---------- */
router.get("/verify-email", (req, res) => {
  const token = String(req.query.token || "").trim();
  if (!token) return res.status(400).json({ ok: false, error: "invalid_token" });
  const u = get("SELECT id FROM users WHERE verify_token = ?", token);
  if (!u) return res.status(400).json({ ok: false, error: "invalid_token" });
  run("UPDATE users SET email_verified = 1, verify_token = NULL WHERE id = ?", u.id);
  return res.json({ ok: true, data: { ok: true } });
});

/* ---------- POST /api/auth/forgot-password ---------- */
router.post("/forgot-password", (req, res) => {
  const email = String((req.body || {}).email || "").trim().toLowerCase();
  // Always ok:true — never reveal whether the address exists.
  if (validEmail(email)) {
    const u = get("SELECT id, name, lang FROM users WHERE email = ? COLLATE NOCASE", email);
    if (u) {
      const token = crypto.randomBytes(32).toString("hex");
      const expires = Date.now() + 60 * 60 * 1000; // 1 hour
      run("UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?", token, expires, u.id);
      try {
        sendEmail(email, "password_reset", {
          name: u.name,
          link: `${baseUrl()}/reset.html?token=${token}`,
        }, u.lang || "my");
      } catch (e) {
        console.error("[auth] password_reset email failed:", e.message);
      }
    }
  }
  return res.json({ ok: true, data: { ok: true } });
});

/* ---------- POST /api/auth/reset-password ---------- */
router.post("/reset-password", (req, res) => {
  const b = req.body || {};
  const token = String(b.token || "").trim();
  const password = b.password;
  if (!token) return res.status(400).json({ ok: false, error: "invalid_token" });
  if (!validPassword(password)) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors: { password: "min_6_chars" } });
  }
  const u = get("SELECT id FROM users WHERE reset_token = ? AND reset_expires > ?", token, Date.now());
  if (!u) return res.status(400).json({ ok: false, error: "invalid_token" });
  const salt = newSalt();
  run("UPDATE users SET pw_hash = ?, salt = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?",
    hashPassword(password, salt), salt, u.id);
  run("DELETE FROM sessions WHERE user_id = ?", u.id); // force re-login everywhere
  audit(u.id, "password_reset", "users", u.id, "reset via email link");
  return res.json({ ok: true, data: { ok: true } });
});

module.exports = router;
