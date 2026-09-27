/* ============================================================
   auth.js — Authentication pages. One file, page auto-detected:
     login.html    #login-form     -> POST /api/auth/login
     register.html #register-form  -> POST /api/auth/register
                     (validates MM phone + password >= 6, field errors)
     verify.html   #verify-root    -> GET /api/auth/verify-email?token=
     reset.html    #reset-root     -> forgot form, or reset form when
                                    ?token= is present
   Supports ?next= (validated to be a same-origin path) on login
   and register; preserves it on the login<->register links.
   Shared: api(), t(), applyI18n(), toast() + shopper.js helpers.
   ============================================================ */
(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    try { initChrome(); } catch (e0) { /* chrome optional */ }
    // Preserve ?next= across the login/register links.
    var nx = qp("next");
    if (nx) {
      ["#to-register", "#to-login"].forEach(function (sel) {
        var a = qs(sel);
        if (a) {
          var u = new URL(a.getAttribute("href"), location.origin);
          u.searchParams.set("next", nx);
          a.setAttribute("href", u.pathname + u.search);
        }
      });
    }

    if (qs("#login-form")) initLogin();
    else if (qs("#register-form")) initRegister();
    else if (qs("#verify-root")) initVerify();
    else if (qs("#reset-root")) initReset();

    applyShopperI18n();
  });

  function toastSafe(msg, type) { if (type === "error") toastErr(msg); else toastOk(msg); }

  function banner(msg, type) {
    var b = qs("#auth-banner");
    if (b) b.innerHTML = bannerHTML(msg, type);
  }

  /* ================= login ================= */
  function initLogin() {
    qs("#login-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(document);
      banner("", "");
      var email = qs("#login-email").value.trim();
      var password = qs("#login-password").value;
      var ok = true;
      if (!validEmailLoose(email)) { setFieldErr(document, "email", tx("v.email", "Enter a valid email address.")); ok = false; }
      if (!password) { setFieldErr(document, "password", tx("v.required", "This field is required.")); ok = false; }
      if (!ok) return;
      var btn = qs("#login-form .lx-btn");
      btn.disabled = true;
      try {
        var res = await api("/api/auth/login", { method: "POST", body: { email: email, password: password } });
        var nm = (res && res.user && res.user.name) || "";
        toastSafe(tx("auth.welcome", "Welcome back!", { name: nm }), "success");
        go(safeNext("/"));
      } catch (err) {
        var ei = apiErr(err);
        btn.disabled = false;
        if (ei.code === "validation" && ei.fields && Object.keys(ei.fields).length) {
          applyFieldErrs(document, ei.fields);
        } else {
          banner(escHtml(
            ei.code === "not_found" || /invalid|credentials|password/i.test(ei.code + ei.message)
              ? tx("auth.bad_creds", "Email or password is incorrect.")
              : errText(ei.code)
          ), "error");
        }
      }
    });
  }

  /* ================= register ================= */
  function initRegister() {
    qs("#register-form").addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(document);
      banner("", "");
      var name = qs("#reg-name").value.trim();
      var email = qs("#reg-email").value.trim();
      var phone = qs("#reg-phone").value.trim();
      var pw = qs("#reg-password").value;
      var confirm = qs("#reg-confirm").value;
      var ok = true;
      if (!name) { setFieldErr(document, "name", tx("v.required", "This field is required.")); ok = false; }
      if (!validEmailLoose(email)) { setFieldErr(document, "email", tx("v.email", "Enter a valid email address.")); ok = false; }
      if (!validMMPhone(phone)) {
        setFieldErr(document, "phone", tx("v.phone", "Enter a valid Myanmar mobile number (e.g. 09XXXXXXXXX)."));
        ok = false;
      }
      if (!pw || pw.length < 6) { setFieldErr(document, "password", tx("auth.pw_hint", "At least 6 characters.")); ok = false; }
      if (pw !== confirm) { setFieldErr(document, "confirm", tx("auth.pw_mismatch", "Passwords do not match.")); ok = false; }
      if (!ok) return;
      var btn = qs("#register-form .lx-btn");
      btn.disabled = true;
      btn.textContent = tx("auth.creating", "Creating account…");
      try {
        await api("/api/auth/register", { method: "POST", body: {
          name: name, email: email, phone: phone, password: pw, lang: pageLang()
        } });
        toastSafe(tx("auth.reg_done", "Account created! Please check your email to verify."), "success");
        go(safeNext("/account.html"));
      } catch (err) {
        var ei = apiErr(err);
        btn.disabled = false;
        btn.textContent = tx("auth.reg_btn", "Create account");
        if (ei.code === "validation" && ei.fields && Object.keys(ei.fields).length) {
          applyFieldErrs(document, ei.fields);
        } else {
          banner(escHtml(errText(ei.code)), "error");
        }
      }
    });
  }

  /* ================= verify email ================= */
  async function initVerify() {
    var root = qs("#verify-root");
    var token = qp("token");
    if (!token) {
      root.innerHTML = '<h1 class="lx-title lx-center">' + escHtml(tx("auth.verify_title", "Verify email")) + "</h1>" +
        bannerHTML(escHtml(tx("auth.no_token", "This verification link is incomplete.")), "error");
      return;
    }
    try {
      await api("/api/auth/verify-email?token=" + encodeURIComponent(token));
      root.innerHTML = '<div class="lx-center"><div class="lx-big" style="font-size:3rem">✓</div>' +
        '<h1 class="lx-title">' + escHtml(tx("auth.verified", "Email verified!")) + "</h1>" +
        "<p class='lx-muted'>" + escHtml(tx("auth.verified_hint", "Your account is now fully activated.")) + "</p>" +
        '<p class="lx-mt"><a class="lx-btn auto" href="/account.html">' + escHtml(tx("account.title", "My Account")) + "</a></p></div>";
      toastSafe(tx("auth.verified", "Email verified!"), "success");
    } catch (err) {
      var ei = apiErr(err);
      root.innerHTML = '<h1 class="lx-title lx-center">' + escHtml(tx("auth.verify_title", "Verify email")) + "</h1>" +
        bannerHTML(escHtml(
          ei.code === "not_found" || ei.code === "validation"
            ? tx("auth.bad_token", "This verification link is invalid or has expired.")
            : errText(ei.code)
        ), "error") +
        '<p class="lx-center"><a class="lx-link" href="/login.html">' + escHtml(tx("auth.login_btn", "Log in")) + "</a></p>";
    }
    applyShopperI18n();
  }

  /* ================= forgot / reset password ================= */
  function initReset() {
    var root = qs("#reset-root");
    var token = qp("token");
    if (token) renderResetForm(root, token);
    else renderForgotForm(root);
    applyShopperI18n();
  }

  function renderForgotForm(root) {
    root.innerHTML = '<h1 class="lx-title lx-center">' + escHtml(tx("auth.forgot_title", "Forgot password")) + "</h1>" +
      '<p class="lx-subtitle lx-center">' + escHtml(tx("auth.forgot_hint", "Enter your account email and we'll send a reset link.")) + "</p>" +
      '<div id="reset-banner"></div>' +
      '<form id="forgot-form" novalidate>' +
      '<div class="lx-field"><label>' + escHtml(tx("auth.email", "Email")) + "</label>" +
        '<input class="lx-input" id="forgot-email" type="email" autocomplete="email"><div class="lx-err" data-err-for="email"></div></div>' +
      '<button class="lx-btn" type="submit">' + escHtml(tx("auth.send_link", "Send reset link")) + "</button></form>" +
      '<p class="lx-center lx-mt"><a class="lx-link" href="/login.html">' + escHtml(tx("auth.back_login", "← Back to log in")) + "</a></p>";

    qs("#forgot-form", root).addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(root);
      var email = qs("#forgot-email", root).value.trim();
      if (!validEmailLoose(email)) { setFieldErr(root, "email", tx("v.email", "Enter a valid email address.")); return; }
      var btn = qs("#forgot-form .lx-btn", root);
      btn.disabled = true;
      try {
        await api("/api/auth/forgot-password", { method: "POST", body: { email: email } });
        qs("#reset-banner", root).innerHTML = bannerHTML(
          "✓ " + escHtml(tx("auth.link_sent", "If an account exists with this email, a reset link has been sent.")),
          "success");
      } catch (err) {
        qs("#reset-banner", root).innerHTML = bannerHTML(escHtml(errText(apiErr(err).code)), "error");
      }
      btn.disabled = false;
    });
  }

  function renderResetForm(root, token) {
    root.innerHTML = '<h1 class="lx-title lx-center">' + escHtml(tx("auth.new_pw_title", "Choose a new password")) + "</h1>" +
      '<div id="reset-banner"></div>' +
      '<form id="reset-form" novalidate>' +
      '<div class="lx-field"><label>' + escHtml(tx("auth.pw_new", "New password")) + "</label>" +
        '<input class="lx-input" id="reset-pw" type="password" autocomplete="new-password"><div class="lx-err" data-err-for="password"></div>' +
        '<div class="lx-hint">' + escHtml(tx("auth.pw_hint", "At least 6 characters.")) + "</div></div>" +
      '<div class="lx-field"><label>' + escHtml(tx("auth.confirm", "Confirm password")) + "</label>" +
        '<input class="lx-input" id="reset-pw2" type="password" autocomplete="new-password"><div class="lx-err" data-err-for="confirm"></div></div>' +
      '<button class="lx-btn" type="submit">' + escHtml(tx("auth.reset_btn", "Reset password")) + "</button></form>";

    qs("#reset-form", root).addEventListener("submit", async function (e) {
      e.preventDefault();
      clearFieldErrs(root);
      var pw = qs("#reset-pw", root).value;
      var pw2 = qs("#reset-pw2", root).value;
      var ok = true;
      if (!pw || pw.length < 6) { setFieldErr(root, "password", tx("auth.pw_hint", "At least 6 characters.")); ok = false; }
      if (pw !== pw2) { setFieldErr(root, "confirm", tx("auth.pw_mismatch", "Passwords do not match.")); ok = false; }
      if (!ok) return;
      var btn = qs("#reset-form .lx-btn", root);
      btn.disabled = true;
      try {
        await api("/api/auth/reset-password", { method: "POST", body: { token: token, password: pw } });
        root.innerHTML = '<div class="lx-center"><div class="lx-big" style="font-size:3rem">✓</div>' +
          '<h1 class="lx-title">' + escHtml(tx("auth.reset_done", "Password reset!")) + "</h1>" +
          "<p class='lx-muted'>" + escHtml(tx("auth.reset_done_hint", "You can now log in with your new password.")) + "</p>" +
          '<p class="lx-mt"><a class="lx-btn auto" href="/login.html">' + escHtml(tx("auth.login_btn", "Log in")) + "</a></p></div>";
        toastSafe(tx("auth.reset_done", "Password reset!"), "success");
      } catch (err) {
        var ei = apiErr(err);
        btn.disabled = false;
        qs("#reset-banner", root).innerHTML = bannerHTML(escHtml(
          ei.code === "not_found" || ei.code === "validation"
            ? tx("auth.bad_token", "This reset link is invalid or has expired.")
            : errText(ei.code)
        ), "error");
      }
    });
  }
})();
