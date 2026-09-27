/* ============================================================
   checkout.js — Checkout flow.
   1) Shipping/contact form + payment method + coupon + summary
      (summary is server-priced via GET /api/cart).
   2) POST /api/checkout.
   3a) COD -> success -> redirect to order.html?number=.
   3b) Manual (kbzpay/wavepay/ayapay/bank) -> payment instructions
       (GET /api/checkout/payment-instructions) + proof upload form
       (multipart POST /api/checkout/:number/payment-proof).
   Shared: api(), t(), applyI18n(), toast() + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  var PAY_METHODS = ["kbzpay", "wavepay", "ayapay", "bank", "cod"];

  var state = {
    step: "form",               // form | proof | done
    lines: [], subtotal: 0, discount: 0, deliveryFee: 0, total: 0,
    coupon: null, errors: [],
    zones: [], zoneId: "", township: "", couponCode: "",
    payMethod: "", instruction: "",
    orderNumber: "", orderTotal: 0, orderMethod: "",
    addresses: [], user: null
  };

  shopperBoot(init);

  async function init() {
    try {
      state.couponCode = localStorage.getItem("pds_coupon") || "";
      state.zoneId = localStorage.getItem("pds_zone") || "";
      state.township = localStorage.getItem("pds_township") || "";
    } catch (e) { /* ignore */ }
    state.zones = await loadZones();
    try {
      var me = await api("/api/auth/me");
      state.user = (me && me.user) || null;
      if (state.user) {
        try { state.addresses = (await api("/api/addresses")).addresses || []; } catch (e) { /* ignore */ }
      }
    } catch (e) { /* ignore */ }
    try {
      await refreshPriced();
    } catch (e) {
      qs("#co-root").innerHTML = bannerHTML(escHtml(errText(apiErr(e).code)), "error") +
        '<p class="lx-center"><a class="lx-btn auto lx-btn-ghost" href="/cart.html">' +
        escHtml(tx("checkout.back_cart", "Back to cart")) + "</a></p>";
      applyShopperI18n();
      return;
    }
    render();
  }

  function cartQuery() {
    var q = new URLSearchParams();
    if (state.couponCode) q.set("coupon", state.couponCode);
    if (state.zoneId) q.set("zone_id", state.zoneId);
    var s = q.toString();
    return s ? "/api/cart?" + s : "/api/cart";
  }

  async function refreshPriced() {
    var d = await api(cartQuery());
    state.lines = d.lines || [];
    state.subtotal = d.subtotal || 0;
    state.discount = d.discount || 0;
    state.deliveryFee = d.deliveryFee || 0;
    state.total = d.total || 0;
    state.coupon = d.coupon || null;
    state.errors = d.errors || [];
  }

  function selectedZone() {
    return state.zones.find(function (z) { return String(z.id) === String(state.zoneId); }) || null;
  }

  /* ================= render ================= */
  function render() {
    var root = qs("#co-root");
    if (state.step === "proof") { renderProof(root); }
    else if (state.step === "done") { renderDone(root); }
    else { renderForm(root); }
    applyShopperI18n();
  }

  function renderForm(root) {
    if (!state.lines.length) {
      root.innerHTML = '<div class="lx-card lx-empty">' +
        '<div class="lx-big">🛒</div>' +
        '<h2>' + escHtml(tx("checkout.empty", "Your cart is empty")) + "</h2>" +
        '<p class="lx-mt"><a class="lx-btn auto" href="/cart.html">' + escHtml(tx("checkout.back_cart", "Back to cart")) + "</a></p></div>";
      return;
    }
    root.innerHTML =
      '<div id="co-banner"></div>' +
      '<div class="lx-grid-2">' +
        '<div>' +
          '<form id="co-form" novalidate>' +
            addressPickerHTML() +
            contactHTML() +
            paymentHTML() +
            couponBoxHTML() +
          "</form>" +
        "</div>" +
        '<div class="lx-sticky"><div class="lx-card" id="co-summary">' + summaryHTML() + "</div></div>" +
      "</div>";
    bindForm(root);
    prefillContact();
    restoreDraft(root);
  }

  function addressPickerHTML() {
    if (!state.addresses.length) return "";
    var opts = '<option value="">' + escHtml(tx("checkout.new_addr", "Enter a new address…")) + "</option>" +
      state.addresses.map(function (a) {
        return '<option value="' + a.id + '">' + escHtml(a.label || a.township) + " — " + escHtml(String(a.address_line || "").slice(0, 40)) + "</option>";
      }).join("");
    return '<div class="lx-card"><h3>' + escHtml(tx("checkout.saved_addr", "Saved addresses")) + "</h3>" +
      '<div class="lx-field"><select class="lx-select" id="co-addr">' + opts + "</select></div></div>";
  }

  function contactHTML() {
    return '<div class="lx-card"><h3>' + escHtml(tx("checkout.shipping", "Shipping details")) + "</h3>" +
      '<div class="lx-field"><label>' + escHtml(tx("checkout.name", "Full name")) + ' <span class="req">*</span></label>' +
        '<input class="lx-input" id="co-name" autocomplete="name"><div class="lx-err" data-err-for="name"></div></div>' +
      '<div class="lx-zone-grid">' +
        '<div class="lx-field"><label>' + escHtml(tx("checkout.phone", "Phone")) + ' <span class="req">*</span></label>' +
          '<input class="lx-input" id="co-phone" inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel"><div class="lx-err" data-err-for="phone"></div>' +
          '<div class="lx-hint">' + escHtml(tx("checkout.phone_hint", "Myanmar mobile number starting with 09.")) + "</div></div>" +
        '<div class="lx-field"><label>' + escHtml(tx("checkout.email", "Email")) + "</label>" +
          '<input class="lx-input" id="co-email" type="email" autocomplete="email"><div class="lx-err" data-err-for="email"></div></div>' +
      "</div>" +
      '<div class="lx-zone-grid">' +
        '<div class="lx-field"><label>' + escHtml(tx("checkout.zone", "Delivery zone")) + ' <span class="req">*</span></label>' +
          '<select class="lx-select" id="co-zone">' + zoneOptionsHTML() + '</select><div class="lx-err" data-err-for="zone_id"></div></div>' +
        '<div class="lx-field"><label>' + escHtml(tx("checkout.township", "Township")) + ' <span class="req">*</span></label>' +
          '<select class="lx-select" id="co-township">' + townshipOptionsHTML() + '</select><div class="lx-err" data-err-for="township"></div></div>' +
      "</div>" +
      (state.zones.length ? "" : bannerHTML(escHtml(tx("checkout.no_zones", "Delivery zones couldn't be loaded. Please refresh and try again.")), "error")) +
      '<div class="lx-field"><label>' + escHtml(tx("checkout.address", "Street address")) + ' <span class="req">*</span></label>' +
        '<textarea class="lx-textarea" id="co-address" rows="2" placeholder="' + escHtml(tx("checkout.address_ph", "House no., street, landmark…")) + '"></textarea><div class="lx-err" data-err-for="address_line"></div></div>' +
      '<div class="lx-zone-grid">' +
        '<div class="lx-field"><label>' + escHtml(tx("checkout.city", "City")) + " (" + escHtml(tx("common.optional", "optional")) + ")</label>" +
          '<input class="lx-input" id="co-city"></div>' +
        '<div class="lx-field"><label>' + escHtml(tx("checkout.notes", "Order notes")) + "</label>" +
          '<input class="lx-input" id="co-notes" placeholder="' + escHtml(tx("checkout.notes_ph", "Delivery instructions…")) + '"></div>' +
      "</div>" +
    "</div>";
  }

  function zoneOptionsHTML() {
    var opts = '<option value="">' + escHtml(tx("checkout.pick_zone", "Choose a zone…")) + "</option>";
    opts += state.zones.map(function (z) {
      return '<option value="' + z.id + '"' + (String(z.id) === String(state.zoneId) ? " selected" : "") + ">" +
        escHtml(zoneName(z)) + " · " + escHtml(mmk(z.fee)) + (z.cod_available ? "" : " · " + escHtml(tx("checkout.no_cod", "no COD"))) + "</option>";
    }).join("");
    return opts;
  }

  function townshipOptionsHTML() {
    var z = selectedZone();
    var opts = '<option value="">' + escHtml(tx("checkout.pick_township", "Choose a township…")) + "</option>";
    if (z) {
      opts += z.townships.map(function (t) {
        return '<option' + (t === state.township ? " selected" : "") + ">" + escHtml(t) + "</option>";
      }).join("");
    }
    return opts;
  }

  function paymentHTML() {
    var z = selectedZone();
    var cards = PAY_METHODS.map(function (m) {
      var noCod = m === "cod" && z && !z.cod_available;
      var desc = m === "cod"
        ? tx("pay.cod_desc", "Pay cash when your order arrives")
        : tx("pay.manual_desc", "Transfer first, then upload your payment screenshot");
      return '<label class="lx-pay' + (noCod ? " disabled" : "") + '" data-method="' + m + '">' +
        '<input type="radio" name="pay" value="' + m + '"' + (noCod ? " disabled" : "") + ">" +
        '<span class="lx-pay-ic" style="background:' + payMethodColor(m) + '">' + payMethodShort(m) + "</span>" +
        "<span><span class='lx-pay-name'>" + escHtml(payMethodLabel(m)) + "</span><br>" +
        '<span class="lx-pay-desc">' + escHtml(desc) + (noCod ? " — " + escHtml(tx("pay.no_cod_zone", "not available in this zone")) : "") + "</span></span>" +
      "</label>";
    }).join("");
    return '<div class="lx-card"><h3>' + escHtml(tx("checkout.payment", "Payment method")) + ' <span class="req" style="color:var(--lx-danger)">*</span></h3>' +
      '<div class="lx-pay-grid">' + cards + '</div><div class="lx-err" data-err-for="payment_method"></div></div>';
  }

  function couponBoxHTML() {
    var cErr = state.errors.find(function (e) { return !e.variant_id && /^coupon/.test(e.error || ""); });
    return '<div class="lx-card"><h3>' + escHtml(tx("cart.coupon", "Coupon code")) + "</h3>" +
      '<div class="lx-coupon"><input class="lx-input" id="co-coupon" placeholder="WELCOME10" value="' + escHtml(state.couponCode) + '" autocomplete="off">' +
      '<button type="button" class="lx-btn auto lx-btn-sm" id="co-coupon-apply">' + escHtml(tx("cart.apply", "Apply")) + "</button></div>" +
      (cErr ? '<div class="lx-err" style="display:block">' + escHtml(errText(cErr.error)) + "</div>" : "") +
      (state.coupon ? '<div class="lx-hint" style="color:var(--lx-ok)">✓ ' + escHtml(tx("cart.coupon_ok", "Coupon {code} applied.", { code: state.coupon.code })) + "</div>" : "") +
    "</div>";
  }

  function summaryHTML() {
    var h = "<h3>" + escHtml(tx("checkout.summary", "Order summary")) + "</h3>";
    h += state.lines.map(function (l) {
      return '<div class="lx-line"><div style="display:flex;gap:10px;align-items:center">' +
        artHTML(l.product_id, l.product_name) +
        "<div><div class='lx-line-name' style='font-size:.9rem'>" + escHtml(l.product_name) + "</div>" +
        '<div class="lx-line-var">' + escHtml(l.variant_name) + " · " + escHtml(l.size_ml) + " ml × " + l.qty + "</div></div></div>" +
        '<div class="lx-line-total" style="font-size:.95rem">' + escHtml(mmk(l.line_total)) + "</div></div>";
    }).join("");
    h += '<hr class="lx-div">';
    h += '<div class="lx-sum-row"><span>' + escHtml(tx("cart.subtotal", "Subtotal")) + "</span><span>" + escHtml(mmk(state.subtotal)) + "</span></div>";
    if (state.discount > 0) h += '<div class="lx-sum-row discount"><span>' + escHtml(tx("cart.discount", "Discount")) + "</span><span>− " + escHtml(mmk(state.discount)) + "</span></div>";
    h += '<div class="lx-sum-row"><span>' + escHtml(tx("cart.delivery_fee", "Delivery")) + "</span><span>" +
      (state.zoneId
        ? (state.deliveryFee === 0 ? '<span class="free">' + escHtml(tx("cart.free", "FREE")) + "</span>" : escHtml(mmk(state.deliveryFee)))
        : '<span class="lx-muted">—</span>') + "</span></div>";
    h += '<div class="lx-sum-row total"><span>' + escHtml(tx("cart.total", "Total")) + "</span><span>" + escHtml(mmk(state.total)) + "</span></div>";
    h += '<div class="lx-mt"><button class="lx-btn" id="co-submit" form="co-form">' + escHtml(tx("checkout.place", "Place order")) + "</button></div>";
    h += '<div class="lx-secure">🔒 ' + escHtml(tx("cart.secure", "Totals are calculated securely on our server.")) + "</div>";
    return h;
  }

  /* ================= bindings ================= */
  function bindForm(root) {
    var form = qs("#co-form", root);

    var addrSel = qs("#co-addr", root);
    if (addrSel) addrSel.addEventListener("change", function () { fillFromAddress(addrSel.value); });

    qs("#co-zone", root).addEventListener("change", async function (e) {
      saveDraft(root);
      state.zoneId = e.target.value;
      state.township = "";
      // re-render (payment-method COD availability depends on zone)
      await refreshPriced();
      render();
    });
    qs("#co-township", root).addEventListener("change", function (e) { state.township = e.target.value; });

    qsa(".lx-pay", root).forEach(function (el) {
      el.addEventListener("click", function () {
        if (el.classList.contains("disabled")) return;
        qsa(".lx-pay", root).forEach(function (x) { x.classList.remove("sel"); });
        el.classList.add("sel");
        state.payMethod = el.getAttribute("data-method");
        setFieldErr(root, "payment_method", "");
      });
    });

    qs("#co-coupon-apply", root).addEventListener("click", async function () {
      saveDraft(root);
      state.couponCode = qs("#co-coupon", root).value.trim().toUpperCase();
      try {
        if (state.couponCode) localStorage.setItem("pds_coupon", state.couponCode);
        else localStorage.removeItem("pds_coupon");
      } catch (e) { /* ignore */ }
      await refreshPriced();
      render();
    });

    form.addEventListener("submit", function (e) { e.preventDefault(); submitOrder(root); });
    qs("#co-submit", root).addEventListener("click", function (e) { e.preventDefault(); submitOrder(root); });
  }

  function prefillContact() {
    // Restore contact details the shopper typed before (guest-friendly).
    try {
      var c = JSON.parse(localStorage.getItem("pds_contact") || "{}");
      if (c.name) qs("#co-name").value = c.name;
      if (c.phone) qs("#co-phone").value = c.phone;
      if (c.email) qs("#co-email").value = c.email;
      if (c.address_line) qs("#co-address").value = c.address_line;
      if (c.city) qs("#co-city").value = c.city;
      if (c.notes) qs("#co-notes").value = c.notes;
    } catch (e) { /* ignore */ }
    if (state.user) {
      if (!qs("#co-name").value && state.user.name) qs("#co-name").value = state.user.name;
      if (!qs("#co-phone").value && state.user.phone) qs("#co-phone").value = state.user.phone;
      var def = state.addresses.find(function (a) { return a.is_default; }) || state.addresses[0];
      if (def) { qs("#co-addr").value = String(def.id); fillFromAddress(String(def.id)); }
    }
  }

  function fillFromAddress(id) {
    var a = state.addresses.find(function (x) { return String(x.id) === String(id); });
    if (!a) return;
    if (a.name) qs("#co-name").value = a.name;
    if (a.phone) qs("#co-phone").value = a.phone;
    if (a.address_line) qs("#co-address").value = a.address_line;
    if (a.city) qs("#co-city").value = a.city;
    if (a.notes) qs("#co-notes").value = a.notes;
    // Match address region to a zone when possible
    var match = state.zones.find(function (z) {
      return (z.townships || []).indexOf(a.township) !== -1 ||
        (z.region && a.region && z.region.toLowerCase() === String(a.region).toLowerCase());
    });
    if (match) {
      state.zoneId = String(match.id);
      qs("#co-zone").value = state.zoneId;
      state.township = (match.townships || []).indexOf(a.township) !== -1 ? a.township : "";
      qs("#co-township").innerHTML = townshipOptionsHTML();
    }
  }

  /* Draft preservation across re-renders (zone/coupon changes). */
  function saveDraft(root) {
    if (!root || !qs("#co-form", root)) return;
    var f = readForm(root);
    var as = qs("#co-addr", root);
    state.draft = {
      name: f.name, phone: f.phone, email: f.email,
      address_line: f.address_line, city: f.city, notes: f.notes,
      addr: as ? as.value : "", pay: state.payMethod
    };
  }
  function restoreDraft(root) {
    var d = state.draft;
    if (!d) return;
    var set = function (id, v) { var el = qs("#" + id, root); if (el && v) el.value = v; };
    set("co-name", d.name); set("co-phone", d.phone); set("co-email", d.email);
    set("co-address", d.address_line); set("co-city", d.city); set("co-notes", d.notes);
    if (d.addr) { var s = qs("#co-addr", root); if (s) s.value = d.addr; }
    if (d.pay) {
      var lab = qs('.lx-pay[data-method="' + d.pay + '"]', root);
      if (lab && !lab.classList.contains("disabled")) {
        lab.classList.add("sel");
        var r = qs('input[name="pay"]', lab);
        if (r) r.checked = true;
        state.payMethod = d.pay;
      }
    }
  }

  /* ================= submit ================= */
  function readForm(root) {
    return {
      name: qs("#co-name", root).value.trim(),
      phone: qs("#co-phone", root).value.trim(),
      email: qs("#co-email", root).value.trim(),
      address_line: qs("#co-address", root).value.trim(),
      city: qs("#co-city", root).value.trim(),
      notes: qs("#co-notes", root).value.trim(),
      address_id: (function () { var s = qs("#co-addr", root); return s && s.value ? s.value : undefined; })()
    };
  }

  function clientValidate(root, f) {
    clearFieldErrs(root);
    var ok = true;
    if (!f.name) { setFieldErr(root, "name", tx("v.required", "This field is required.")); ok = false; }
    if (!validMMPhone(f.phone)) {
      setFieldErr(root, "phone", tx("v.phone", "Enter a valid Myanmar mobile number (e.g. 09XXXXXXXXX)."));
      ok = false;
    }
    if (f.email && !validEmailLoose(f.email)) { setFieldErr(root, "email", tx("v.email", "Enter a valid email address.")); ok = false; }
    if (!state.zoneId) { setFieldErr(root, "zone_id", tx("v.required", "This field is required.")); ok = false; }
    if (!state.township) { setFieldErr(root, "township", tx("v.required", "This field is required.")); ok = false; }
    if (!f.address_line) { setFieldErr(root, "address_line", tx("v.required", "This field is required.")); ok = false; }
    if (!state.payMethod) { setFieldErr(root, "payment_method", tx("v.pay", "Please choose a payment method.")); ok = false; }
    return ok;
  }

  async function submitOrder(root) {
    var f = readForm(root);
    if (!clientValidate(root, f)) {
      qs("#co-banner", root).innerHTML = bannerHTML(escHtml(errText("validation")), "error");
      qs("#co-banner", root).scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    var z = selectedZone();
    var payload = {
      name: f.name,
      phone: f.phone,
      region: z ? z.region : "",
      township: state.township,
      address_line: f.address_line,
      payment_method: state.payMethod,
      zone_id: state.zoneId
    };
    if (f.email) payload.email = f.email;
    if (f.city) payload.city = f.city;
    if (f.notes) payload.notes = f.notes;
    if (state.couponCode) payload.coupon_code = state.couponCode;
    if (f.address_id) payload.address_id = f.address_id;

    var btn = qs("#co-submit", root);
    btn.disabled = true;
    btn.textContent = tx("checkout.placing", "Placing order…");
    try {
      var res = await api("/api/checkout", { method: "POST", body: payload });
      // remember contact for next time (guests too)
      try {
        localStorage.setItem("pds_contact", JSON.stringify({
          name: f.name, phone: f.phone, email: f.email,
          address_line: f.address_line, city: f.city, notes: f.notes
        }));
        localStorage.removeItem("pds_coupon");
        try { sessionStorage.setItem("pds_last_order", res.number); } catch (e2) { /* ignore */ }
      } catch (e) { /* ignore */ }
      try { updateCartBadge(); } catch (e2) { /* ignore */ }
      state.orderNumber = res.number;
      state.orderTotal = res.total;
      state.orderMethod = res.payment_method;
      if (res.payment_method === "cod") {
        state.step = "done";
      } else {
        state.step = "proof";
        try {
          var pi = await api("/api/checkout/payment-instructions?method=" + encodeURIComponent(res.payment_method));
          state.instruction = (pi && pi.instruction) || "";
        } catch (e2) { state.instruction = ""; }
      }
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      var ei = apiErr(e);
      btn.disabled = false;
      btn.textContent = tx("checkout.place", "Place order");
      if (ei.code === "validation" && ei.fields && Object.keys(ei.fields).length) {
        applyFieldErrs(root, ei.fields);
        qs("#co-banner", root).innerHTML = bannerHTML(escHtml(errText("validation")), "error");
      } else if (ei.code === "insufficient_stock" || ei.code === "insufficient_ml" || (ei.fields && ei.fields.items)) {
        qs("#co-banner", root).innerHTML = bannerHTML(
          "⚠ " + escHtml(tx("checkout.stock_changed", "Some items in your cart changed — please review your cart and try again.")) +
          ' <a class="lx-link" href="/cart.html">' + escHtml(tx("checkout.back_cart", "Back to cart")) + "</a>",
          "error");
        await refreshPriced();
      } else if (ei.code === "coupon_invalid" || ei.code === "coupon_used") {
        qs("#co-banner", root).innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
      } else {
        qs("#co-banner", root).innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
      }
      qs("#co-banner", root).scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /* ================= proof step ================= */
  function renderProof(root) {
    var instr = state.instruction
      ? state.instruction.split("\n").map(function (p) { return "<p>" + escHtml(p) + "</p>"; }).join("")
      : "<p class='lx-muted'>" + escHtml(tx("proof.no_instr", "Payment details will be confirmed by our team.")) + "</p>";
    root.innerHTML =
      '<div class="lx-card">' +
        bannerHTML("✓ " + tx("checkout.received", "Order {num} received!", { num: state.orderNumber }), "success") +
        "<h3>" + escHtml(tx("proof.pay_title", "Complete your payment")) + "</h3>" +
        '<div class="lx-sum-row"><span>' + escHtml(tx("proof.amount", "Amount to pay")) + '</span><span style="font-weight:700;font-family:var(--lx-serif)">' + escHtml(mmk(state.orderTotal)) + "</span></div>" +
        '<div class="lx-sum-row"><span>' + escHtml(tx("proof.method", "Method")) + "</span><span>" + escHtml(payMethodLabel(state.orderMethod)) + "</span></div>" +
        '<hr class="lx-div"><div class="lx-instr">' + instr + "</div>" +
      "</div>" +
      '<div class="lx-card" id="proof-card"></div>' +
      '<p class="lx-center lx-mt"><a class="lx-link" href="/order.html?number=' + encodeURIComponent(state.orderNumber) + '">' +
        escHtml(tx("proof.later", "I'll upload the proof later →")) + "</a></p>";
    mountProofForm(qs("#proof-card", root), state.orderNumber, {
      onSuccess: function () {
        setTimeout(function () { go("/order.html?number=" + encodeURIComponent(state.orderNumber)); }, 2200);
      }
    });
  }

  /* ================= done step (COD) ================= */
  function renderDone(root) {
    root.innerHTML =
      '<div class="lx-card lx-empty">' +
        '<div class="lx-big">🎉</div>' +
        "<h2>" + escHtml(tx("checkout.thanks", "Thank you for your order!")) + "</h2>" +
        "<p>" + escHtml(tx("checkout.order_no", "Order number")) + ': <strong class="lx-serif">' + escHtml(state.orderNumber) + "</strong></p>" +
        '<p class="lx-muted">' + escHtml(tx("checkout.cod_note", "Please prepare {amt} in cash for delivery.", { amt: mmk(state.orderTotal) })) + "</p>" +
        '<p class="lx-mt"><a class="lx-btn auto" href="/order.html?number=' + encodeURIComponent(state.orderNumber) + '">' +
          escHtml(tx("checkout.view_order", "View my order")) + "</a></p>" +
        '<p class="lx-hint">' + escHtml(tx("checkout.redirect", "Redirecting to your order…")) + "</p>" +
      "</div>";
    setTimeout(function () { go("/order.html?number=" + encodeURIComponent(state.orderNumber)); }, 4000);
  }
})();
