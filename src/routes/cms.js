"use strict";
/* Public CMS endpoints: banners, content pages, whitelisted public settings. */
const express = require("express");
const { get, all, setting } = require("../db");

const router = express.Router();

const PUBLIC_SETTINGS = [
  "shop_name",
  "promo_notice",
  "promo_notice_my",
  "contact_phone",
  "free_delivery_threshold",
];

/* ---------- GET /api/banners ---------- */
router.get("/banners", (req, res) => {
  const rows = all("SELECT * FROM banners WHERE active = 1 ORDER BY sort ASC, id ASC");
  return res.json({
    ok: true,
    data: rows.map((b) => ({
      id: b.id,
      title: b.title, title_my: b.title_my,
      subtitle: b.subtitle, subtitle_my: b.subtitle_my,
      cta_text: b.cta_text, cta_text_my: b.cta_text_my,
      link: b.link, gradient: b.gradient,
    })),
  });
});

/* ---------- GET /api/zones — public active delivery zones ---------- */
router.get("/zones", (req, res) => {
  const { parseJsonArray } = require("../util");
  const rows = all(
    "SELECT id, name, name_my, region, townships, fee, eta_days, cod_available FROM delivery_zones WHERE active = 1 ORDER BY sort ASC, id ASC"
  );
  return res.json({
    ok: true,
    data: {
      zones: rows.map((z) => ({
        id: z.id,
        name: z.name,
        name_my: z.name_my,
        region: z.region,
        townships: parseJsonArray(z.townships),
        fee: z.fee,
        eta_days: z.eta_days,
        cod_available: z.cod_available === 1,
      })),
    },
  });
});

/* ---------- GET /api/content/:key ---------- */
router.get("/content/:key", (req, res) => {
  const key = String(req.params.key || "").trim();
  const row = get("SELECT key, title, body_en, body_my FROM content WHERE key = ?", key);
  if (!row) return res.status(404).json({ ok: false, error: "not_found" });
  return res.json({ ok: true, data: row });
});

/* ---------- GET /api/settings/public ---------- */
router.get("/settings/public", (req, res) => {
  const data = {};
  for (const k of PUBLIC_SETTINGS) {
    data[k] = setting(k, "");
  }
  // free_delivery_threshold is a money amount — return it as a number.
  data.free_delivery_threshold = Number(data.free_delivery_threshold) || 0;
  return res.json({ ok: true, data });
});

module.exports = router;
