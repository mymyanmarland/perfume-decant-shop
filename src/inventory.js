"use strict";
/* Milliliter-based inventory. Every mutation runs inside a DB transaction
   and writes an inventory_movements record. */
const { get, all, run, tx } = require("./db");

/**
 * Reserve ml for an order (called when order becomes confirmed).
 * Distributes across the product's source bottles, fullest-first.
 * Throws if insufficient ml — caller rolls back the whole order.
 */
function reserveForOrder(orderId, lines, actorId) {
  tx(() => {
    for (const l of lines) {
      let need = l.size_ml * l.qty;
      const bottles = all(
        `SELECT * FROM source_bottles WHERE product_id = ?
         ORDER BY (current_ml - reserved_ml) DESC`, l.product_id);
      for (const b of bottles) {
        if (need <= 0.0001) break;
        const avail = b.current_ml - b.reserved_ml;
        if (avail <= 0.0001) continue;
        const take = Math.min(avail, need);
        run("UPDATE source_bottles SET reserved_ml = reserved_ml + ? WHERE id = ?", take, b.id);
        const bal = get("SELECT current_ml - reserved_ml AS avail FROM source_bottles WHERE id = ?", b.id).avail;
        run(`INSERT INTO inventory_movements
             (bottle_id, order_id, type, qty_ml, balance_ml, note, actor_id, created_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          b.id, orderId, "reserve", take, bal,
          `Reserved for order (variant ${l.variant_name} x${l.qty})`, actorId || null, Date.now());
        need -= take;
      }
      if (need > 0.0001) throw new Error(`insufficient_ml:${l.product_id}`);
      // decrement saleable unit stock
      run("UPDATE variants SET stock_qty = stock_qty - ? WHERE id = ?", l.qty, l.variant_id);
    }
  });
}

/**
 * Deduct reserved ml when the order is packed.
 * Releases proportionally from bottles that hold reservations for this order.
 */
function deductForOrder(orderId, lines, actorId) {
  tx(() => {
    for (const l of lines) {
      let need = l.size_ml * l.qty;
      const bottles = all(
        `SELECT sb.* FROM source_bottles sb
         WHERE sb.product_id = ? AND sb.reserved_ml > 0.0001
         ORDER BY sb.reserved_ml DESC`, l.product_id);
      for (const b of bottles) {
        if (need <= 0.0001) break;
        const take = Math.min(b.reserved_ml, need);
        run("UPDATE source_bottles SET reserved_ml = reserved_ml - ?, current_ml = current_ml - ? WHERE id = ?",
          take, take, b.id);
        const bal = get("SELECT current_ml - reserved_ml AS avail FROM source_bottles WHERE id = ?", b.id).avail;
        run(`INSERT INTO inventory_movements
             (bottle_id, order_id, type, qty_ml, balance_ml, note, actor_id, created_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          b.id, orderId, "deduct", take, bal,
          `Decanted & packed (variant ${l.variant_name} x${l.qty})`, actorId || null, Date.now());
        need -= take;
      }
      if (need > 0.0001) throw new Error(`deduct_shortfall:${l.product_id}`);
    }
  });
}

/** Release a reservation (order cancelled before packing). Restores unit stock. */
function releaseForOrder(orderId, lines, actorId, reason = "Order cancelled") {
  tx(() => {
    for (const l of lines) {
      let need = l.size_ml * l.qty;
      const bottles = all(
        `SELECT sb.* FROM source_bottles sb
         WHERE sb.product_id = ? AND sb.reserved_ml > 0.0001
         ORDER BY sb.reserved_ml DESC`, l.product_id);
      for (const b of bottles) {
        if (need <= 0.0001) break;
        const take = Math.min(b.reserved_ml, need);
        run("UPDATE source_bottles SET reserved_ml = reserved_ml - ? WHERE id = ?", take, b.id);
        const bal = get("SELECT current_ml - reserved_ml AS avail FROM source_bottles WHERE id = ?", b.id).avail;
        run(`INSERT INTO inventory_movements
             (bottle_id, order_id, type, qty_ml, balance_ml, note, actor_id, created_at)
             VALUES (?,?,?,?,?,?,?,?)`,
          b.id, orderId, "release", take, bal, reason, actorId || null, Date.now());
        need -= take;
      }
      run("UPDATE variants SET stock_qty = stock_qty + ? WHERE id = ?", l.qty, l.variant_id);
    }
  });
}

/** Admin manual stock adjustment on a bottle (purchase adds stock). */
function adjustBottle(bottleId, newCurrentMl, actorId, note = "") {
  return tx(() => {
    const b = get("SELECT * FROM source_bottles WHERE id = ?", bottleId);
    if (!b) throw new Error("bottle_not_found");
    const delta = newCurrentMl - b.current_ml;
    const type = delta >= 0 ? "purchase" : "adjust";
    run("UPDATE source_bottles SET current_ml = ? WHERE id = ?", newCurrentMl, bottleId);
    const bal = newCurrentMl - b.reserved_ml;
    run(`INSERT INTO inventory_movements
         (bottle_id, order_id, type, qty_ml, balance_ml, note, actor_id, created_at)
         VALUES (?,?,?, ?,?,?,?,?)`,
      bottleId, null, type, delta, bal, note || "Manual adjustment", actorId || null, Date.now());
    return { delta, balance: bal };
  });
}

/** Add a new source bottle (purchase). */
function addBottle(data, actorId) {
  return tx(() => {
    const r = run(`INSERT INTO source_bottles
      (product_id, ref, original_ml, current_ml, reserved_ml, batch, supplier, cost_mmk, purchased_at, notes, created_at)
      VALUES (?,?,?,?,0,?,?,?,?,?,?)`,
      data.product_id, data.ref, data.original_ml, data.current_ml,
      data.batch || "", data.supplier || "", data.cost_mmk || 0,
      data.purchased_at || Date.now(), data.notes || "", Date.now());
    const id = r.lastInsertRowid;
    run(`INSERT INTO inventory_movements
         (bottle_id, order_id, type, qty_ml, balance_ml, note, actor_id, created_at)
         VALUES (?,?, 'purchase', ?, ?, ?, ?, ?)`,
      id, null, data.current_ml, data.current_ml,
      `New source bottle ${data.ref} (${data.supplier || "unknown supplier"})`, actorId || null, Date.now());
    return id;
  });
}

function bottleAvailability(productId) {
  const row = get(
    `SELECT COALESCE(SUM(current_ml),0) AS total,
            COALESCE(SUM(reserved_ml),0) AS reserved,
            COALESCE(SUM(current_ml - reserved_ml),0) AS avail
     FROM source_bottles WHERE product_id = ?`, productId);
  return row;
}

module.exports = {
  reserveForOrder, deductForOrder, releaseForOrder,
  adjustBottle, addBottle, bottleAvailability,
};
