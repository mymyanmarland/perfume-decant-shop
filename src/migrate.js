"use strict";
/* Startup migration — enforces the shop's 2-size policy (5ml + 10ml decants)
 * on every non-archived product, including databases seeded before the policy.
 *   - Ensures each product has an ACTIVE 5ml and 10ml variant (creates missing
 *     ones, pricing derived from the product's own per-ml average, rounded to
 *     the nearest 500 Ks).
 *   - Deactivates every other variant (2ml, samples, full bottles, ...).
 * Safe for order history: rows are never deleted, only (de)activated.
 * Idempotent — safe to run on every startup. */
const { get, all, run, tx } = require("./db");

const SIZES = [5, 10];

function round500(n) {
  return Math.max(500, Math.round(n / 500) * 500);
}

function normalizeVariants() {
  const products = all("SELECT id, slug, name FROM products WHERE status != 'archived'");
  let ensured = 0, deactivated = 0;
  tx(() => {
    for (const p of products) {
      const variants = all("SELECT * FROM variants WHERE product_id = ?", p.id);
      const perMl = [];
      for (const v of variants) {
        const ml = Number(v.size_ml);
        if (ml > 0 && ml <= 20 && v.price > 0) perMl.push(v.price / ml);
      }
      const avgPerMl = perMl.length
        ? perMl.reduce((a, b) => a + b, 0) / perMl.length
        : 3000;
      for (const ml of SIZES) {
        const existing = variants.find((v) => Number(v.size_ml) === ml);
        if (existing) {
          run("UPDATE variants SET name = ? WHERE id = ?", `${ml}ml Decant`, existing.id);
          // Reactivate only priced variants — a 0-Ks variant means the admin
          // hasn't priced it yet (see POST /api/admin/products).
          if (!existing.active && existing.price > 0) {
            run("UPDATE variants SET active = 1 WHERE id = ?", existing.id);
            ensured++;
          }
        } else {
          const price = round500(avgPerMl * ml);
          const prefix = String(p.slug || "pds").split("-").map((w) => w[0]).join("").toUpperCase().slice(0, 3) || "PDS";
          let sku = `${prefix}-${ml}ML`, n = 0;
          while (get("SELECT id FROM variants WHERE sku = ?", sku)) { n += 1; sku = `${prefix}-${ml}ML-${n}`; }
          run(`INSERT INTO variants (product_id, name, size_ml, sku, price, compare_at, atomizer,
                                     stock_qty, low_threshold, active, sort)
               VALUES (?,?,?,?,?,?, 'Glass spray atomizer', 20, 3, 1, ?)`,
            p.id, `${ml}ml Decant`, ml, sku, price, Math.round(price * 1.2), ml === 5 ? 0 : 1);
          ensured++;
        }
      }
      for (const v of variants) {
        if (!SIZES.includes(Number(v.size_ml)) && v.active) {
          run("UPDATE variants SET active = 0 WHERE id = ?", v.id);
          deactivated++;
        }
      }
    }
  });
  if (ensured || deactivated) {
    console.log(`Variant normalization: ensured ${ensured}, deactivated ${deactivated}.`);
  }
}

module.exports = { normalizeVariants };
