/* ============================================================
   policies.js — Renders CMS content pages.
   GET /api/content/:key for keys: authenticity, delivery,
   returns, faq, contact. ?key= deep-links; language-aware
   (body_my when page lang is Myanmar).
   Shared: api(), t(), applyI18n() + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  var KEYS = [
    ["authenticity", "pol.authenticity", "Authenticity"],
    ["delivery", "pol.delivery", "Delivery"],
    ["returns", "pol.returns", "Returns & Refunds"],
    ["faq", "pol.faq", "FAQ"],
    ["contact", "pol.contact", "Contact Us"]
  ];

  shopperBoot(init);

  async function init() {
    var nav = qs("#pol-nav");
    nav.innerHTML = KEYS.map(function (k) {
      return '<button class="lx-tab" data-key="' + k[0] + '">' + escHtml(tx(k[1], k[2])) + "</button>";
    }).join("");
    qsa(".lx-tab", nav).forEach(function (b) {
      b.addEventListener("click", function () { load(b.getAttribute("data-key"), true); });
    });
    var start = qp("key");
    var valid = KEYS.some(function (k) { return k[0] === start; });
    load(valid ? start : "delivery", false);
    applyShopperI18n();
  }

  async function load(key, push) {
    qsa("#pol-nav .lx-tab").forEach(function (b) {
      b.classList.toggle("sel", b.getAttribute("data-key") === key);
    });
    if (push) {
      try {
        var u = new URL(location.href);
        u.searchParams.set("key", key);
        history.replaceState(null, "", u.pathname + u.search);
      } catch (e) { /* ignore */ }
    }
    var root = qs("#pol-root");
    root.innerHTML = '<div class="lx-loading">' + escHtml(tx("common.loading", "Loading…")) + "</div>";
    try {
      var d = await api("/api/content/" + encodeURIComponent(key));
      var c = d.content || d;
      var lang = pageLang();
      var title = (lang === "my" && c.title_my) || c.title || key;
      var body = (lang === "my" && (c.body_my || c.body)) || c.body_en || c.body || "";
      var paras = String(body).split(/\n{2,}/).map(function (p) {
        return "<p>" + escHtml(p).replace(/\n/g, "<br>") + "</p>";
      }).join("");
      root.innerHTML = '<h2 class="lx-serif" style="margin-top:0">' + escHtml(title) + '</h2><div class="lx-pol-body">' + paras + "</div>";
    } catch (e) {
      var ei = apiErr(e);
      root.innerHTML = bannerHTML(escHtml(errText(ei.code)), "error");
    }
    applyShopperI18n();
  }
})();
