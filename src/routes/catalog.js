"use strict";
/* Public catalog: brands, filter facets, product search/list, product detail. */
const express = require("express");
const { get, all } = require("../db");
const { parseJsonArray } = require("../util");

const router = express.Router();

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, status, error, extra = {}) =>
  res.status(status).json({ ok: false, error, ...extra });

/* ---------- shared product-list building blocks ---------- */
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

/** Shape a list row into the public product summary (API.md). */
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

/* ---------- GET /api/brands ---------- */
router.get("/brands", (req, res) => {
  const brands = all(
    "SELECT id, name, slug FROM brands WHERE active = 1 ORDER BY sort ASC, name ASC"
  );
  ok(res, { brands });
});

/* ---------- GET /api/filters ---------- */
router.get("/filters", (req, res) => {
  const rows = all(
    "SELECT DISTINCT family, concentration, gender FROM products WHERE status = 'active'"
  );
  const families = [...new Set(rows.map((r) => r.family).filter(Boolean))].sort();
  const concentrations = [...new Set(rows.map((r) => r.concentration).filter(Boolean))].sort();
  const genders = [...new Set(rows.map((r) => r.gender).filter(Boolean))].sort();

  const seasonSet = new Set();
  const occasionSet = new Set();
  for (const p of all("SELECT seasons, occasions FROM products WHERE status = 'active'")) {
    for (const s of parseJsonArray(p.seasons)) if (s) seasonSet.add(String(s));
    for (const o of parseJsonArray(p.occasions)) if (o) occasionSet.add(String(o));
  }

  const bounds = get(
    `SELECT MIN(v.price) AS min, MAX(v.price) AS max
     FROM variants v JOIN products p ON p.id = v.product_id
     WHERE v.active = 1 AND p.status = 'active'`
  );
  ok(res, {
    families,
    concentrations,
    genders,
    seasons: [...seasonSet].sort(),
    occasions: [...occasionSet].sort(),
    priceBounds: { min: bounds && bounds.min != null ? bounds.min : 0, max: bounds && bounds.max != null ? bounds.max : 0 },
  });
});

/* ---------- GET /api/products ---------- */
const SORTS = ["new", "price_asc", "price_desc", "rating", "popular", "bestselling"];

function escapeLike(s) {
  return s.replace(/[\\%_]/g, (c) => "\\" + c);
}

/** A facet param may arrive as a single value or as repeated params
 *  (Express hands back an array for `?brand=dior&brand=chanel`). */
function asList(v) {
  const arr = Array.isArray(v) ? v : [v];
  return arr.map((x) => String(x || "").trim()).filter(Boolean);
}
/** Push `col = ?` or `col IN (?,?,...)` for a facet list; returns true if used. */
function facetIn(where, params, col, list) {
  if (!list.length) return false;
  if (list.length === 1) { where.push(`${col} = ?`); params.push(list[0]); }
  else { where.push(`${col} IN (${list.map(() => "?").join(",")})`); params.push(...list); }
  return true;
}

function buildFilters(q) {
  const where = ["p.status = 'active'"];
  const having = [];
  const params = [];

  const qRaw = Array.isArray(q.q) ? q.q[0] : q.q;
  const term = String(qRaw || "").trim();
  if (term) {
    const like = "%" + escapeLike(term) + "%";
    where.push(`(p.name LIKE ? ESCAPE '\\' OR b.name LIKE ? ESCAPE '\\'
      OR p.description LIKE ? ESCAPE '\\' OR p.description_my LIKE ? ESCAPE '\\'
      OR p.top_notes LIKE ? ESCAPE '\\' OR p.mid_notes LIKE ? ESCAPE '\\'
      OR p.base_notes LIKE ? ESCAPE '\\' OR p.accords LIKE ? ESCAPE '\\')`);
    for (let i = 0; i < 8; i++) params.push(like);
  }
  facetIn(where, params, "b.slug", asList(q.brand));
  facetIn(where, params, "p.family", asList(q.family));
  facetIn(where, params, "p.concentration", asList(q.concentration));
  facetIn(where, params, "p.gender", asList(q.gender));
  const seasons = asList(q.season);
  if (seasons.length) {
    where.push(`EXISTS (SELECT 1 FROM json_each(p.seasons) je WHERE je.value IN (${seasons.map(() => "?").join(",")}))`);
    params.push(...seasons);
  }
  const occasions = asList(q.occasion);
  if (occasions.length) {
    where.push(`EXISTS (SELECT 1 FROM json_each(p.occasions) je WHERE je.value IN (${occasions.map(() => "?").join(",")}))`);
    params.push(...occasions);
  }
  if (q.size != null && q.size !== "" && !isNaN(parseFloat(q.size))) {
    where.push("EXISTS (SELECT 1 FROM variants vs WHERE vs.product_id = p.id AND vs.active = 1 AND vs.size_ml = ?)");
    params.push(parseFloat(q.size));
  }
  const minLong = parseInt(q.min_longevity, 10);
  if (minLong >= 1) { where.push("p.longevity >= ?"); params.push(minLong); }
  const minSil = parseInt(q.min_sillage, 10);
  if (minSil >= 1) { where.push("p.sillage >= ?"); params.push(minSil); }
  if (q.available === "1" || q.available === "true") {
    where.push("EXISTS (SELECT 1 FROM variants va WHERE va.product_id = p.id AND va.active = 1 AND va.stock_qty > 0)");
  }
  const minP = parseInt(q.min_price, 10);
  if (!isNaN(minP) && minP > 0) { having.push("MIN(v.price) >= ?"); params.push(minP); }
  const maxP = parseInt(q.max_price, 10);
  if (!isNaN(maxP) && maxP > 0) { having.push("MIN(v.price) <= ?"); params.push(maxP); }

  return { where, having, params };
}

function orderClause(sort) {
  // min_price = MIN(v.price) select-list alias, valid in ORDER BY (and HAVING).
  switch (sort) {
    case "price_asc":  return "ORDER BY (min_price IS NULL), min_price ASC, p.id DESC";
    case "price_desc": return "ORDER BY (min_price IS NULL), min_price DESC, p.id DESC";
    case "rating":     return "ORDER BY p.rating_avg DESC, p.id DESC";
    case "popular":    return "ORDER BY p.rating_count DESC, p.id DESC";
    case "bestselling":return "ORDER BY p.bestseller DESC, p.rating_avg DESC, p.id DESC";
    default:           return "ORDER BY p.id DESC"; // new
  }
}

/* Cursor choice (documented): opaque base64url JSON {k:[sort keys], id}.
 * Keyset columns per sort:
 *   new         -> (p.id)
 *   price_asc   -> (min_price, p.id)   with NULL min_price sorting last
 *   price_desc  -> (min_price, p.id)   with NULL min_price sorting last
 *   rating      -> (p.rating_avg, p.id)
 *   popular     -> (p.rating_count, p.id)
 *   bestselling -> (p.bestseller, p.rating_avg, p.id)
 * "after" rows satisfy the standard (key, id) tuple comparison; NULL
 * min_price rows form a trailing segment keyed by id only.
 */
function decodeCursor(c) {
  try {
    const o = JSON.parse(Buffer.from(String(c), "base64url").toString("utf8"));
    if (o && Array.isArray(o.k) && Number.isInteger(o.id)) return o;
  } catch (_) {}
  return null;
}
function encodeCursor(k, id) {
  return Buffer.from(JSON.stringify({ k, id })).toString("base64url");
}

/** Keyset condition appended to HAVING (the min_price aggregate needs HAVING). */
function keysetClause(sort, cursor, params) {
  const id = cursor.id;
  const k = cursor.k;
  switch (sort) {
    case "price_asc":
    case "price_desc": {
      const op = sort === "price_asc" ? ">" : "<";
      const price = k[0];
      if (price == null) {
        params.push(id);
        return "(min_price IS NULL AND p.id < ?)";
      }
      params.push(price, price, id);
      return `((min_price ${op} ?) OR (min_price = ? AND p.id < ?) OR min_price IS NULL)`;
    }
    case "rating":
      params.push(k[0], k[0], id);
      return "((p.rating_avg < ?) OR (p.rating_avg = ? AND p.id < ?))";
    case "popular":
      params.push(k[0], k[0], id);
      return "((p.rating_count < ?) OR (p.rating_count = ? AND p.id < ?))";
    case "bestselling":
      params.push(k[0], k[0], k[1], k[0], k[1], id);
      return `((p.bestseller < ?) OR (p.bestseller = ? AND p.rating_avg < ?)
               OR (p.bestseller = ? AND p.rating_avg = ? AND p.id < ?))`;
    default: // new
      params.push(id);
      return "(p.id < ?)";
  }
}

function cursorKeys(sort, item) {
  switch (sort) {
    case "price_asc":
    case "price_desc": return [item.min_price];
    case "rating": return [item.rating_avg];
    case "popular": return [item.rating_count];
    case "bestselling": return [item.bestseller ? 1 : 0, item.rating_avg];
    default: return [];
  }
}

router.get("/products", (req, res) => {
  const sort = SORTS.includes(req.query.sort) ? req.query.sort : "new";
  let limit = parseInt(req.query.limit, 10);
  if (!limit || limit < 1) limit = 24;
  limit = Math.min(limit, 48);

  const { where, having, params } = buildFilters(req.query);
  const cursor = req.query.cursor ? decodeCursor(req.query.cursor) : null;
  const havingAll = [...having];
  if (cursor) havingAll.push(keysetClause(sort, cursor, params));

  const listSql =
    LIST_COLS + LIST_FROM +
    " WHERE " + where.join(" AND ") +
    " GROUP BY p.id" +
    (havingAll.length ? " HAVING " + havingAll.join(" AND ") : "") +
    " " + orderClause(sort) +
    " LIMIT ?";
  const rows = all(listSql, ...params, limit + 1);

  const countSql =
    "SELECT COUNT(*) AS c FROM (" +
    "SELECT p.id" + LIST_FROM +
    " WHERE " + where.join(" AND ") +
    " GROUP BY p.id" +
    (having.length ? " HAVING " + having.join(" AND ") : "") +
    ")";
  const countParams = buildFilters(req.query).params; // fresh params, no keyset
  const total = get(countSql, ...countParams).c;

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(summaryRow);
  const nextCursor = hasMore && items.length
    ? encodeCursor(cursorKeys(sort, items[items.length - 1]), items[items.length - 1].id)
    : null;
  ok(res, { items, nextCursor, hasMore, total });
});

/* ---------- GET /api/products/:slug ---------- */
function reviewSummary(r) {
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

router.get("/products/:slug", (req, res) => {
  const p = get(
    `SELECT p.*, b.id AS brand_id, b.name AS brand_name, b.slug AS brand_slug
     FROM products p JOIN brands b ON b.id = p.brand_id
     WHERE p.slug = ? AND p.status = 'active'`,
    req.params.slug
  );
  if (!p) return fail(res, 404, "not_found");

  const variants = all(
    `SELECT id, name, size_ml, sku, price, compare_at, atomizer, stock_qty, low_threshold, active
     FROM variants WHERE product_id = ? AND active = 1 ORDER BY sort ASC, id ASC`,
    p.id
  );

  const reviews = all(
    `SELECT r.id, r.rating, r.longevity, r.sillage, r.title, r.content, r.verified, r.created_at,
            u.name AS user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.product_id = ? AND r.status = 'published'
     ORDER BY r.id DESC LIMIT 6`,
    p.id
  );

  // Related: same family first (ordered by rating), then fill with same brand.
  let related = [];
  if (p.family) {
    related = all(
      LIST_COLS + LIST_FROM +
      " WHERE p.status = 'active' AND p.family = ? AND p.id != ?" +
      " GROUP BY p.id ORDER BY p.rating_avg DESC, p.id DESC LIMIT 4",
      p.family, p.id
    );
  }
  if (related.length < 4) {
    const exclude = [p.id, ...related.map((r) => r.id)];
    const placeholders = exclude.map(() => "?").join(",");
    const more = all(
      LIST_COLS + LIST_FROM +
      ` WHERE p.status = 'active' AND p.brand_id = ? AND p.id NOT IN (${placeholders})` +
      " GROUP BY p.id ORDER BY p.rating_avg DESC, p.id DESC LIMIT ?",
      p.brand_id, ...exclude, 4 - related.length
    );
    related = related.concat(more);
  }

  ok(res, {
    product: {
      id: p.id,
      slug: p.slug,
      name: p.name,
      type: p.type,
      gender: p.gender,
      concentration: p.concentration,
      family: p.family,
      top_notes: parseJsonArray(p.top_notes),
      mid_notes: parseJsonArray(p.mid_notes),
      base_notes: parseJsonArray(p.base_notes),
      accords: parseJsonArray(p.accords),
      release_year: p.release_year,
      perfumer: p.perfumer,
      description: p.description,
      description_my: p.description_my,
      seasons: parseJsonArray(p.seasons),
      occasions: parseJsonArray(p.occasions),
      longevity: p.longevity,
      sillage: p.sillage,
      origin: p.origin,
      art_seed: p.art_seed,
      image: p.image || "",
      image_url: p.image ? "/uploads/products/" + p.image : "",
      authenticity: p.authenticity,
      authenticity_my: p.authenticity_my,
      featured: !!p.featured,
      is_new: !!p.is_new,
      bestseller: !!p.bestseller,
      rating_avg: p.rating_avg,
      rating_count: p.rating_count,
      brand: { id: p.brand_id, name: p.brand_name, slug: p.brand_slug },
      variants: variants.map((v) => ({ ...v, active: !!v.active })),
      reviews: reviews.map(reviewSummary),
      related: related.map(summaryRow),
    },
  });
});

module.exports = router;
