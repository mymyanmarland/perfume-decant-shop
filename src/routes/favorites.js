"use strict";
/* Favorites (auth required): list, toggle, remove. */
const express = require("express");
const { get, all, run } = require("../db");
const { requireAuth } = require("../auth");
const { parseJsonArray } = require("../util");

const router = express.Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, status, error, extra = {}) =>
  res.status(status).json({ ok: false, error, ...extra });

const LIST_COLS = `
  SELECT p.id, p.slug, p.name, p.concentration, p.family, p.gender,
         p.seasons, p.occasions, p.longevity, p.sillage, p.image,
         p.rating_avg, p.rating_count, p.featured, p.is_new, p.bestseller, p.art_seed,
         b.name AS brand_name, b.slug AS brand_slug,
         MIN(v.price) AS min_price, MAX(v.price) AS max_price,
         COALESCE(SUM(CASE WHEN v.stock_qty > 0 THEN 1 ELSE 0 END), 0) AS in_stock
`;
const LIST_FROM = `
  FROM products p
  JOIN brands b ON b.id = p.brand_id
  LEFT JOIN variants v ON v.product_id = p.id AND v.active = 1
`;

function summaryRow(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    brand: r.brand_name,
    brand_slug: r.brand_slug,
    concentration: r.concentration,
    family: r.family,
    gender: r.gender,
    seasons: parseJsonArray(r.seasons),
    occasions: parseJsonArray(r.occasions),
    longevity: r.longevity,
    sillage: r.sillage,
    rating_avg: r.rating_avg,
    rating_count: r.rating_count,
    featured: !!r.featured,
    is_new: !!r.is_new,
    bestseller: !!r.bestseller,
    art_seed: r.art_seed,
    image: r.image || "",
    image_url: r.image ? "/uploads/products/" + r.image : "",
    min_price: r.min_price,
    max_price: r.max_price,
    in_stock: r.in_stock > 0,
  };
}

router.get("/favorites", requireAuth, (req, res) => {
  const rows = all(
    LIST_COLS + LIST_FROM +
    " JOIN favorites f ON f.product_id = p.id" +
    " WHERE f.user_id = ? AND p.status = 'active'" +
    " GROUP BY p.id ORDER BY f.id DESC",
    req.user.id
  );
  ok(res, { items: rows.map(summaryRow) });
});

router.post("/favorites/:productId", requireAuth, (req, res) => {
  const pid = parseInt(req.params.productId, 10);
  if (!pid) return fail(res, 400, "validation", { fieldErrors: { productId: "invalid" } });

  const existing = get(
    "SELECT id FROM favorites WHERE user_id = ? AND product_id = ?",
    req.user.id, pid
  );
  if (existing) {
    run("DELETE FROM favorites WHERE id = ?", existing.id);
    return ok(res, { favorited: false });
  }
  const p = get("SELECT id FROM products WHERE id = ? AND status = 'active'", pid);
  if (!p) return fail(res, 404, "not_found");
  run(
    "INSERT INTO favorites (user_id, product_id, created_at) VALUES (?,?,?)",
    req.user.id, pid, Date.now()
  );
  ok(res, { favorited: true });
});

router.delete("/favorites/:productId", requireAuth, (req, res) => {
  const pid = parseInt(req.params.productId, 10);
  if (pid) {
    run("DELETE FROM favorites WHERE user_id = ? AND product_id = ?", req.user.id, pid);
  }
  ok(res, { favorited: false });
});

module.exports = router;
