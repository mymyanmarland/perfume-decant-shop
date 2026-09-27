/* ============================================================
   track.js — Guest order tracking.
   GET /api/orders/track?number=&phone= (public, number+phone match).
   Shared: api(), t(), applyI18n() + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    try { initChrome(); } catch (e0) { /* chrome optional */ }
    qs("#track-form").addEventListener("submit", onSubmit);
    applyShopperI18n();
  });

  async function onSubmit(e) {
    e.preventDefault();
    var root = qs("#track-result");
    clearFieldErrs(document);
    var number = qs("#track-number").value.trim();
    var phone = qs("#track-phone").value.trim();
    var ok = true;
    if (!number) { setFieldErr(document, "number", tx("v.required", "This field is required.")); ok = false; }
    if (!validMMPhone(phone)) {
      setFieldErr(document, "phone", tx("v.phone", "Enter a valid Myanmar mobile number (e.g. 09XXXXXXXXX)."));
      ok = false;
    }
    if (!ok) return;
    root.innerHTML = '<div class="lx-loading">' + escHtml(tx("common.loading", "Loading…")) + "</div>";
    try {
      var d = await api("/api/orders/track?number=" + encodeURIComponent(number) +
        "&phone=" + encodeURIComponent(phone));
      renderResult(root, d.order || d, phone);
    } catch (err) {
      var ei = apiErr(err);
      root.innerHTML = bannerHTML(
        ei.code === "not_found"
          ? escHtml(tx("track.not_found", "No order matches that number and phone. Please check and try again."))
          : escHtml(errText(ei.code)),
        "error");
    }
    applyShopperI18n();
  }

  var CANCELLABLE = ["pending_payment", "payment_verification", "confirmed"];

  function renderResult(root, o, phone) {
    if (!o || !o.number) {
      root.innerHTML = bannerHTML(escHtml(tx("track.not_found", "No order matches that number and phone. Please check and try again.")), "error");
      return;
    }
    var canCancel = CANCELLABLE.indexOf(o.status) >= 0;
    var needProof = o.status === "pending_payment" || o.status === "payment_verification";
    var html = '<div class="lx-card">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">' +
        "<strong class='lx-serif'>" + escHtml(o.number) + "</strong>" +
        '<span class="lx-badge st-' + escHtml(o.status) + '">' + escHtml(orderStatusLabel(o.status)) + "</span></div>" +
      statusTimelineHTML(o.status, o.timeline) +
      '<hr class="lx-div">' +
      '<div class="lx-sum-row"><span>' + escHtml(tx("track.total", "Total")) + "</span><span><strong>" + escHtml(mmk(o.total)) + "</strong></span></div>" +
      (o.payment_status
        ? '<div class="lx-sum-row"><span>' + escHtml(tx("order.pay_status", "Payment")) + '</span><span class="lx-badge ps-' + escHtml(o.payment_status) + '">' +
          escHtml(payStatusLabel(o.payment_status)) + "</span></div>"
        : "") +
      (o.item_count != null || (o.items && o.items.length)
        ? '<div class="lx-sum-row"><span>' + escHtml(tx("order.items", "Items")) + "</span><span>" + escHtml(String(o.item_count != null ? o.item_count : o.items.length)) + "</span></div>"
        : "") +
      (canCancel
        ? '<div class="lx-center lx-mt"><button class="lx-btn lx-btn-danger" id="track-cancel">' +
          escHtml(tx("order.cancel", "Cancel order")) + "</button></div>"
        : "") +
      "</div>" +
      (needProof ? '<div class="lx-card lx-mt" id="track-proof"></div>' : "") +
      '<p class="lx-center lx-mt lx-muted" style="font-size:.85rem">' +
        escHtml(tx("track.login_hint", "Want full details and proof upload?")) + ' <a class="lx-link" href="/login.html?next=' +
        encodeURIComponent("/order.html?number=" + o.number) + '">' + escHtml(tx("track.login", "Log in")) + "</a></p>";
    root.innerHTML = html;
    if (canCancel) {
      qs("#track-cancel", root).addEventListener("click", async function () {
        var reason = window.prompt(tx("order.cancel_why", "Why are you cancelling? (optional)"), "");
        if (reason === null) return;
        try {
          await api("/api/orders/" + encodeURIComponent(o.number) + "/cancel",
            { method: "POST", body: { reason: reason || "", phone: phone } });
          toastOk(tx("order.cancelled", "Order cancelled."));
          onSubmit(new Event("submit", { cancelable: true }));
        } catch (e) { toastErr(errText(apiErr(e).code)); }
      });
    }
    if (needProof) {
      mountProofForm(qs("#track-proof", root), o.number, {
        onSuccess: function () { onSubmit(new Event("submit", { cancelable: true })); }
      });
      var pf = qs("#proof-phone", root);
      if (pf && phone) pf.value = phone;
    }
  }
})();
