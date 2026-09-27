/* ============================================================
   order.js — Order detail page (?number=).
   GET /api/orders/:number (owner or staff) -> {order, items,
   payment, shipment, timeline}.
   Sections: status timeline, items, payment status + proof upload
   when pending, shipment tracking, cancel (if cancellable),
   reorder.
   Shared: api(), t(), applyI18n(), toast(), updateCartBadge()
   + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  var CANCELLABLE = ["pending_payment", "payment_verification", "confirmed"];
  var number = null;
  var detail = null;

  shopperBoot(init);

  async function init() {
    var root = qs("#order-root");
    number = qp("number");
    if (!number) {
      root.innerHTML = bannerHTML(escHtml(tx("order.no_number", "No order number was given.")), "error");
      return;
    }
    var user = await requireLogin("/order.html?number=" + encodeURIComponent(number));
    if (!user) return;
    await load(root);
  }

  async function load(root) {
    root.innerHTML = '<div class="lx-loading">' + escHtml(tx("common.loading", "Loading…")) + "</div>";
    try {
      detail = await api("/api/orders/" + encodeURIComponent(number));
      render(root);
    } catch (e) {
      var ei = apiErr(e);
      root.innerHTML = bannerHTML(escHtml(errText(ei.code)), "error") +
        '<p class="lx-center"><a class="lx-btn auto lx-btn-ghost" href="/orders.html">' +
        escHtml(tx("order.back", "← Back to my orders")) + "</a></p>";
    }
    applyShopperI18n();
  }

  function render(root) {
    var o = detail.order || {};
    var items = detail.items || [];
    var pay = detail.payment || {};
    var ship = detail.shipment || {};

    var html = '<h1 class="lx-title">' + escHtml(tx("order.title", "Order {num}", { num: o.number || number })) + "</h1>";

    // status card
    html += '<div class="lx-card"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
      '<span class="lx-badge st-' + escHtml(o.status) + '">' + escHtml(orderStatusLabel(o.status)) + "</span>" +
      '<span class="lx-muted" style="font-size:.85rem">' + escHtml(fmtDateTime(o.created_at)) + "</span></div>" +
      statusTimelineHTML(o.status, detail.timeline) + "</div>";

    // items
    html += '<div class="lx-card"><h3>' + escHtml(tx("order.items", "Items")) + "</h3>" +
      items.map(itemHTML).join("") + "</div>";

    // payment
    html += paymentHTML(o, pay);

    // shipment
    if (ship && (ship.courier || ship.tracking_ref || ship.shipped_at)) {
      html += '<div class="lx-card"><h3>' + escHtml(tx("order.shipment", "Shipment")) + "</h3>" +
        '<dl class="lx-kv">' +
        (ship.courier ? "<dt>" + escHtml(tx("order.courier", "Courier")) + "</dt><dd>" + escHtml(ship.courier) + "</dd>" : "") +
        (ship.tracking_ref ? "<dt>" + escHtml(tx("order.tracking", "Tracking ref")) + "</dt><dd><strong>" + escHtml(ship.tracking_ref) + "</strong></dd>" : "") +
        (ship.shipped_at ? "<dt>" + escHtml(tx("order.shipped_at", "Shipped")) + "</dt><dd>" + escHtml(fmtDateTime(ship.shipped_at)) + "</dd>" : "") +
        (ship.delivered_at ? "<dt>" + escHtml(tx("order.delivered_at", "Delivered")) + "</dt><dd>" + escHtml(fmtDateTime(ship.delivered_at)) + "</dd>" : "") +
        "</dl></div>";
    }

    // shipping address
    html += '<div class="lx-card"><h3>' + escHtml(tx("order.ship_to", "Ship to")) + "</h3>" +
      "<p><strong>" + escHtml(o.name || "") + "</strong> · " + escHtml(o.phone || "") + "</p>" +
      "<p class='lx-muted' style='font-size:.9rem'>" +
        escHtml([o.address_line, o.township, o.city, o.region].filter(Boolean).join(", ")) +
        (o.notes ? "<br>" + escHtml(tx("checkout.notes", "Order notes")) + ": " + escHtml(o.notes) : "") +
      "</p></div>";

    // actions
    html += '<div class="lx-card"><div class="lx-btn-row">' +
      '<button class="lx-btn lx-btn-ghost" id="ord-reorder">↻ ' + escHtml(tx("order.reorder", "Reorder these items")) + "</button>";
    if (CANCELLABLE.indexOf(o.status) !== -1) {
      html += '<button class="lx-btn lx-btn-danger" id="ord-cancel">' + escHtml(tx("order.cancel", "Cancel order")) + "</button>";
    }
    html += "</div></div>";

    root.innerHTML = html;

    qs("#ord-reorder", root).addEventListener("click", reorder);
    var c = qs("#ord-cancel", root);
    if (c) c.addEventListener("click", cancelOrder);

    var proofBox = qs("#proof-slot", root);
    if (proofBox) {
      mountProofForm(proofBox, o.number || number, { onSuccess: function () { load(root); } });
    }
  }

  function itemHTML(it) {
    var name = it.product_name || it.name || "";
    var variant = [it.variant_name, it.size_ml ? it.size_ml + " ml" : ""].filter(Boolean).join(" · ");
    var qty = it.qty || 1;
    var total = it.line_total != null ? it.line_total : (it.unit_price || it.price || 0) * qty;
    return '<div class="lx-line">' +
      artHTML(it.product_id || it.product_name, name) +
      "<div><div class='lx-line-name'>" + escHtml(name) + "</div>" +
      '<div class="lx-line-var">' + escHtml(variant) + " × " + qty + "</div></div>" +
      '<div class="lx-line-total">' + escHtml(mmk(total)) + "</div>" +
    "</div>";
  }

  function paymentHTML(o, pay) {
    var method = pay.method || o.payment_method || "";
    var pstatus = pay.status || o.payment_status || "";
    var amount = pay.amount != null ? pay.amount : o.total;
    var html = '<div class="lx-card"><h3>' + escHtml(tx("order.payment", "Payment")) + "</h3>" +
      '<div class="lx-sum-row"><span>' + escHtml(tx("proof.method", "Method")) + "</span><span>" +
        '<span class="lx-pay-ic" style="width:26px;height:26px;font-size:.65rem;vertical-align:-7px;margin-right:6px;background:' +
        payMethodColor(method) + '">' + payMethodShort(method) + "</span>" +
        escHtml(payMethodLabel(method)) + "</span></div>" +
      '<div class="lx-sum-row"><span>' + escHtml(tx("order.pay_status", "Status")) + '</span><span class="lx-badge ps-' + escHtml(pstatus) + '">' +
        escHtml(payStatusLabel(pstatus)) + "</span></div>" +
      '<div class="lx-sum-row"><span>' + escHtml(tx("proof.amount", "Amount to pay")) + '</span><span style="font-weight:700">' + escHtml(mmk(amount)) + "</span></div>";
    if (pay.txn_ref) {
      html += '<div class="lx-sum-row"><span>' + escHtml(tx("proof.txn", "Transaction reference")) + "</span><span>" + escHtml(pay.txn_ref) + "</span></div>";
    }
    var needsProof = (o.status === "pending_payment" || o.status === "payment_verification") &&
      method !== "cod" && (pstatus === "pending" || pstatus === "failed" || !pstatus);
    if (needsProof) {
      html += '<hr class="lx-div"><div id="proof-slot"></div>';
    } else if (pstatus === "proof_submitted" || pstatus === "under_review") {
      html += bannerHTML("ℹ " + escHtml(tx("order.proof_review", "Your payment proof is under review. We'll confirm your order soon.")), "info");
    }
    html += "</div>";
    return html;
  }

  async function reorder() {
    var btn = qs("#ord-reorder");
    btn.disabled = true;
    try {
      await api("/api/orders/" + encodeURIComponent(number) + "/reorder", { method: "POST" });
      try { toastOk(tx("order.reordered", "Items added to your cart.")); } catch (e) {}
      var d = await api("/api/cart");
      var count = (d.lines || []).reduce(function (n, l) { return n + (l.qty || 0); }, 0);
      try { updateCartBadge(); } catch (e2) { /* ignore */ }
      go("/cart.html");
    } catch (e) {
      var ei = apiErr(e);
      try { toastErr(errText(ei.code)); } catch (e2) {}
      btn.disabled = false;
    }
  }

  async function cancelOrder() {
    var reason = window.prompt(tx("order.cancel_why", "Why are you cancelling? (optional)"), "");
    if (reason === null) return; // dismissed
    var btn = qs("#ord-cancel");
    btn.disabled = true;
    try {
      await api("/api/orders/" + encodeURIComponent(number) + "/cancel", { method: "POST", body: { reason: reason || "" } });
      try { toastOk(tx("order.cancelled", "Order cancelled.")); } catch (e) {}
      await load(qs("#order-root"));
    } catch (e) {
      var ei = apiErr(e);
      try { toastErr(errText(ei.code)); } catch (e2) {}
      btn.disabled = false;
    }
  }
})();
