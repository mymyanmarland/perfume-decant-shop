"use strict";
/* Customer delivery addresses — own addresses only, all behind requireAuth. */
const express = require("express");
const { get, all, run } = require("../db");
const { requireAuth } = require("../auth");
const { validMyanmarPhone, normalizePhone } = require("../util");

const router = express.Router();
router.use(requireAuth);

function getOwn(id, userId) {
  return get("SELECT * FROM addresses WHERE id = ? AND user_id = ?", id, userId);
}
function publicAddress(a) {
  if (!a) return null;
  return {
    id: a.id, label: a.label, name: a.name, phone: a.phone,
    region: a.region, city: a.city, township: a.township,
    address_line: a.address_line, notes: a.notes,
    is_default: !!a.is_default, created_at: a.created_at,
  };
}
function unsetOthers(userId) {
  run("UPDATE addresses SET is_default = 0 WHERE user_id = ?", userId);
}
function countOwn(userId) {
  return get("SELECT COUNT(*) AS c FROM addresses WHERE user_id = ?", userId).c;
}

/* ---------- GET /api/addresses ---------- */
router.get("/", (req, res) => {
  const rows = all(
    "SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC",
    req.user.id
  );
  return res.json({ ok: true, data: { addresses: rows.map(publicAddress) } });
});

/* ---------- POST /api/addresses ---------- */
router.post("/", (req, res) => {
  const b = req.body || {};
  const label = String(b.label || "").trim();
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim();
  const region = String(b.region || "").trim();
  const city = String(b.city || "").trim();
  const township = String(b.township || "").trim();
  const address_line = String(b.address_line || "").trim();
  const notes = String(b.notes || "").trim();
  const wantDefault = !!b.is_default;

  const fieldErrors = {};
  if (!name) fieldErrors.name = "required";
  if (!validMyanmarPhone(phone)) fieldErrors.phone = "invalid";
  if (!region) fieldErrors.region = "required";
  if (!township) fieldErrors.township = "required";
  if (!address_line) fieldErrors.address_line = "required";
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors });
  }

  const isFirst = countOwn(req.user.id) === 0;
  const is_default = wantDefault || isFirst ? 1 : 0;
  if (is_default) unsetOthers(req.user.id);

  const r = run(
    `INSERT INTO addresses (user_id, label, name, phone, region, city, township, address_line, notes, is_default, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    req.user.id, label, name, normalizePhone(phone), region, city, township, address_line, notes, is_default, Date.now()
  );
  return res.status(201).json({ ok: true, data: { address: publicAddress(getOwn(r.lastInsertRowid, req.user.id)) } });
});

/* ---------- PUT /api/addresses/:id ---------- */
router.put("/:id", (req, res) => {
  const a = getOwn(req.params.id, req.user.id);
  if (!a) return res.status(404).json({ ok: false, error: "not_found" });

  const b = req.body || {};
  const fieldErrors = {};
  const updates = [];

  if (b.label !== undefined) updates.push(["label", String(b.label).trim()]);
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
  if (b.region !== undefined) {
    const region = String(b.region).trim();
    if (!region) fieldErrors.region = "required";
    else updates.push(["region", region]);
  }
  if (b.city !== undefined) updates.push(["city", String(b.city).trim()]);
  if (b.township !== undefined) {
    const township = String(b.township).trim();
    if (!township) fieldErrors.township = "required";
    else updates.push(["township", township]);
  }
  if (b.address_line !== undefined) {
    const address_line = String(b.address_line).trim();
    if (!address_line) fieldErrors.address_line = "required";
    else updates.push(["address_line", address_line]);
  }
  if (b.notes !== undefined) updates.push(["notes", String(b.notes).trim()]);
  if (b.is_default !== undefined) {
    if (b.is_default) {
      unsetOthers(req.user.id);
      updates.push(["is_default", 1]);
    } else {
      updates.push(["is_default", 0]);
    }
  }
  if (Object.keys(fieldErrors).length) {
    return res.status(400).json({ ok: false, error: "validation", fieldErrors });
  }
  for (const [col, val] of updates) {
    run(`UPDATE addresses SET ${col} = ? WHERE id = ? AND user_id = ?`, val, a.id, req.user.id);
  }
  return res.json({ ok: true, data: { address: publicAddress(getOwn(a.id, req.user.id)) } });
});

/* ---------- DELETE /api/addresses/:id ---------- */
router.delete("/:id", (req, res) => {
  const a = getOwn(req.params.id, req.user.id);
  if (!a) return res.status(404).json({ ok: false, error: "not_found" });
  run("DELETE FROM addresses WHERE id = ? AND user_id = ?", a.id, req.user.id);
  // If the deleted one was the default, promote the oldest remaining.
  if (a.is_default) {
    const next = get(
      "SELECT id FROM addresses WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT 1",
      req.user.id
    );
    if (next) run("UPDATE addresses SET is_default = 1 WHERE id = ?", next.id);
  }
  return res.json({ ok: true, data: { ok: true } });
});

module.exports = router;
