/* ============================================================
   orders.js — Logged-in order history list.
   GET /api/orders -> [{id, number, status, payment_status, total,
   created_at, item_count}] linking to order.html?number=.
   Shared: api(), applyI18n() + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  shopperBoot(init);

  async function init() {
    var root = qs("#orders-root");
    var user = await requireLogin("/orders.html");
    if (!user) return; // redirected to login
    try {
      var d = await api("/api/orders");
      var orders = d.orders || d.items || [];
      if (!orders.length) {
        root.innerHTML = '<div class="lx-card lx-empty">' +
          '<div class="lx-big">📦</div>' +
          "<h2>" + escHtml(tx("orders.empty", "No orders yet")) + "</h2>" +
          '<p class="lx-muted">' + escHtml(tx("orders.empty_hint", "Your orders will appear here once you check out.")) + "</p>" +
          '<p class="lx-mt"><a class="lx-btn auto" href="/">' + escHtml(tx("cart.shop", "Continue shopping")) + "</a></p></div>";
      } else {
        root.innerHTML = '<div class="lx-card">' + orders.map(rowHTML).join("") + "</div>";
      }
    } catch (e) {
      var ei = apiErr(e);
      root.innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
    }
    applyShopperI18n();
  }

  function rowHTML(o) {
    return '<a class="lx-order-row" href="/order.html?number=' + encodeURIComponent(o.number) + '">' +
      '<div class="lx-order-main">' +
        '<div class="lx-order-num">' + escHtml(o.number) + "</div>" +
        '<div class="lx-order-meta">' + escHtml(fmtDateTime(o.created_at)) + " · " +
          escHtml(tx("orders.count_items", "{n} items", { n: o.item_count || 0 })) + "</div>" +
        '<div style="margin-top:6px"><span class="lx-badge st-' + escHtml(o.status) + '">' + escHtml(orderStatusLabel(o.status)) + "</span></div>" +
      "</div>" +
      '<div class="lx-order-total">' + escHtml(mmk(o.total)) + "</div>" +
      '<div class="lx-order-chev">›</div>' +
    "</a>";
  }
})();
