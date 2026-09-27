"use strict";
/* Reviews: list published reviews per product (public, keyset by id DESC),
   submit a review (auth, goes to pending moderation). */
const express = require("express");
const { get, all, run } = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, status, error, extra = {}) =>
  res.status(status).json({ ok: false, error, ...extra });

function reviewRow(r) {
  return {
    id: r.id,
    rating: r.rating,
    longevity: r.longevity,
    sillage: r.sillage,
    title: r.title,
    content: r.content,
    user_name: r.user_name,
    verified: !!r.verified,
    created_at: r.created_at,
  };
}

router.get("/products/:slug/reviews", (req, res) => {
  const p = get("SELECT id FROM products WHERE slug = ? AND status = 'active'", req.params.slug);
  if (!p) return fail(res, 404, "not_found");

  let limit = parseInt(req.query.limit, 10);
  if (!limit || limit < 1) limit = 12;
  limit = Math.min(limit, 48);
  const cursor = parseInt(req.query.cursor, 10) || null;

  const where = "r.product_id = ? AND r.status = 'published'" + (cursor ? " AND r.id < ?" : "");
  const params = cursor ? [p.id, cursor, limit + 1] : [p.id, limit + 1];
  const rows = all(
    `SELECT r.id, r.rating, r.longevity, r.sillage, r.title, r.content, r.verified, r.created_at,
            u.name AS user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE ${where} ORDER BY r.id DESC LIMIT ?`,
    ...params
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(reviewRow);
  ok(res, {
    items,
    nextCursor: hasMore && items.length ? items[items.length - 1].id : null,
    hasMore,
  });
});

router.post("/reviews", requireAuth, (req, res) => {
  const body = req.body || {};
  const productId = parseInt(body.product_id, 10);
  const rating = parseInt(body.rating, 10);
  const fieldErrors = {};

  if (!productId) fieldErrors.product_id = "required";
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) fieldErrors.rating = "must be 1-5";

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length < 10 || content.length > 2000) fieldErrors.content = "must be 10-2000 characters";

  let longevity = null;
  let sillage = null;
  if (body.longevity != null && body.longevity !== "") {
    longevity = parseInt(body.longevity, 10);
    if (![1, 2, 3, 4, 5].includes(longevity)) fieldErrors.longevity = "must be 1-5";
  }
  if (body.sillage != null && body.sillage !== "") {
    sillage = parseInt(body.sillage, 10);
    if (![1, 2, 3, 4, 5].includes(sillage)) fieldErrors.sillage = "must be 1-5";
  }
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";

  if (Object.keys(fieldErrors).length) return fail(res, 400, "validation", { fieldErrors });

  const p = get("SELECT id FROM products WHERE id = ? AND status = 'active'", productId);
  if (!p) return fail(res, 404, "not_found");

  // verified=1 only if the user has a delivered order containing this product.
  const delivered = get(
    `SELECT 1 FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE o.user_id = ? AND o.status = 'delivered' AND oi.product_id = ?
     LIMIT 1`,
    req.user.id, productId
  );
  const verified = delivered ? 1 : 0;

  const now = Date.now();
  const r = run(
    `INSERT INTO reviews (product_id, user_id, rating, longevity, sillage, title, content, status, verified, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    productId, req.user.id, rating, longevity, sillage, title, content, "pending", verified, now
  );

  ok(res, {
    review: {
      id: Number(r.lastInsertRowid),
      product_id: productId,
      user_id: req.user.id,
      rating,
      longevity,
      sillage,
      title,
      content,
      status: "pending",
      verified: !!verified,
      created_at: now,
    },
  });
});

module.exports = router;
