/* ============================================================
   shopper.js — shared client helpers for the shopper flow
   (cart / checkout / orders / account / auth / track / policies).

   Depends on sibling-built shared helpers (available at runtime):
     api(method, url, body)      -> resolves with `data`, rejects
                                    with {error, fieldErrors?} on failure
     fmtMMK(n)                   -> "25,000"
     t(key, params?)             -> translated string (key if missing)
     applyI18n()                 -> translates [data-i18n] in DOM
     perfumeArt(seed)            -> artwork (HTML string, CSS gradient,
                                    or image URL — all handled)
     toast(msg, type?)           -> toast notification
     updateCartBadge(count?)     -> refresh header cart badge
   Plus header/footer injection into #site-header / #site-footer.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- DOM ---------- */
  window.qs = function (s, r) { return (r || document).querySelector(s); };
  window.qsa = function (s, r) { return Array.from((r || document).querySelectorAll(s)); };
  window.escHtml = function (s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  window.go = function (u) { location.href = u; };
  window.qp = function (k) { return new URLSearchParams(location.search).get(k); };

  /* ---------- language ----------
     The sibling i18n module owns the language (localStorage `pds_lang`,
     exposed via currentLang()/setLang()). pageLang() reads it first. */
  window.pageLang = function () {
    try {
      if (typeof currentLang === "function") {
        var c = currentLang();
        if (c === "my" || c === "en") return c;
      }
    } catch (e) { /* ignore */ }
    var h = (document.documentElement.lang || "").toLowerCase();
    if (h === "my" || h === "en") return h;
    try {
      var l = localStorage.getItem("pds_lang");
      if (l === "my" || l === "en") return l;
    } catch (e2) { /* ignore */ }
    return "en";
  };
  window.setPageLang = function (lang) {
    // Sibling setLang() persists pds_lang, re-applies i18n, and PUTs
    // /api/auth/profile {lang} when logged in.
    try {
      if (typeof setLang === "function") { setLang(lang); return; }
    } catch (e) { /* ignore */ }
    try { localStorage.setItem("pds_lang", lang); } catch (e2) { /* ignore */ }
  };


  /* ---------- page boot ----------
     Calls the sibling initChrome() (header/footer injection, promo bar,
     cart badge) then the page's own init. */
  window.shopperBoot = function (init) {
    document.addEventListener("DOMContentLoaded", function () {
      try { initChrome(); } catch (e) { /* chrome optional */ }
      init();
    });
  };

  /* ---------- translate ----------
     1) sibling t() (covers the merged shopper-i18n.js dictionary),
     2) local LX_I18N fallback, 3) supplied English fallback. */
  window.tx = function (key, fallback, params) {
    var s = null;
    try { s = t(key, params); } catch (e) { /* shared i18n not ready */ }
    if (typeof s === "string" && s && s !== key) return s;
    var d = (typeof window.LX_I18N !== "undefined") ? window.LX_I18N : null;
    var lang = pageLang();
    var l = (d && d[lang] && d[lang][key] != null) ? d[lang][key]
      : (d && d.en && d.en[key] != null ? d.en[key] : null);
    if (l == null) l = (fallback != null ? String(fallback) : key);
    if (params && typeof l === "string") {
      l = l.replace(/\{(\w+)\}/g, function (m, k) {
        return params[k] != null ? params[k] : m;
      });
    }
    return l;
  };

  /* Runs the sibling applyI18n(), then repairs any [data-i18n] element
     the shared dictionary didn't know (merge unavailable / key gap). */
  window.applyShopperI18n = function (root) {
    try { applyI18n(root); } catch (e) { /* ignore */ }
    qsa("[data-i18n]", root || document).forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      if (key && el.textContent === key) {
        var s = tx(key, null);
        if (s && s !== key) el.textContent = s;
      }
    });
  };

  /* ---------- money ----------
     Sibling fmtMMK() already appends the localized currency. */
  window.mmk = function (n) { return fmtMMK(n); };

  /* ---------- toast ----------
     Sibling toast(msg, isErr): second arg is a boolean. */
  window.toastOk = function (msg) { try { toast(msg); } catch (e) { /* ignore */ } };
  window.toastErr = function (msg) { try { toast(msg, true); } catch (e) { /* ignore */ } };

  /* ---------- perfume artwork ----------
     Sibling perfumeArt(seed, label) returns an SVG string; the adapter
     also tolerates a CSS gradient or image URL. */
  window.artHTML = function (seed, label, cls) {
    var clsAttr = "lx-art" + (cls ? " " + cls : "");
    try {
      var out = perfumeArt(String(seed ?? "p"), label);
      if (typeof out === "string") {
        var o = out.trim();
        if (o.charAt(0) === "<") return '<span class="' + clsAttr + '">' + o + "</span>";
        if (/^(url\(|linear-gradient|radial-gradient)/.test(o)) {
          return '<span class="' + clsAttr + '" style="background:' + escHtml(o) + '"></span>';
        }
        if (o) return '<img class="' + clsAttr + '" src="' + escHtml(o) + '" alt="" loading="lazy">';
      }
    } catch (e) { /* fall through to default */ }
    return '<span class="' + clsAttr + '"></span>';
  };

  /* ---------- API errors ----------
     Sibling api() throws Error with .code / .fieldErrors. errText()
     delegates to the sibling apiErrorMessage() for EN+MM messages. */
  window.apiErr = function (e) {
    if (e && typeof e === "object") {
      if (e.error || e.code) {
        return {
          code: e.error || e.code,
          fields: e.fieldErrors || e.fields || {},
          message: e.message || ""
        };
      }
      // Native Error (e.g. fetch TypeError on offline) -> network error.
      return { code: "network", fields: {}, message: e.message || String(e) };
    }
    return { code: "network", fields: {}, message: String(e) };
  };
  window.errText = function (code) {
    try {
      if (typeof apiErrorMessage === "function") return apiErrorMessage({ code: code });
    } catch (e) { /* ignore */ }
    return String(code);
  };

  /* ---------- multipart POST (payment proof) ----------
     Sibling api() passes FormData through untouched. */
  window.postFormData = function (url, fd) {
    return api(url, { method: "POST", body: fd });
  };

  /* ---------- validators ---------- */
  window.validMMPhone = function (p) {
    var d = String(p || "").replace(/[\s-]/g, "");
    return /^(09\d{7,9}|\+959\d{7,9})$/.test(d);
  };
  window.validEmailLoose = function (e) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(String(e || "").trim());
  };

  /* ---------- labels ---------- */
  var ORDER_STATUS = {
    pending_payment: ["Awaiting payment", "ငွေပေးချေရန်စောင့်ဆိုင်းနေပါသည်"],
    payment_verification: ["Verifying payment", "ငွေပေးချေမှုစစ်ဆေးနေပါသည်"],
    confirmed: ["Confirmed", "အတည်ပြုပြီးပါပြီ"],
    preparing: ["Preparing", "ပြင်ဆင်နေပါသည်"],
    packed: ["Packed", "ထုပ်ပိုးပြီးပါပြီ"],
    shipped: ["Shipped", "ပို့ဆောင်လိုက်ပါပြီ"],
    delivered: ["Delivered", "လက်ခံရရှိပြီးပါပြီ"],
    cancelled: ["Cancelled", "ပယ်ဖျက်လိုက်ပါပြီ"],
    refunded: ["Refunded", "ငွေပြန်အမ်းပြီးပါပြီ"]
  };
  window.orderStatusLabel = function (s) {
    var e = ORDER_STATUS[s];
    if (!e) return String(s);
    return pageLang() === "my" ? e[1] : e[0];
  };
  var PAY_STATUS = {
    pending: ["Pending", "စောင့်ဆိုင်းနေသည်"],
    proof_submitted: ["Proof submitted", "အထောက်အထားတင်ပြီးပါပြီ"],
    under_review: ["Under review", "စစ်ဆေးနေပါသည်"],
    paid: ["Paid", "ငွေပေးချေပြီးပါပြီ"],
    failed: ["Failed", "မအောင်မြင်ပါ"],
    refunded: ["Refunded", "ငွေပြန်အမ်းပြီးပါပြီ"],
    partially_refunded: ["Partially refunded", "တစ်စိတ်တစ်ပိုင်းပြန်အမ်းပြီးပါပြီ"]
  };
  window.payStatusLabel = function (s) {
    var e = PAY_STATUS[s];
    if (!e) return String(s);
    return pageLang() === "my" ? e[1] : e[0];
  };
  window.payMethodLabel = function (m) {
    var map = {
      kbzpay: "KBZPay",
      wavepay: "WavePay",
      ayapay: "AYA Pay",
      bank: pageLang() === "my" ? "ဘဏ်လွှဲ" : "Bank transfer",
      cod: pageLang() === "my" ? "ငွေသားဖြင့်ပေးချေမည်" : "Cash on delivery"
    };
    return map[m] || String(m);
  };
  window.payMethodColor = function (m) {
    return { kbzpay: "#1b4ed8", wavepay: "#d99a00", ayapay: "#d8232a", bank: "#5b6b7a", cod: "#2e7d32" }[m] || "#8a6d3b";
  };
  window.payMethodShort = function (m) {
    return { kbzpay: "K", wavepay: "W", ayapay: "A", bank: "B", cod: "₭" }[m] || "•";
  };

  /* Date/time formatting: use the sibling fmtDateTime()/fmtDate()
     (locale-aware via currentLang()). */

  /* ---------- delivery zones (public list) ----------
     NOTE: GET /api/zones is assumed (active zones with townships).
     Falls back to [] so pages still render without it. */
  var zonesCache = null;
  window.loadZones = async function (force) {
    if (zonesCache && !force) return zonesCache;
    try {
      var d = await api("/api/zones");
      var list = (d && (d.zones || d.items)) || [];
      zonesCache = list.map(function (z) {
        var t = z.townships;
        if (typeof t === "string") { try { t = JSON.parse(t); } catch (e) { t = []; } }
        z.townships = Array.isArray(t) ? t : [];
        return z;
      });
    } catch (e) { zonesCache = []; }
    return zonesCache;
  };
  window.zoneName = function (z) {
    if (!z) return "";
    return pageLang() === "my" && z.name_my ? z.name_my : z.name;
  };

  /* ---------- auth guard ---------- */
  window.requireLogin = async function (nextUrl) {
    try {
      var me = await api("/api/auth/me");
      if (me && me.user) return me.user;
    } catch (e) { /* ignore */ }
    var nx = nextUrl || (location.pathname + location.search);
    go("/login.html?next=" + encodeURIComponent(nx));
    return null;
  };
  window.safeNext = function (fallback) {
    var n = qp("next");
    if (n && n.charAt(0) === "/" && n.charAt(1) !== "/") return n;
    return fallback || "/";
  };

  /* ---------- form helpers ---------- */
  window.setFieldErr = function (root, name, msg) {
    var el = qs('[data-err-for="' + name + '"]', root || document);
    if (el) { el.textContent = msg || ""; el.style.display = msg ? "block" : "none"; }
  };
  window.clearFieldErrs = function (root) {
    qsa("[data-err-for]", root || document).forEach(function (el) {
      el.textContent = ""; el.style.display = "none";
    });
  };
  window.applyFieldErrs = function (root, fields) {
    Object.keys(fields || {}).forEach(function (k) {
      setFieldErr(root, k, fields[k]);
    });
  };
  window.bannerHTML = function (msg, type) {
    if (!msg) return "";
    return '<div class="lx-banner ' + (type || "") + '">' + msg + "</div>";
  };

  /* ---------- order status timeline ----------
     Renders the fixed fulfillment pipeline with the current status
     highlighted; appends any explicit timeline entries from the API. */
  window.statusTimelineHTML = function (status, timeline) {
    var FLOW = ["pending_payment", "payment_verification", "confirmed", "preparing", "packed", "shipped", "delivered"];
    var html = "";
    if (status === "cancelled" || status === "refunded") {
      html += '<div class="lx-timeline-note"><strong>' + escHtml(orderStatusLabel(status)) + "</strong></div>";
    } else {
      var idx = FLOW.indexOf(status);
      html += '<div class="lx-timeline">' + FLOW.map(function (s, i) {
        var cls = "lx-step" + (i < idx ? " done" : "") + (i === idx ? " now" : "");
        return '<div class="' + cls + '"><span class="lx-dot"></span><span>' + escHtml(orderStatusLabel(s)) + "</span></div>";
      }).join("") + "</div>";
    }
    if (Array.isArray(timeline) && timeline.length) {
      html += '<div class="lx-tl-extra">' + timeline.map(function (e) {
        var at = e.at || e.created_at || e.time || e.timestamp;
        var label = e.label || e.title || e.note || (e.status ? orderStatusLabel(e.status) : "");
        return '<div class="lx-tl-row"><span>' + escHtml(label) + '</span><span class="lx-muted">' + escHtml(fmtDateTime(at)) + "</span></div>";
      }).join("") + "</div>";
    }
    return html;
  };

  /* ---------- payment-proof upload form ----------
     Mounts txn_ref + screenshot inputs; posts multipart to
     POST /api/checkout/:number/payment-proof. */
  window.mountProofForm = function (rootEl, orderNumber, opts) {
    opts = opts || {};
    rootEl.innerHTML =
      '<h3>' + escHtml(tx("proof.title", "Submit payment proof")) + "</h3>" +
      '<p class="lx-muted" style="font-size:.88rem;margin:-6px 0 12px">' +
        escHtml(tx("proof.hint", "Enter the transaction reference from your payment app and upload a screenshot of the receipt.")) +
      "</p>" +
      '<div id="proof-banner"></div>' +
      '<div class="lx-field"><label>' + escHtml(tx("proof.txn", "Transaction reference")) + ' <span class="req">*</span></label>' +
      '<input class="lx-input" id="proof-txn" placeholder="e.g. 0012345678" autocomplete="off">' +
      '<div class="lx-err" data-err-for="txn_ref"></div></div>' +
      '<div class="lx-field"><label>' + escHtml(tx("proof.phone", "Order phone number")) + ' <span class="req">*</span></label>' +
      '<input class="lx-input" id="proof-phone" inputmode="tel" placeholder="09XXXXXXXXX" autocomplete="tel">' +
      '<div class="lx-hint">' + escHtml(tx("proof.phone_hint", "The phone number used when placing this order.")) + "</div>" +
      '<div class="lx-err" data-err-for="phone"></div></div>' +
      '<div class="lx-field"><label>' + escHtml(tx("proof.shot", "Payment screenshot")) + ' <span class="req">*</span></label>' +
      '<input class="lx-input lx-file" id="proof-file" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp">' +
      '<div class="lx-hint">JPG / PNG / WebP, ' + escHtml(tx("proof.max", "max 5 MB")) + "</div>" +
      '<div class="lx-err" data-err-for="screenshot"></div></div>' +
      '<button class="lx-btn" id="proof-submit">' + escHtml(tx("proof.submit", "Submit proof")) + "</button>";

    qs("#proof-submit", rootEl).addEventListener("click", async function () {
      clearFieldErrs(rootEl);
      qs("#proof-banner", rootEl).innerHTML = "";
      var txn = qs("#proof-txn", rootEl).value.trim();
      var phone = qs("#proof-phone", rootEl).value.trim();
      var file = qs("#proof-file", rootEl).files[0];
      var bad = false;
      if (!txn) { setFieldErr(rootEl, "txn_ref", tx("proof.txn_req", "Transaction reference is required.")); bad = true; }
      if (!phone) { setFieldErr(rootEl, "phone", tx("proof.phone_req", "Phone number is required.")); bad = true; }
      else if (!validMMPhone(phone)) { setFieldErr(rootEl, "phone", tx("v.phone", "Enter a valid Myanmar mobile number (e.g. 09XXXXXXXXX).")); bad = true; }
      if (!file) { setFieldErr(rootEl, "screenshot", tx("proof.shot_req", "Please attach a screenshot.")); bad = true; }
      else if (file.size > 5 * 1024 * 1024) { setFieldErr(rootEl, "screenshot", tx("proof.too_big", "File must be 5 MB or smaller.")); bad = true; }
      if (bad) return;
      var btn = qs("#proof-submit", rootEl);
      btn.disabled = true;
      btn.textContent = tx("common.sending", "Sending…");
      try {
        var fd = new FormData();
        fd.append("txn_ref", txn);
        fd.append("phone", phone);
        fd.append("screenshot", file);
        await postFormData("/api/checkout/" + encodeURIComponent(orderNumber) + "/payment-proof", fd);
        rootEl.innerHTML = bannerHTML(
          "✓ " + tx("proof.done", "Payment proof submitted! We will verify it shortly and confirm your order."),
          "success"
        );
        try { toastOk(tx("proof.done", "Payment proof submitted!")); } catch (e) {}
        if (opts.onSuccess) opts.onSuccess();
      } catch (e) {
        var ei = apiErr(e);
        if (ei.code === "validation" && ei.fields) applyFieldErrs(rootEl, ei.fields);
        else qs("#proof-banner", rootEl).innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
        btn.disabled = false;
        btn.textContent = tx("proof.submit", "Submit proof");
      }
    });
  };
})();
