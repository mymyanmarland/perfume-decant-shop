"use strict";
/* Hand-rolled session auth: scrypt password hashing, DB-backed sessions. */
const crypto = require("crypto");
const { get, run } = require("./db");

const SESSION_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const COOKIE_NAME = "pds_session";

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}
function newSalt() {
  return crypto.randomBytes(16).toString("hex");
}
function verifyPassword(password, salt, expectedHash) {
  const h = hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(h, "hex"), Buffer.from(expectedHash, "hex"));
}

function createUser({ name, email, phone, password, role = "customer", lang = "my" }) {
  const salt = newSalt();
  const pw_hash = hashPassword(password, salt);
  const r = run(
    "INSERT INTO users (name, email, phone, pw_hash, salt, role, lang, created_at) VALUES (?,?,?,?,?,?,?,?)",
    name, email.toLowerCase().trim(), phone || "", pw_hash, salt, role, lang, Date.now()
  );
  return r.lastInsertRowid;
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expires_at = Date.now() + SESSION_TTL;
  run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?,?,?)", token, userId, expires_at);
  return { token, expires_at };
}
function destroySession(token) {
  if (token) run("DELETE FROM sessions WHERE token = ?", token);
}
function getSessionUser(token) {
  if (!token) return null;
  const row = get(
    `SELECT u.id, u.name, u.email, u.phone, u.role, u.lang, u.email_verified
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`, token, Date.now());
  return row || null;
}
function setSessionCookie(res, token, expires_at) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, sameSite: "lax",
    expires: new Date(expires_at),
    secure: process.env.NODE_ENV === "production",
  });
}
function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME);
}

/** Attach req.user (or null). Must run before route handlers. */
function attachUser(req, res, next) {
  req.user = getSessionUser(req.cookies ? req.cookies[COOKIE_NAME] : null);
  next();
}
function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: "auth_required" });
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: "auth_required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ ok: false, error: "forbidden" });
    next();
  };
}
/** staff or admin */
const requireStaff = requireRole("staff", "admin");
/** admin only — used for user management, settings, destructive ops */
const requireAdmin = requireRole("admin");

function publicUser(u) {
  if (!u) return null;
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, lang: u.lang, email_verified: !!u.email_verified };
}

module.exports = {
  COOKIE_NAME, SESSION_TTL,
  hashPassword, newSalt, verifyPassword,
  createUser, createSession, destroySession, getSessionUser,
  setSessionCookie, clearSessionCookie,
  attachUser, requireAuth, requireRole, requireStaff, requireAdmin,
  publicUser,
};
