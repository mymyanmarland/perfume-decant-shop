/* ============================================================
   cart.js — Shopping cart page.
   Uses priced cart from GET /api/cart?coupon=&zone_id= (server is
   the source of truth for all totals).
   Shared: api(), t(), applyI18n(), toast(), updateCartBadge(),
   + shopper.js helpers (tx, mmk, artHTML, loadZones, …).
   ============================================================ */
(function () {
  "use strict";

  var state = {
    lines: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0,
    coupon: null, zone: null, freeDelivery: false, errors: [],
    zones: [], threshold: 0,
    couponCode: "", zoneId: "", township: ""
  };
  var refreshTimer = null;

  try {
    state.couponCode = localStorage.getItem("pds_coupon") || "";
    state.zoneId = localStorage.getItem("pds_zone") || "";
    state.township = localStorage.getItem("pds_township") || "";
  } catch (e) { /* ignore */ }

  shopperBoot(init);

  async function init() {
    state.zones = await loadZones();
    try {
      var pub = await api("/api/settings/public");
      state.threshold = parseInt((pub && pub.free_delivery_threshold) || "0", 10) || 0;
    } catch (e) { /* ignore */ }
    await refreshCart();
  }

  function cartQuery() {
    var q = new URLSearchParams();
    if (state.couponCode) q.set("coupon", state.couponCode);
    if (state.zoneId) q.set("zone_id", state.zoneId);
    var s = q.toString();
    return s ? "/api/cart?" + s : "/api/cart";
  }

  async function refreshCart() {
    var root = qs("#cart-root");
    try {
      var d = await api(cartQuery());
      state.lines = d.lines || [];
      state.subtotal = d.subtotal || 0;
      state.discount = d.discount || 0;
      state.deliveryFee = d.deliveryFee || 0;
      state.total = d.total || 0;
      state.coupon = d.coupon || null;
      state.zone = d.zone || null;
      state.freeDelivery = !!d.freeDelivery;
      state.errors = d.errors || [];
      render();
      var count = state.lines.reduce(function (n, l) { return n + (l.qty || 0); }, 0);
      try { updateCartBadge(); } catch (e) { /* ignore */ }
    } catch (e) {
      var ei = apiErr(e);
      root.innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
    }
    applyShopperI18n();
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshCart, 450);
  }

  /* ---------------- render ---------------- */
  function render() {
    var root = qs("#cart-root");
    if (!state.lines.length) {
      root.innerHTML = emptyHTML();
      bindEmpty(root);
      return;
    }
    root.innerHTML =
      '<div class="lx-grid-2">' +
        '<div>' +
          '<div class="lx-card" id="cart-lines">' + state.lines.map(lineHTML).join("") + "</div>" +
          stockErrorsHTML() +
          '<div class="lx-card lx-mt"><h3>' + escHtml(tx("cart.coupon", "Coupon code")) + "</h3>" +
            '<div class="lx-coupon"><input class="lx-input" id="coupon-input" placeholder="WELCOME10" value="' + escHtml(state.couponCode) + '" autocomplete="off">' +
            '<button class="lx-btn auto lx-btn-sm" id="coupon-apply">' + escHtml(tx("cart.apply", "Apply")) + "</button></div>" +
            couponMsgHTML() +
          "</div>" +
          '<div class="lx-card lx-mt"><h3>' + escHtml(tx("cart.delivery", "Delivery estimate")) + "</h3>" +
            '<div class="lx-zone-grid">' +
              '<div class="lx-field"><label>' + escHtml(tx("cart.zone", "Delivery zone")) + "</label>" +
                '<select class="lx-select" id="zone-select">' + zoneOptionsHTML() + "</select></div>" +
              '<div class="lx-field"><label>' + escHtml(tx("cart.township", "Township")) + "</label>" +
                '<select class="lx-select" id="township-select">' + townshipOptionsHTML() + "</select></div>" +
            "</div>" +
            '<div class="lx-hint">' + escHtml(tx("cart.zone_hint", "Select your zone to estimate the delivery fee.")) + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="lx-sticky"><div class="lx-card" id="cart-summary">' + summaryHTML() + "</div></div>" +
      "</div>";
    bindAll(root);
  }

  function emptyHTML() {
    return '<div class="lx-card lx-empty">' +
      '<div class="lx-big">🛍</div>' +
      '<h2>' + escHtml(tx("cart.empty_title", "Your cart is empty")) + "</h2>" +
      '<p class="lx-muted">' + escHtml(tx("cart.empty_hint", "Discover authentic perfume decants and add your favourites.")) + "</p>" +
      '<p class="lx-mt"><a class="lx-btn auto" href="/">' + escHtml(tx("cart.shop", "Continue shopping")) + "</a></p>" +
      "</div>";
  }
  function bindEmpty() { /* nothing dynamic */ }

  function lineHTML(l) {
    return '<div class="lx-line" data-variant="' + l.variant_id + '">' +
      artHTML(l.product_id, l.product_name) +
      '<div>' +
        '<div class="lx-line-top"><div>' +
          '<div class="lx-line-name">' + escHtml(l.product_name) + "</div>" +
          '<div class="lx-line-var">' + escHtml(l.variant_name) + " · " + escHtml(l.size_ml) + " ml</div>" +
        "</div>" +
        '<button class="lx-remove" data-act="remove">' + escHtml(tx("cart.remove", "Remove")) + "</button></div>" +
        '<div class="lx-line-bottom">' +
          '<div class="lx-stepper">' +
            '<button data-act="dec" aria-label="−">−</button>' +
            '<input data-qty value="' + l.qty + '" inputmode="numeric" aria-label="quantity">' +
            '<button data-act="inc" aria-label="+">+</button>' +
          "</div>" +
          '<div class="lx-line-total">' + escHtml(mmk(l.line_total)) + "</div>" +
        "</div>" +
      "</div>" +
    "</div>";
  }

  function stockErrorsHTML() {
    var errs = state.errors.filter(function (e) { return e.variant_id; });
    if (!errs.length) return "";
    var items = errs.map(function (e) {
      var msg = e.error === "insufficient_stock" && e.available != null
        ? tx("cart.only_left", "Only {n} left in stock — quantity was adjusted.", { n: e.available })
        : tx("cart.unavailable", "This item is no longer available and was removed from your total.");
      return "<li>" + escHtml(msg) + "</li>";
    }).join("");
    return '<div class="lx-card lx-mt">' + bannerHTML(
      "<strong>" + escHtml(tx("cart.stock_title", "Some items need attention")) + "</strong><ul style='margin:8px 0 10px;padding-left:18px'>" + items + "</ul>" +
      '<button class="lx-btn lx-btn-sm auto" id="fix-stock">' + escHtml(tx("cart.fix_stock", "Remove unavailable items")) + "</button>",
      "error") + "</div>";
  }

  function couponMsgHTML() {
    var cErr = state.errors.find(function (e) { return !e.variant_id && /^coupon/.test(e.error || ""); });
    if (cErr) return '<div class="lx-err" style="display:block">' + escHtml(errText(cErr.error)) + "</div>";
    if (state.coupon) {
      return '<div class="lx-hint" style="color:var(--lx-ok)">✓ ' +
        escHtml(tx("cart.coupon_ok", "Coupon {code} applied.", { code: state.coupon.code })) + "</div>";
    }
    return "";
  }

  function zoneOptionsHTML() {
    var opts = '<option value="">' + escHtml(tx("cart.pick_zone", "Choose a zone…")) + "</option>";
    opts += state.zones.map(function (z) {
      return '<option value="' + z.id + '"' + (String(z.id) === String(state.zoneId) ? " selected" : "") + ">" +
        escHtml(zoneName(z)) + " · " + escHtml(mmk(z.fee)) + "</option>";
    }).join("");
    return opts;
  }

  function selectedZone() {
    return state.zones.find(function (z) { return String(z.id) === String(state.zoneId); }) || null;
  }

  function townshipOptionsHTML() {
    var z = selectedZone();
    var opts = '<option value="">' + escHtml(tx("cart.pick_township", "Choose a township…")) + "</option>";
    if (z) {
      opts += z.townships.map(function (t) {
        return '<option' + (t === state.township ? " selected" : "") + ">" + escHtml(t) + "</option>";
      }).join("");
    }
    return opts;
  }

  function summaryHTML() {
    var h = "<h3>" + escHtml(tx("cart.summary", "Order summary")) + "</h3>";
    h += '<div class="lx-sum-row"><span>' + escHtml(tx("cart.subtotal", "Subtotal")) + "</span><span>" + escHtml(mmk(state.subtotal)) + "</span></div>";
    if (state.discount > 0) {
      h += '<div class="lx-sum-row discount"><span>' + escHtml(tx("cart.discount", "Discount")) + "</span><span>− " + escHtml(mmk(state.discount)) + "</span></div>";
    }
    h += '<div class="lx-sum-row"><span>' + escHtml(tx("cart.delivery_fee", "Delivery")) + "</span><span>";
    if (state.zone) {
      h += (state.deliveryFee === 0)
        ? '<span class="free">' + escHtml(tx("cart.free", "FREE")) + "</span>"
        : escHtml(mmk(state.deliveryFee));
    } else {
      h += '<span class="lx-muted">—</span>';
    }
    h += "</span></div>";
    h += '<div class="lx-sum-row total"><span>' + escHtml(tx("cart.total", "Total")) + "</span><span>" + escHtml(mmk(state.total)) + "</span></div>";
    h += freeDeliveryHTML();
    var blocked = state.errors.length > 0;
    h += '<div class="lx-mt"><button class="lx-btn" id="go-checkout"' + (blocked ? " disabled" : "") + ">" +
      escHtml(tx("cart.checkout_btn", "Proceed to checkout →")) + "</button></div>";
    if (blocked) {
      h += '<div class="lx-hint lx-center">' + escHtml(tx("cart.blocked", "Resolve the stock issues above to continue.")) + "</div>";
    }
    h += '<div class="lx-secure">🔒 ' + escHtml(tx("cart.secure", "Totals are calculated securely on our server.")) + "</div>";
    return h;
  }

  function freeDeliveryHTML() {
    if (state.threshold <= 0 || state.deliveryFee === 0 && state.zone) return "";
    if (state.subtotal >= state.threshold) return "";
    var pct = Math.min(100, Math.round((state.subtotal / state.threshold) * 100));
    return '<div class="lx-freed">' +
      escHtml(tx("cart.free_hint", "Add {amt} more for FREE delivery", { amt: mmk(state.threshold - state.subtotal) })) +
      '<div class="bar"><span style="width:' + pct + '%"></span></div></div>';
  }

  /* ---------------- bindings ---------------- */
  function bindAll(root) {
    qsa("#cart-lines .lx-line", root).forEach(function (row) {
      var vid = row.getAttribute("data-variant");
      var input = qs("[data-qty]", row);
      qs('[data-act="dec"]', row).addEventListener("click", function () {
        var q = Math.max(0, (parseInt(input.value, 10) || 1) - 1);
        setQty(vid, q, input);
      });
      qs('[data-act="inc"]', row).addEventListener("click", function () {
        var q = Math.min(99, (parseInt(input.value, 10) || 1) + 1);
        setQty(vid, q, input);
      });
      input.addEventListener("change", function () {
        var q = Math.max(0, Math.min(99, parseInt(input.value, 10) || 0));
        setQty(vid, q, input);
      });
      qs('[data-act="remove"]', row).addEventListener("click", function () { setQty(vid, 0); });
    });

    qs("#coupon-apply", root).addEventListener("click", applyCoupon);
    qs("#coupon-input", root).addEventListener("keydown", function (e) { if (e.key === "Enter") applyCoupon(); });

    qs("#zone-select", root).addEventListener("change", function (e) {
      state.zoneId = e.target.value;
      state.township = "";
      persistZone();
      refreshCart();
    });
    qs("#township-select", root).addEventListener("change", function (e) {
      state.township = e.target.value;
      persistZone();
    });

    var fix = qs("#fix-stock", root);
    if (fix) fix.addEventListener("click", async function () {
      var vids = state.errors.filter(function (e) { return e.variant_id; }).map(function (e) { return e.variant_id; });
      for (var i = 0; i < vids.length; i++) {
        try { await api("/api/cart/items/" + encodeURIComponent(vids[i]), { method: "DELETE" }); } catch (e) { /* ignore */ }
      }
      refreshCart();
    });

    var co = qs("#go-checkout", root);
    if (co && !co.disabled) co.addEventListener("click", function () { go("/checkout.html"); });
  }

  async function setQty(vid, qty, input) {
    if (input) input.value = qty;
    try {
      if (qty <= 0) await api("/api/cart/items/" + encodeURIComponent(vid), { method: "DELETE" });
      else await api("/api/cart/items/" + encodeURIComponent(vid), { method: "PUT", body: { qty: qty } });
      scheduleRefresh();
    } catch (e) {
      var ei = apiErr(e);
      try { toastErr(errText(ei.code)); } catch (t2) { /* ignore */ }
      refreshCart();
    }
  }

  function applyCoupon() {
    var v = qs("#coupon-input").value.trim().toUpperCase();
    state.couponCode = v;
    try {
      if (v) localStorage.setItem("pds_coupon", v);
      else localStorage.removeItem("pds_coupon");
    } catch (e) { /* ignore */ }
    refreshCart();
  }

  function persistZone() {
    try {
      if (state.zoneId) localStorage.setItem("pds_zone", state.zoneId);
      else localStorage.removeItem("pds_zone");
      if (state.township) localStorage.setItem("pds_township", state.township);
      else localStorage.removeItem("pds_township");
    } catch (e) { /* ignore */ }
  }
})();
