/* ============================================================
   account.js — Account page with tabs:
     profile   — PUT /api/auth/profile (name, phone, lang,
                 notif prefs) + change password
     addresses — GET/POST/PUT/DELETE /api/addresses (CRUD)
     favorites — GET /api/favorites grid + remove (toggle)
     reviews   — "my reviews" has no public API endpoint yet, so an
                 explanatory empty state is shown (see report).
   Shared: api(), t(), applyI18n(), toast() + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  var user = null;
  var tab = "profile";
  var addresses = [];
  var favorites = [];
  var editingAddr = null; // address object being edited, or "new"

  shopperBoot(init);

  async function init() {
    user = await requireLogin("/account.html");
    if (!user) return;
    var valid = ["profile", "addresses", "favorites", "reviews"];
    if (valid.indexOf(qp("tab")) !== -1) tab = qp("tab");
    qsa("#acct-tabs .lx-tab").forEach(function (b) {
      b.classList.toggle("sel", b.getAttribute("data-tab") === tab);
      b.addEventListener("click", function () {
        tab = b.getAttribute("data-tab");
        qsa("#acct-tabs .lx-tab").forEach(function (x) { x.classList.toggle("sel", x === b); });
        render();
      });
    });
    render();
  }

  async function render() {
    var root = qs("#acct-root");
    root.innerHTML = '<div class="lx-loading">' + escHtml(tx("common.loading", "Loading…")) + "</div>";
    try {
      if (tab === "profile") await renderProfile(root);
      else if (tab === "addresses") await renderAddresses(root);
      else if (tab === "favorites") await renderFavorites(root);
      else renderReviews(root);
    } catch (e) {
      var ei = apiErr(e);
      root.innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
    }
    applyShopperI18n();
    window.scrollTo({ top: 0 });
  }

  /* ================= profile ================= */
  async function renderProfile(root) {
    var me = await api("/api/auth/me");
    user = me.user;
    var lang = user.lang || pageLang();
    root.innerHTML =
      '<div class="lx-grid-2"><div>' +
      '<div class="lx-card"><h3>' + escHtml(tx("account.profile", "Profile")) + "</h3>" +
        '<div id="prof-banner"></div>' +
        '<form id="prof-form" novalidate>' +
        '<div class="lx-field"><label>' + escHtml(tx("account.name", "Name")) + ' <span class="req">*</span></label>' +
          '<input class="lx-input" id="prof-name" value="' + escHtml(user.name || "") + '"><div class="lx-err" data-err-for="name"></div></div>' +
        '<div class="lx-field"><label>' + escHtml(tx("account.email", "Email")) + "</label>" +
          '<input class="lx-input" value="' + escHtml(user.email || "") + '" disabled><div class="lx-hint">' +
          escHtml(tx("account.email_locked", "Email cannot be changed.")) + "</div></div>" +
        '<div class="lx-field"><label>' + escHtml(tx("account.phone", "Phone")) + "</label>" +
          '<input class="lx-input" id="prof-phone" value="' + escHtml(user.phone || "") + '" placeholder="09XXXXXXXXX"><div class="lx-err" data-err-for="phone"></div></div>' +
        '<div class="lx-field"><label>' + escHtml(tx("account.lang", "Language")) + "</label>" +
          '<select class="lx-select" id="prof-lang">' +
            '<option value="en"' + (lang === "en" ? " selected" : "") + ">English</option>" +
            '<option value="my"' + (lang === "my" ? " selected" : "") + ">မြန်မာ</option>" +
          "</select></div>" +
        '<label class="lx-check"><input type="checkbox" id="prof-n1"' + (user.notif_order_updates ? " checked" : "") + "> " +
          escHtml(tx("account.n_order", "Notify me about order updates")) + "</label>" +
        '<label class="lx-check"><input type="checkbox" id="prof-n2"' + (user.notif_promos ? " checked" : "") + "> " +
          escHtml(tx("account.n_promo", "Notify me about promotions")) + "</label>" +
        (user.email_verified ? "" : '<div class="lx-banner info">' + escHtml(tx("account.unverified", "Your email is not verified yet — please check your inbox.")) + "</div>") +
        '<button class="lx-btn" type="submit">' + escHtml(tx("account.save", "Save changes")) + "</button>" +
        "</form></div>" +
      "</div><div>" +
      '<div class="lx-card"><h3>' + escHtml(tx("account.pw_title", "Change password")) + "</h3>" +
        '<div id="pw-banner"></div>' +
        '<form id="pw-form" novalidate>' +
        '<div class="lx-field"><label>' + escHtml(tx("account.pw_cur", "Current password")) + "</label>" +
          '<input class="lx-input" id="pw-cur" type="password" autocomplete="current-password"><div class="lx-err" data-err-for="current"></div></div>' +
        '<div class="lx-field"><label>' + escHtml(tx("account.pw_new", "New password")) + "</label>" +
          '<input class="lx-input" id="pw-new" type="password" autocomplete="new-password"><div class="lx-err" data-err-for="new"></div>' +
          '<div class="lx-hint">' + escHtml(tx("account.pw_hint", "At least 6 characters.")) + "</div></div>" +
        '<button class="lx-btn lx-btn-ghost" type="submit">' + escHtml(tx("account.pw_save", "Update password")) + "</button>" +
        "</form></div>" +
      '<div class="lx-card"><button class="lx-btn lx-btn-danger" id="logout-btn">' + escHtml(tx("account.logout", "Log out")) + "</button></div>" +
      "</div></div>";

    qs("#prof-form", root).addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(root);
      var btn = qs("#prof-form .lx-btn", root);
      var newLang = qs("#prof-lang", root).value;
      var payload = {
        name: qs("#prof-name", root).value.trim(),
        phone: qs("#prof-phone", root).value.trim(),
        notif_order_updates: qs("#prof-n1", root).checked ? 1 : 0,
        notif_promos: qs("#prof-n2", root).checked ? 1 : 0
      };
      if (!payload.name) { setFieldErr(root, "name", tx("v.required", "This field is required.")); return; }
      if (payload.phone && !validMMPhone(payload.phone)) {
        setFieldErr(root, "phone", tx("v.phone", "Enter a valid Myanmar mobile number (e.g. 09XXXXXXXXX)."));
        return;
      }
      btn.disabled = true;
      try {
        var r = await api("/api/auth/profile", { method: "PUT", body: payload });
        user = r.user || user;
        // Apply language client-side (sibling setLang persists pds_lang,
        // re-renders i18n, and PUTs {lang} to the profile itself).
        setPageLang(newLang);
        qs("#prof-banner", root).innerHTML = bannerHTML("✓ " + escHtml(tx("account.saved", "Profile saved.")), "success");
        try { toastOk(tx("account.saved", "Profile saved.")); } catch (e2) {}
        setTimeout(function () { location.reload(); }, 900);
      } catch (err) {
        var ei = apiErr(err);
        if (ei.code === "validation" && ei.fields) applyFieldErrs(root, ei.fields);
        else qs("#prof-banner", root).innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
      }
      btn.disabled = false;
    });

    qs("#pw-form", root).addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(root);
      var cur = qs("#pw-cur", root).value;
      var nw = qs("#pw-new", root).value;
      if (!cur) { setFieldErr(root, "current", tx("v.required", "This field is required.")); return; }
      if (!nw || nw.length < 6) { setFieldErr(root, "new", tx("account.pw_hint", "At least 6 characters.")); return; }
      try {
        await api("/api/auth/change-password", { method: "POST", body: { current: cur, new: nw } });
        qs("#pw-banner", root).innerHTML = bannerHTML("✓ " + escHtml(tx("account.pw_done", "Password updated.")), "success");
        qs("#pw-cur", root).value = ""; qs("#pw-new", root).value = "";
      } catch (err) {
        var ei = apiErr(err);
        if (ei.code === "validation" && ei.fields) applyFieldErrs(root, ei.fields);
        else qs("#pw-banner", root).innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
      }
    });

    qs("#logout-btn", root).addEventListener("click", async function () {
      try { await api("/api/auth/logout", { method: "POST" }); } catch (e) { /* ignore */ }
      go("/");
    });
  }

  /* ================= addresses ================= */
  async function renderAddresses(root) {
    var d = await api("/api/addresses");
    addresses = d.addresses || [];
    var html = '<div class="lx-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      "<h3 style='margin:0'>" + escHtml(tx("account.addresses", "Addresses")) + "</h3>" +
      '<button class="lx-btn auto lx-btn-sm" id="addr-add">+ ' + escHtml(tx("account.addr_add", "Add address")) + "</button></div>" +
      '<div id="addr-list">';
    if (!addresses.length) {
      html += '<p class="lx-muted">' + escHtml(tx("account.addr_empty", "No saved addresses yet.")) + "</p>";
    } else {
      html += addresses.map(addrRowHTML).join("");
    }
    html += "</div></div>" + '<div id="addr-form-slot"></div>';
    root.innerHTML = html;

    qs("#addr-add", root).addEventListener("click", function () {
      editingAddr = "new";
      renderAddrForm(root);
    });
    qsa("[data-addr-edit]", root).forEach(function (b) {
      b.addEventListener("click", function () {
        editingAddr = addresses.find(function (a) { return String(a.id) === b.getAttribute("data-addr-edit"); });
        renderAddrForm(root);
      });
    });
    qsa("[data-addr-del]", root).forEach(function (b) {
      b.addEventListener("click", async function () {
        if (!window.confirm(tx("account.addr_del_confirm", "Delete this address?"))) return;
        try {
          await api("/api/addresses/" + encodeURIComponent(b.getAttribute("data-addr-del")), { method: "DELETE" });
          render();
        } catch (e) { toastSafe(errText(apiErr(e).code), "error"); }
      });
    });
  }

  function addrRowHTML(a) {
    return '<div class="lx-addr"><div>' +
      "<div><strong>" + escHtml(a.label || tx("account.addr", "Address")) + "</strong> " +
      (a.is_default ? '<span class="lx-badge">' + escHtml(tx("account.default", "Default")) + "</span>" : "") + "</div>" +
      '<div class="lx-muted" style="font-size:.88rem;margin-top:4px">' +
        escHtml(a.name || "") + (a.phone ? " · " + escHtml(a.phone) : "") + "<br>" +
        escHtml([a.address_line, a.township, a.city, a.region].filter(Boolean).join(", ")) +
      "</div></div>" +
      '<div class="lx-addr-actions">' +
        '<button class="lx-mini-btn" data-addr-edit="' + a.id + '">' + escHtml(tx("common.edit", "Edit")) + "</button>" +
        '<button class="lx-mini-btn danger" data-addr-del="' + a.id + '">' + escHtml(tx("common.delete", "Delete")) + "</button>" +
      "</div></div>";
  }

  function renderAddrForm(root) {
    var a = editingAddr === "new" ? {} : (editingAddr || {});
    var slot = qs("#addr-form-slot", root);
    var F = function (id, label, val, req, ph) {
      return '<div class="lx-field"><label>' + escHtml(label) + (req ? ' <span class="req">*</span>' : "") + "</label>" +
        '<input class="lx-input" id="af-' + id + '" value="' + escHtml(val || "") + '"' + (ph ? ' placeholder="' + escHtml(ph) + '"' : "") + ">" +
        '<div class="lx-err" data-err-for="' + id + '"></div></div>';
    };
    slot.innerHTML = '<div class="lx-card"><h3>' +
      escHtml(editingAddr === "new" ? tx("account.addr_add", "Add address") : tx("account.addr_edit", "Edit address")) + "</h3>" +
      '<form id="addr-form" novalidate>' +
      F("label", tx("account.addr_label", "Label (e.g. Home, Office)"), a.label, false, "Home") +
      F("name", tx("checkout.name", "Full name"), a.name || user.name, true) +
      F("phone", tx("checkout.phone", "Phone"), a.phone || user.phone, true, "09XXXXXXXXX") +
      '<div class="lx-zone-grid">' +
        F("region", tx("account.region", "Region / State"), a.region, true, "Yangon") +
        F("city", tx("checkout.city", "City"), a.city, false) +
      "</div>" +
      '<div class="lx-zone-grid">' +
        F("township", tx("checkout.township", "Township"), a.township, true) +
        F("notes", tx("checkout.notes", "Notes"), a.notes, false) +
      "</div>" +
      F("address_line", tx("checkout.address", "Street address"), a.address_line, true) +
      '<label class="lx-check"><input type="checkbox" id="af-is_default"' + (a.is_default ? " checked" : "") + "> " +
        escHtml(tx("account.set_default", "Set as default address")) + "</label>" +
      '<div class="lx-btn-row"><button class="lx-btn" type="submit">' + escHtml(tx("common.save", "Save")) + "</button>" +
      '<button class="lx-btn lx-btn-ghost" type="button" id="af-cancel">' + escHtml(tx("common.cancel", "Cancel")) + "</button></div>" +
      "</form></div>";
    slot.scrollIntoView({ behavior: "smooth", block: "center" });

    qs("#af-cancel", slot).addEventListener("click", function () { editingAddr = null; slot.innerHTML = ""; });
    qs("#addr-form", slot).addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(slot);
      var payload = {
        label: qs("#af-label", slot).value.trim(),
        name: qs("#af-name", slot).value.trim(),
        phone: qs("#af-phone", slot).value.trim(),
        region: qs("#af-region", slot).value.trim(),
        city: qs("#af-city", slot).value.trim(),
        township: qs("#af-township", slot).value.trim(),
        address_line: qs("#af-address_line", slot).value.trim(),
        notes: qs("#af-notes", slot).value.trim(),
        is_default: qs("#af-is_default", slot).checked ? 1 : 0
      };
      var ok = true;
      ["name", "region", "township", "address_line"].forEach(function (k) {
        if (!payload[k]) { setFieldErr(slot, k, tx("v.required", "This field is required.")); ok = false; }
      });
      if (payload.phone && !validMMPhone(payload.phone)) {
        setFieldErr(slot, "phone", tx("v.phone", "Enter a valid Myanmar mobile number (e.g. 09XXXXXXXXX)."));
        ok = false;
      }
      if (!ok) return;
      try {
        if (editingAddr === "new") await api("/api/addresses", { method: "POST", body: payload });
        else await api("/api/addresses/" + encodeURIComponent(editingAddr.id), { method: "PUT", body: payload });
        toastSafe(tx("account.addr_saved", "Address saved."), "success");
        editingAddr = null;
        render();
      } catch (err) {
        var ei = apiErr(err);
        if (ei.code === "validation" && ei.fields) applyFieldErrs(slot, ei.fields);
        else toastSafe(errText(ei.code), "error");
      }
    });
  }

  /* ================= favorites ================= */
  async function renderFavorites(root) {
    var d = await api("/api/favorites");
    favorites = d.items || [];
    if (!favorites.length) {
      root.innerHTML = '<div class="lx-card lx-empty">' +
        '<div class="lx-big">♡</div>' +
        "<h2>" + escHtml(tx("account.fav_empty", "No favorites yet")) + "</h2>" +
        '<p class="lx-muted">' + escHtml(tx("account.fav_hint", "Tap the heart on any perfume to save it here.")) + "</p>" +
        '<p class="lx-mt"><a class="lx-btn auto" href="/">' + escHtml(tx("cart.shop", "Continue shopping")) + "</a></p></div>";
      return;
    }
    root.innerHTML = '<div class="lx-fav-grid">' + favorites.map(function (p) {
      var price = p.min_price != null
        ? (p.min_price === p.max_price ? mmk(p.min_price) : mmk(p.min_price) + " – " + mmk(p.max_price))
        : "";
      return '<div class="lx-card lx-fav-card">' +
        '<a href="/product.html?slug=' + encodeURIComponent(p.slug) + '" style="text-decoration:none;color:inherit">' +
        (typeof productVisual === "function"
          ? productVisual(p, artHTML(p.art_seed || p.id, p.name, "lg"))
          : artHTML(p.art_seed || p.id, p.name, "lg")) +
        '<div class="lx-fav-brand">' + escHtml(p.brand || "") + "</div>" +
        '<div class="lx-fav-name">' + escHtml(p.name) + "</div>" +
        '<div class="lx-fav-price">' + escHtml(price) + "</div></a>" +
        '<button class="lx-mini-btn danger lx-fav-x" data-fav-del="' + p.id + '">♡ ' + escHtml(tx("account.fav_remove", "Remove")) + "</button>" +
      "</div>";
    }).join("") + "</div>";
    qsa("[data-fav-del]", root).forEach(function (b) {
      b.addEventListener("click", async function () {
        try {
          await api("/api/favorites/" + encodeURIComponent(b.getAttribute("data-fav-del")), { method: "DELETE" });
          render();
        } catch (e) { toastSafe(errText(apiErr(e).code), "error"); }
      });
    });
  }

  /* ================= reviews ================= */
  function renderReviews(root) {
    // NOTE: the API contract exposes product reviews and review creation,
    // but no "my reviews" listing endpoint. Show an honest empty state.
    root.innerHTML = '<div class="lx-card lx-empty">' +
      '<div class="lx-big">✎</div>' +
      "<h2>" + escHtml(tx("account.reviews", "My Reviews")) + "</h2>" +
      '<p class="lx-muted">' + escHtml(tx("account.rev_hint", "Reviews you write appear on each perfume's page. After a delivered order, your reviews are marked as verified.")) + "</p>" +
      '<p class="lx-mt"><a class="lx-btn auto" href="/orders.html">' + escHtml(tx("account.rev_orders", "View my orders")) + "</a></p></div>";
  }

  function toastSafe(msg, type) { if (type === "error") toastErr(msg); else toastOk(msg); }
})();
