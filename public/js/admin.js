"use strict";
/* Perfume Decant Shop — Admin SPA (vanilla JS, no build step).
   Hash router (#/orders …). Reuses shared helpers when present
   (esc, fmtMMK, toast, t) with safe fallbacks. */

/* ---------- shared-helper fallbacks (never redeclare globals) ---------- */
const _esc = (typeof esc === "function") ? esc
  : (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const _fmtMMK = (typeof fmtMMK === "function") ? fmtMMK
  : (n) => Number(n || 0).toLocaleString("en-US");
const _toast = (typeof toast === "function") ? toast
  : (msg, isErr) => {
      const box = document.getElementById("toasts") || document.body;
      const d = document.createElement("div");
      d.className = "toastmsg" + (isErr ? " err" : "");
      d.textContent = msg;
      box.appendChild(d);
      setTimeout(() => d.remove(), 4200);
    };
const _t = (typeof t === "function") ? t : (k) => k;
const toastOk = (m) => _toast(m, false);
const toastErr = (m) => _toast(m, true);

/* ---------- API helper: envelope {ok,data} / {ok:false,error} ---------- */
async function rq(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let j;
  try { j = await res.json(); }
  catch { const e = new Error("bad_response"); e.code = "bad_response"; throw e; }
  if (!j || !j.ok) {
    const e = new Error((j && j.error) || "request_failed");
    e.code = (j && j.error) || "request_failed";
    e.fieldErrors = j && j.fieldErrors;
    throw e;
  }
  return j.data;
}

/* ---------- utils ---------- */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const fmtDate = (ms) => ms ? new Date(ms).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
const fmtDay = (ms) => ms ? new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const num = (v) => (v && typeof v === "object" ? (v.count ?? v.total ?? 0) : (v ?? 0));
const slugify = (s) => String(s || "").toLowerCase().trim().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const csvToArr = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
const dtLocal = (ms) => {
  if (!ms) return "";
  const d = new Date(ms), p = (n) => String(n).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + "T" + p(d.getHours()) + ":" + p(d.getMinutes());
};
const msFromDtLocal = (s) => s ? new Date(s).getTime() : null;

/* ---------- constants ---------- */
const STATUS_FLOW = {
  pending_payment: ["payment_verification", "cancelled"],
  payment_verification: ["confirmed", "pending_payment", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["packed", "cancelled"],
  packed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: ["refunded"],
  cancelled: [], refunded: [],
};
const STATUS_LABEL = {
  pending_payment: "Pending payment", payment_verification: "Verifying payment",
  confirmed: "Confirmed", preparing: "Preparing", packed: "Packed",
  shipped: "Shipped", delivered: "Delivered", cancelled: "Cancelled", refunded: "Refunded",
};
const PAY_LABEL = {
  pending: "Pending", proof_submitted: "Proof submitted", under_review: "Under review",
  paid: "Paid", failed: "Failed", refunded: "Refunded", partially_refunded: "Partially refunded",
};
const badge = (txt, cls) => `<span class="badge b-${_esc(cls || txt)}">${_esc(txt)}</span>`;
const statusBadge = (s) => badge(STATUS_LABEL[s] || s, s);
const payBadge = (s) => badge(PAY_LABEL[s] || s, s);

const TABS = [
  { id: "dashboard", en: "Dashboard", mm: "ဒက်ရှ်ဘုတ်", ico: "◈" },
  { id: "orders", en: "Orders", mm: "အော်ဒါများ", ico: "▤" },
  { id: "payments", en: "Payments", mm: "ငွေပေးချေမှု", ico: "◉" },
  { id: "products", en: "Products", mm: "ပစ္စည်းများ", ico: "✿" },
  { id: "brands", en: "Brands", mm: "တံဆိပ်များ", ico: "🏷" },
  { id: "inventory", en: "Inventory", mm: "ပုလင်းများ", ico: "🧴" },
  { id: "movements", en: "Movements", mm: "မှတ်တမ်း", ico: "⇄" },
  { id: "customers", en: "Customers", mm: "ဝယ်သူများ", ico: "👥" },
  { id: "staff", en: "Staff", mm: "ဝန်ထမ်းများ", ico: "🛡", admin: true },
  { id: "reviews", en: "Reviews", mm: "သုံးသပ်ချက်", ico: "★" },
  { id: "coupons", en: "Coupons", mm: "ကူပွန်", ico: "🎟" },
  { id: "zones", en: "Zones", mm: "ပို့ဆောင်ရေးဇုန်", ico: "🚚" },
  { id: "banners", en: "Banners", mm: "ဘန်နာ", ico: "🖼" },
  { id: "content", en: "Content", mm: "စာမျက်နှာ", ico: "📄" },
  { id: "settings", en: "Settings", mm: "ဆက်တင်", ico: "⚙", admin: true },
  { id: "outbox", en: "Outbox", mm: "အီးမေးလ်", ico: "✉" },
  { id: "audit", en: "Audit Log", mm: "မှတ်တမ်း", ico: "📋", admin: true },
];
const SEASONS = ["spring", "summer", "autumn", "winter"];
const OCCASIONS = ["daily", "office", "evening", "special", "sport", "travel"];
const CONTENT_KEYS = ["authenticity", "delivery", "returns", "faq"];

/* ---------- state ---------- */
let ME = null;
let BRANDS = [];

/* ---------- modal & drawer ---------- */
function closeModal() { const o = $("#modal-ov"); if (o) o.remove(); }
function closeDrawer() { const d = $("#drawer"); if (d) d.remove(); }
function showModal(title, innerHTML) {
  closeModal();
  const ov = document.createElement("div");
  ov.className = "overlay"; ov.id = "modal-ov";
  ov.innerHTML = `<div class="modal" role="dialog" aria-label="${_esc(title)}"><h2>${_esc(title)}</h2><div class="mbody"></div></div>`;
  const body = ov.querySelector(".mbody");
  body.innerHTML = innerHTML;
  ov.addEventListener("mousedown", (e) => { if (e.target === ov) closeModal(); });
  const onKey = (e) => { if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", onKey); } };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(ov);
  return body;
}
function modalFooter(saveLabel) {
  return `<div class="actions"><button type="button" class="btn" data-close>Cancel</button>` +
    `<button type="submit" class="btn primary">${_esc(saveLabel || "Save")}</button></div>`;
}
function wireModal(body, onSubmit) {
  const form = body.querySelector("form");
  body.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeModal));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    btn.disabled = true;
    try { await onSubmit(form); closeModal(); }
    catch (err) { toastErr(err.code || err.message || "Save failed"); btn.disabled = false; }
  });
  const slugSrc = form.querySelector("[data-slug-src]");
  const slugDst = form.querySelector("[data-slug-dst]");
  if (slugSrc && slugDst) slugSrc.addEventListener("input", () => {
    if (!slugDst.dataset.touched) slugDst.value = slugify(slugSrc.value);
  });
  if (slugDst) slugDst.addEventListener("input", () => { slugDst.dataset.touched = "1"; });
  return form;
}
/* form field builders */
const F = {
  text: (n, l, v, extra) => `<label class="f">${_esc(l)}<input type="text" name="${n}" value="${_esc(v || "")}" ${extra || ""}></label>`,
  num: (n, l, v, extra) => `<label class="f">${_esc(l)}<input type="number" name="${n}" value="${_esc(v ?? "")}" ${extra || ""}></label>`,
  email: (n, l, v, extra) => `<label class="f">${_esc(l)}<input type="email" name="${n}" value="${_esc(v || "")}" ${extra || ""}></label>`,
  pass: (n, l, extra) => `<label class="f">${_esc(l)}<input type="password" name="${n}" autocomplete="new-password" ${extra || ""}></label>`,
  date: (n, l, v, extra) => `<label class="f">${_esc(l)}<input type="date" name="${n}" value="${_esc(v || "")}" ${extra || ""}></label>`,
  dt: (n, l, v, extra) => `<label class="f">${_esc(l)}<input type="datetime-local" name="${n}" value="${_esc(v || "")}" ${extra || ""}></label>`,
  ta: (n, l, v, extra) => `<label class="f">${_esc(l)}<textarea name="${n}" ${extra || ""}>${_esc(v || "")}</textarea></label>`,
  sel: (n, l, opts, v, extra) =>
    `<label class="f">${_esc(l)}<select name="${n}" ${extra || ""}>` + opts.map((o) => {
      const val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o;
      return `<option value="${_esc(val)}"${String(val) === String(v) ? " selected" : ""}>${_esc(lab)}</option>`;
    }).join("") + `</select></label>`,
  chk: (n, l, on, extra) =>
    `<label style="display:flex;align-items:center;gap:8px;margin-top:12px;font-size:13.5px;cursor:pointer">` +
    `<input type="checkbox" name="${n}"${on ? " checked" : ""} ${extra || ""}> ${_esc(l)}</label>`,
  checks: (n, l, opts, vals) =>
    `<div style="margin-top:10px"><div class="muted">${_esc(l)}</div><div class="checks">` + opts.map((o) =>
      `<label><input type="checkbox" name="${n}" value="${_esc(o)}"${(vals || []).includes(o) ? " checked" : ""}> ${_esc(o)}</label>`).join("") +
    `</div></div>`,
};
const chkVal = (form, name) => { const c = form.querySelector(`[name="${name}"]`); return !!(c && c.checked); };
const checkedVals = (form, name) => $$ (`input[name="${name}"]:checked`, form).map((c) => c.value);
const val = (form, name) => { const el = form.querySelector(`[name="${name}"]`); return el ? el.value.trim() : ""; };

/* ---------- cursor pager ---------- */
function pager(base) {
  return {
    base, items: [], cursor: null, hasMore: true,
    async load(reset) {
      if (reset) { this.items = []; this.cursor = null; this.hasMore = true; }
      if (!this.hasMore) return;
      const b = this.base;
      const sep = b.includes("?") ? "&" : "?";
      const d = await rq("GET", b + sep + "limit=30" + (this.cursor ? "&cursor=" + encodeURIComponent(this.cursor) : ""));
      this.items.push(...(d.items || []));
      this.cursor = d.nextCursor || null;
      this.hasMore = !!d.hasMore;
      return d;
    },
  };
}
const tableShell = (heads, bodyHTML, minW) =>
  `<div class="tblwrap"><table class="tbl"${minW ? ` style="min-width:${minW}px"` : ""}><thead><tr>` +
  heads.map((h) => `<th>${_esc(h)}</th>`).join("") + `</tr></thead><tbody>` +
  (bodyHTML || `<tr><td colspan="${heads.length}"><div class="empty">No records</div></td></tr>`) +
  `</tbody></table></div>`;
const loadMoreBtn = (id) => `<button class="btn loadmore" id="${id}">Load more</button>`;

/* ---------- boot / shell / router ---------- */
async function boot() {
  try { const d = await rq("GET", "/api/auth/me"); ME = d.user; }
  catch { ME = null; }
  if (!ME) { location.href = "/login.html?next=" + encodeURIComponent("/admin.html"); return; }
  if (ME.role === "customer") { renderForbidden(); return; }
  try { const b = await rq("GET", "/api/admin/brands"); BRANDS = b.brands || b.items || []; } catch { BRANDS = []; }
  renderShell();
  window.addEventListener("hashchange", router);
  if (!location.hash) location.hash = "#/dashboard";
  router();
  if (typeof applyI18n === "function") { try { applyI18n(); } catch {} }
  $$(".langbtn").forEach((b) => b.addEventListener("click", () => {
    if (typeof setLang === "function") setLang(b.dataset.lang);
    else { try { localStorage.setItem("lang", b.dataset.lang); } catch {} location.reload(); }
  }));
  $("#logout").addEventListener("click", async () => {
    try { await rq("POST", "/api/auth/logout"); } catch {}
    location.href = "/login.html";
  });
}

function renderShell() {
  const tabs = TABS.filter((t) => !t.admin || ME.role === "admin");
  $("#app").innerHTML = `
  <header class="topbar">
    <div class="brandmark">PERFUME DECANT<small>ADMIN PANEL</small></div>
    <div class="spacer"></div>
    <span class="who">${_esc(ME.name || ME.email)} · ${badge(ME.role, ME.role === "admin" ? "delivered" : "confirmed")}</span>
    <button class="langbtn" data-lang="en">EN</button>
    <button class="langbtn" data-lang="my">မြန်မာ</button>
    <button class="btn sm" id="logout" data-i18n="nav.logout">Logout</button>
  </header>
  <div class="shell">
    <nav class="sidebar" id="sidenav" aria-label="Admin navigation">
      ${tabs.map((t) => `<button class="navitem" data-tab="${t.id}"><span class="ico">${t.ico}</span><span>${_esc(t.en)}<br><small class="muted">${_esc(t.mm)}</small></span></button>`).join("")}
    </nav>
    <main class="main" id="view"></main>
  </div>`;
  $$("#sidenav .navitem").forEach((b) => b.addEventListener("click", () => { location.hash = "#/" + b.dataset.tab; }));
}

function renderForbidden() {
  $("#app").innerHTML = `
  <div class="forbidden">
    <div style="font-size:44px">🔒</div>
    <h2>Access denied</h2>
    <p class="muted">This area is for shop staff only. Your account (<b>${_esc(ME.email)}</b>) has the customer role.</p>
    <p><a class="btn primary" href="/" style="text-decoration:none;display:inline-block">← Back to shop</a></p>
  </div>`;
  document.title = "Forbidden — Admin";
}

const ROUTES = {};
function router() {
  const h = (location.hash || "#/dashboard").replace(/^#\//, "");
  const qi = h.indexOf("?");
  const tab = qi === -1 ? h : h.slice(0, qi);
  const q = new URLSearchParams(qi === -1 ? "" : h.slice(qi + 1));
  let id = ROUTES[tab] ? tab : "dashboard";
  const def = TABS.find((t) => t.id === id);
  if (def && def.admin && ME.role !== "admin") id = "dashboard";
  $$("#sidenav .navitem").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
  const main = $("#view");
  if (!main) return;
  main.innerHTML = `<div class="empty">Loading…</div>`;
  closeDrawer();
  ROUTES[id](main, q).catch((e) => {
    main.innerHTML = `<div class="panel"><div class="empty">Failed to load: <b>${_esc(e.code || e.message)}</b></div></div>`;
  });
  document.title = `${(def && def.en) || id} — Admin`;
}

document.addEventListener("DOMContentLoaded", boot);

/* ================= DASHBOARD ================= */
ROUTES.dashboard = async function (el) {
  const d = await rq("GET", "/api/admin/dashboard");
  const fq = d.fulfillmentQueue || {};
  const fqTotal = ["confirmed", "preparing", "packed"].reduce((a, k) => a + (Number(fq[k]) || 0), 0);
  el.innerHTML = `
  <div class="pagehead"><h1>Dashboard</h1><span class="sub muted">ဒက်ရှ်ဘုတ် · ${fmtDay(Date.now())}</span></div>
  <div class="cards">
    <div class="stat"><div class="k">Today's orders</div><div class="v">${num(d.todayOrders)}</div></div>
    <div class="stat"><div class="k">Today's sales</div><div class="v">${_fmtMMK(num(d.todaySales))} <small>Ks</small></div></div>
    <div class="stat"><div class="k">Pending payments</div><div class="v">${num(d.pendingPayments)}</div></div>
    <div class="stat"><div class="k">To verify</div><div class="v">${num(d.paymentsToVerify)}</div></div>
    <div class="stat"><div class="k">Fulfillment queue</div><div class="v">${fqTotal} <small>confirmed ${Number(fq.confirmed) || 0} · preparing ${Number(fq.preparing) || 0} · packed ${Number(fq.packed) || 0}</small></div></div>
  </div>
  <div class="panel"><h2>Low stock <span class="mm">လက်ကျန်နည်း</span></h2>
    ${tableShell(["Product", "Variant", "Size", "Stock", "Threshold"],
      (d.lowStock || []).map((v) => `<tr>
        <td>${_esc(v.product_name || v.product || "")}</td><td>${_esc(v.name || "")}</td>
        <td class="num">${_esc(v.size_ml)} ml</td>
        <td class="num" style="color:var(--danger);font-weight:700">${_esc(v.stock_qty)}</td>
        <td class="num">${_esc(v.low_threshold)}</td></tr>`).join(""))}
  </div>
  <div class="panel"><h2>Best sellers · 30 days <span class="mm">အရောင်းရဆုံး</span></h2>
    ${tableShell(["Product", "Qty sold", "Revenue"],
      (d.bestSellers || []).map((b) => `<tr>
        <td>${_esc(b.product_name || b.name || "")}</td>
        <td class="num">${_esc(b.qty ?? b.total_qty ?? "")}</td>
        <td class="num">${_fmtMMK(b.revenue ?? b.total ?? 0)} Ks</td></tr>`).join(""))}
  </div>
  <div class="panel"><h2>Recent customers <span class="mm">ဝယ်သူအသစ်များ</span></h2>
    ${tableShell(["Name", "Email", "Phone", "Joined"],
      (d.recentCustomers || []).map((c) => `<tr>
        <td>${_esc(c.name)}</td><td>${_esc(c.email)}</td><td>${_esc(c.phone)}</td>
        <td>${fmtDate(c.created_at)}</td></tr>`).join(""))}
  </div>`;
};

/* ================= ORDERS ================= */
ROUTES.orders = async function (el, q) {
  const pg = pager("/api/admin/orders");
  const statusF = q.get("status") || "", qF = q.get("q") || "";
  pg.base = "/api/admin/orders?" + new URLSearchParams({ ...(statusF ? { status: statusF } : {}), ...(qF ? { q: qF } : {}) }).toString();
  el.innerHTML = `
  <div class="pagehead"><h1>Orders</h1><span class="sub muted">အော်ဒါများ</span></div>
  <div class="toolbar">
    <select id="of-status">
      <option value="">All statuses</option>
      ${Object.keys(STATUS_LABEL).map((s) => `<option value="${s}"${s === statusF ? " selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
    </select>
    <input type="text" id="of-q" placeholder="Search number / name / phone" value="${_esc(qF)}" style="min-width:220px">
    <button class="btn" id="of-go">Filter</button>
    <div class="spacer"></div><span class="muted" id="of-count"></span>
  </div>
  <div id="of-list"></div><div id="of-more"></div>`;
  const render = () => {
    $("#of-count", el).textContent = pg.items.length + " orders";
    $("#of-list", el).innerHTML = tableShell(["Number", "Customer", "Items", "Total", "Pay", "Status", "Placed"],
      pg.items.map((o) => `<tr class="clickable" data-num="${_esc(o.number)}">
        <td><b>${_esc(o.number)}</b></td><td>${_esc(o.name)}<br><small class="muted">${_esc(o.phone)}</small></td>
        <td class="num">${_esc(o.item_count ?? "")}</td><td class="num">${_fmtMMK(o.total)} Ks</td>
        <td>${payBadge(o.payment_status)}</td><td>${statusBadge(o.status)}</td><td>${fmtDate(o.created_at)}</td></tr>`).join(""), 760);
    $$("#of-list tr.clickable", el).forEach((tr) => tr.addEventListener("click", () => openOrder(tr.dataset.num, () => render())));
    $("#of-more", el).innerHTML = pg.hasMore ? loadMoreBtn("of-load") : "";
    const lm = $("#of-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  const apply = () => {
    const s = $("#of-status", el).value, qq = $("#of-q", el).value.trim();
    location.hash = "#/orders?" + new URLSearchParams({ ...(s ? { status: s } : {}), ...(qq ? { q: qq } : {}) }).toString();
  };
  $("#of-go", el).addEventListener("click", apply);
  $("#of-q", el).addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  await pg.load(true);
  render();
};

async function openOrder(number, onChanged) {
  closeDrawer();
  const d = await rq("GET", "/api/admin/orders/" + encodeURIComponent(number));
  const o = d.order, items = d.items || [], pay = d.payment || {}, ship = d.shipment || {}, tl = d.timeline || [];
  const nexts = STATUS_FLOW[o.status] || [];
  const dr = document.createElement("div");
  dr.className = "drawer"; dr.id = "drawer";
  dr.innerHTML = `
    <button class="btn sm close" data-close>✕ Close</button>
    <h2 style="margin-top:0">${_esc(o.number)}</h2>
    <div>${statusBadge(o.status)} ${payBadge(o.payment_status)} <span class="muted">${_esc(o.payment_method || "")}</span></div>
    <dl class="kv">
      <dt>Customer</dt><dd>${_esc(o.name)} · ${_esc(o.phone)}${o.email ? " · " + _esc(o.email) : ""}</dd>
      <dt>Address</dt><dd>${_esc(o.address_line)}, ${_esc(o.township)}, ${_esc(o.city || "")} ${_esc(o.region)}</dd>
      <dt>Notes</dt><dd>${_esc(o.notes || "—")}</dd>
      <dt>Placed</dt><dd>${fmtDate(o.created_at)}</dd>
      <dt>Subtotal</dt><dd class="num">${_fmtMMK(o.subtotal)} Ks</dd>
      <dt>Discount${o.coupon_code ? " (" + _esc(o.coupon_code) + ")" : ""}</dt><dd class="num">−${_fmtMMK(o.discount)} Ks</dd>
      <dt>Delivery</dt><dd class="num">${_fmtMMK(o.delivery_fee)} Ks</dd>
      <dt><b>Total</b></dt><dd class="num"><b>${_fmtMMK(o.total)} Ks</b></dd>
    </dl>
    <h3 style="font-size:14px;margin:14px 0 6px">Items</h3>
    ${tableShell(["Product", "Variant", "Qty", "Unit", "Line"],
      items.map((i) => `<tr><td>${_esc(i.product_name)}</td><td>${_esc(i.variant_name)} · ${_esc(i.size_ml)}ml</td>
        <td class="num">${_esc(i.qty)}</td><td class="num">${_fmtMMK(i.unit_price)}</td><td class="num">${_fmtMMK(i.line_total)}</td></tr>`).join(""), 480)}
    <h3 style="font-size:14px;margin:14px 0 6px">Payment</h3>
    <dl class="kv">
      <dt>Method</dt><dd>${_esc(pay.method || o.payment_method || "")}</dd>
      <dt>Amount</dt><dd class="num">${_fmtMMK(pay.amount ?? o.total)} Ks</dd>
      <dt>Txn ref</dt><dd>${_esc(pay.txn_ref || "—")}</dd>
      ${pay.note ? `<dt>Note</dt><dd>${_esc(pay.note)}</dd>` : ""}
    </dl>
    <h3 style="font-size:14px;margin:14px 0 6px">Shipment</h3>
    <dl class="kv">
      <dt>Courier</dt><dd>${_esc(ship.courier || "—")}</dd>
      <dt>Tracking</dt><dd>${_esc(ship.tracking_ref || "—")}</dd>
      <dt>Shipped</dt><dd>${fmtDate(ship.shipped_at)}</dd>
      <dt>Delivered</dt><dd>${fmtDate(ship.delivered_at)}</dd>
    </dl>
    ${nexts.length ? `
    <h3 style="font-size:14px;margin:14px 0 6px">Change status</h3>
    <div class="statusbtns">${nexts.map((s) => `<button class="btn sm${s === "cancelled" ? " danger" : ""}" data-to="${s}">${_esc(STATUS_LABEL[s])}</button>`).join("")}</div>
    <div id="dr-extra"></div>` : `<p class="muted">No further transitions (terminal state).</p>`}
    ${tl.length ? `<h3 style="font-size:14px;margin:14px 0 6px">Timeline</h3>
      <div class="muted">${tl.map((t) => `<div>· ${fmtDate(t.created_at || t.at)} — ${_esc(t.label || t.status || t.action || "")}</div>`).join("")}</div>` : ""}`;
  document.body.appendChild(dr);
  dr.querySelector("[data-close]").addEventListener("click", closeDrawer);
  dr.querySelectorAll("[data-to]").forEach((b) => b.addEventListener("click", () => {
    const to = b.dataset.to;
    const extra = $("#dr-extra", dr);
    let html = "";
    if (to === "shipped") html = `<div class="grid2">${F.text("courier", "Courier", ship.courier || "")}${F.text("tracking_ref", "Tracking ref", ship.tracking_ref || "")}</div>`;
    if (to === "cancelled") html = F.text("reason", "Cancel reason", "");
    html += F.text("note", "Note (optional)", "");
    html += `<div class="statusbtns"><button class="btn primary sm" id="dr-confirm">Confirm → ${STATUS_LABEL[to]}</button></div>`;
    extra.innerHTML = html;
    $("#dr-confirm", extra).addEventListener("click", async () => {
      const payload = { status: to };
      const gv = (n) => { const e = extra.querySelector(`[name="${n}"]`); return e ? e.value.trim() : ""; };
      if (to === "shipped") { payload.courier = gv("courier"); payload.tracking_ref = gv("tracking_ref"); }
      if (to === "cancelled") payload.reason = gv("reason");
      const note = gv("note"); if (note) payload.note = note;
      if (to === "cancelled" && !confirm(`Cancel order ${o.number}? Reserved stock will be released.`)) return;
      try {
        await rq("PATCH", "/api/admin/orders/" + encodeURIComponent(o.number) + "/status", payload);
        toastOk(`Order ${o.number} → ${STATUS_LABEL[to]}`);
        closeDrawer(); if (onChanged) onChanged(); openOrder(o.number, onChanged);
      } catch (e) { toastErr(e.code || "Status change failed"); }
    });
  }));
}

/* ================= PAYMENTS ================= */
ROUTES.payments = async function (el, q) {
  const statusF = q.get("status") || "";
  const base = "/api/admin/payments" + (statusF ? "?status=" + encodeURIComponent(statusF) : "");
  const pg = pager(base);
  el.innerHTML = `
  <div class="pagehead"><h1>Payments</h1><span class="sub muted">ငွေပေးချေမှု · proof verification queue</span></div>
  <div class="toolbar">
    <select id="pf-status">
      <option value="">Needs action (submitted/under review)</option>
      ${Object.keys(PAY_LABEL).map((s) => `<option value="${s}"${s === statusF ? " selected" : ""}>${PAY_LABEL[s]}</option>`).join("")}
    </select>
    <button class="btn" id="pf-go">Filter</button>
    <div class="spacer"></div><span class="muted" id="pf-count"></span>
  </div>
  <div id="pf-list"></div><div id="pf-more"></div>`;
  const proofFile = (p) => (p.proof_path || "").split("/").pop();
  const render = () => {
    $("#pf-count", el).textContent = pg.items.length + " payments";
    $("#pf-list", el).innerHTML = tableShell(["Order", "Method", "Amount", "Txn ref", "Proof", "Status", "Submitted", "Actions"],
      pg.items.map((p) => {
        const f = proofFile(p);
        return `<tr>
        <td><b>${_esc(p.order_number || p.number || "")}</b></td>
        <td>${_esc(p.method)}</td><td class="num">${_fmtMMK(p.amount)} Ks</td>
        <td><small>${_esc(p.txn_ref || "—")}</small></td>
        <td>${f ? `<a href="/api/uploads/proofs/${encodeURIComponent(f)}" target="_blank" rel="noopener"><img class="proofimg" style="max-width:90px;max-height:90px" src="/api/uploads/proofs/${encodeURIComponent(f)}" alt="proof" loading="lazy"></a>` : "—"}</td>
        <td>${payBadge(p.status)}</td><td>${fmtDate(p.created_at)}</td>
        <td style="white-space:nowrap">${["proof_submitted", "under_review"].includes(p.status) ? `
          <button class="btn sm ok" data-approve="${p.id}">Approve</button>
          <button class="btn sm danger" data-reject="${p.id}">Reject</button>` : `<span class="muted">—</span>`}</td></tr>`;
      }).join(""), 900);
    $$("#pf-list [data-approve]", el).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Approve this payment? Order will be confirmed and stock reserved.")) return;
      try { await rq("POST", `/api/admin/payments/${b.dataset.approve}/approve`); toastOk("Payment approved"); await pg.load(true); render(); }
      catch (e) { toastErr(e.code || "Approve failed"); }
    }));
    $$("#pf-list [data-reject]", el).forEach((b) => b.addEventListener("click", async () => {
      const note = prompt("Rejection reason (sent to customer):", "");
      if (note === null) return;
      try { await rq("POST", `/api/admin/payments/${b.dataset.reject}/reject`, { note }); toastOk("Payment rejected"); await pg.load(true); render(); }
      catch (e) { toastErr(e.code || "Reject failed"); }
    }));
    $("#pf-more", el).innerHTML = pg.hasMore ? loadMoreBtn("pf-load") : "";
    const lm = $("#pf-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  $("#pf-go", el).addEventListener("click", () => {
    const s = $("#pf-status", el).value;
    location.hash = "#/payments" + (s ? "?status=" + encodeURIComponent(s) : "");
  });
  await pg.load(true);
  render();
};

/* ================= PRODUCTS (+ variants sub-view) ================= */
ROUTES.products = async function (el, q) {
  if (q.get("view") === "variants" && q.get("pid")) return vVariants(el, q.get("pid"));
  const pg = pager("/api/admin/products");
  const statusF = q.get("status") || "", qF = q.get("q") || "";
  pg.base = "/api/admin/products?" + new URLSearchParams({ ...(statusF ? { status: statusF } : {}), ...(qF ? { q: qF } : {}) }).toString();
  el.innerHTML = `
  <div class="pagehead"><h1>Products</h1><span class="sub muted">ပစ္စည်းများ</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="pd-new">+ New product</button></div>
  <div class="toolbar">
    <select id="pd-status">
      <option value="">All statuses</option>
      ${["active", "draft", "archived"].map((s) => `<option${s === statusF ? " selected" : ""}>${s}</option>`).join("")}
    </select>
    <input type="text" id="pd-q" placeholder="Search name / brand / notes" value="${_esc(qF)}" style="min-width:220px">
    <button class="btn" id="pd-go">Filter</button>
  </div>
  <div id="pd-list"></div><div id="pd-more"></div>`;
  const render = () => {
    $("#pd-list", el).innerHTML = tableShell(["Product", "Brand", "Variants", "Price range", "Rating", "Flags", "Status", "Actions"],
      pg.items.map((p) => {
        const flags = [p.featured ? "featured" : "", p.is_new ? "new" : "", p.bestseller ? "bestseller" : ""].filter(Boolean).join(" · ");
        return `<tr>
        <td><div style="display:flex;gap:10px;align-items:center">${p.image
          ? `<img src="/uploads/products/${_esc(p.image)}" alt="" style="width:44px;height:44px;object-fit:cover;border-radius:10px;border:1px solid var(--line)">`
          : `<span style="width:44px;height:44px;border-radius:10px;background:linear-gradient(135deg,#f6e3d3,#e7d3f5);display:inline-flex;align-items:center;justify-content:center;font-family:serif;color:#4A3428">${_esc((p.name || "P").trim().charAt(0).toUpperCase())}</span>`}
          <span><b>${_esc(p.name)}</b><br><small class="muted">${_esc(p.slug)} · ${_esc(p.concentration || "")}</small></span></div></td>
        <td>${_esc(p.brand || p.brand_name || "")}</td>
        <td class="num">${_esc(p.variant_count ?? "")}</td>
        <td class="num">${p.min_price != null ? _fmtMMK(p.min_price) + "–" + _fmtMMK(p.max_price) + " Ks" : "—"}</td>
        <td class="num">${p.rating_avg ? Number(p.rating_avg).toFixed(1) + " (" + p.rating_count + ")" : "—"}</td>
        <td><small class="muted">${_esc(flags) || "—"}</small></td>
        <td>${badge(p.status, p.status)}</td>
        <td style="white-space:nowrap">
          <button class="btn sm" data-var="${p.id}">Variants</button>
          <button class="btn sm" data-edit="${p.id}">Edit</button>
          <button class="btn sm danger" data-del="${p.id}">Archive</button>
        </td></tr>`;
      }).join(""), 980);
    $$("#pd-list [data-var]", el).forEach((b) => b.addEventListener("click", () => { location.hash = `#/products?view=variants&pid=${b.dataset.var}`; }));
    $$("#pd-list [data-edit]", el).forEach((b) => b.addEventListener("click", () => productModal(pg.items.find((p) => String(p.id) === b.dataset.edit), () => pg.load(true).then(render))));
    $$("#pd-list [data-del]", el).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Archive this product? It will be hidden from the shop.")) return;
      try { await rq("DELETE", "/api/admin/products/" + b.dataset.del); toastOk("Product archived"); await pg.load(true); render(); }
      catch (e) { toastErr(e.code || "Archive failed"); }
    }));
    $("#pd-more", el).innerHTML = pg.hasMore ? loadMoreBtn("pd-load") : "";
    const lm = $("#pd-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  $("#pd-new", el).addEventListener("click", () => productModal(null, () => pg.load(true).then(render)));
  const apply = () => {
    const s = $("#pd-status", el).value, qq = $("#pd-q", el).value.trim();
    location.hash = "#/products?" + new URLSearchParams({ ...(s ? { status: s } : {}), ...(qq ? { q: qq } : {}) }).toString();
  };
  $("#pd-go", el).addEventListener("click", apply);
  $("#pd-q", el).addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  await pg.load(true);
  render();
};

function parseArrField(v) {
  if (Array.isArray(v)) return v;
  try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return csvToArr(v); }
}
function productModal(p, onSaved) {
  const isNew = !p;
  p = p || {};
  const brandOpts = [["", "— Select brand —"], ...BRANDS.filter((b) => b.active !== 0).map((b) => [b.id, b.name])];
  const body = showModal(isNew ? "New product" : "Edit product", `<form>
    <div class="grid2">
      ${F.sel("brand_id", "Brand", brandOpts, p.brand_id || "", "required")}
      ${F.sel("type", "Type", [["decant", "Decant"], ["sample", "Sample"], ["travel", "Travel"], ["full_bottle", "Full bottle"]], p.type || "decant")}
    </div>
    <div class="grid2">
      ${F.text("name", "Name (EN)", p.name || "", "required data-slug-src")}
      ${F.text("slug", "Slug", p.slug || "", "required data-slug-dst")}
    </div>
    <div class="grid2">
      ${F.sel("gender", "Gender", [["men", "Men"], ["women", "Women"], ["unisex", "Unisex"]], p.gender || "unisex")}
      ${F.text("concentration", "Concentration", p.concentration || "Eau de Parfum")}
    </div>
    <div class="grid2">
      ${F.text("family", "Olfactory family", p.family || "")}
      ${F.num("release_year", "Release year", p.release_year || "")}
    </div>
    ${F.text("perfumer", "Perfumer", p.perfumer || "")}
    ${F.text("top_notes", "Top notes (comma separated)", parseArrField(p.top_notes).join(", "))}
    ${F.text("mid_notes", "Heart notes (comma separated)", parseArrField(p.mid_notes).join(", "))}
    ${F.text("base_notes", "Base notes (comma separated)", parseArrField(p.base_notes).join(", "))}
    ${F.text("accords", "Accords (comma separated)", parseArrField(p.accords).join(", "))}
    ${F.ta("description", "Description (EN)", p.description || "")}
    ${F.ta("description_my", "Description (မြန်မာ)", p.description_my || "")}
    <div class="grid2">
      ${F.sel("longevity", "Longevity (1–5)", [[1, "1 · very weak"], [2, "2 · weak"], [3, "3 · moderate"], [4, "4 · long"], [5, "5 · eternal"]], p.longevity || 3)}
      ${F.sel("sillage", "Sillage (1–5)", [[1, "1 · intimate"], [2, "2 · moderate"], [3, "3 · heavy"], [4, "4 · enormous"], [5, "5 · beast"]], p.sillage || 3)}
    </div>
    ${F.text("origin", "Origin", p.origin || "")}
    <div class="grid2">
      ${F.num("art_seed", "Art seed", p.art_seed || 0)}
      ${F.sel("status", "Status", [["active", "Active"], ["draft", "Draft"], ["archived", "Archived"]], p.status || "active")}
    </div>
    ${F.checks("seasons", "Seasons", SEASONS, parseArrField(p.seasons))}
    ${F.checks("occasions", "Occasions", OCCASIONS, parseArrField(p.occasions))}
    ${F.ta("authenticity", "Authenticity note (EN)", p.authenticity || "")}
    ${F.ta("authenticity_my", "Authenticity note (မြန်မာ)", p.authenticity_my || "")}
    <div class="checks" style="margin-top:14px">
      <label><input type="checkbox" name="featured"${p.featured ? " checked" : ""}> Featured</label>
      <label><input type="checkbox" name="is_new"${p.is_new ? " checked" : ""}> New arrival</label>
      <label><input type="checkbox" name="bestseller"${p.bestseller ? " checked" : ""}> Bestseller</label>
    </div>
    ${isNew ? "" : `
    <div style="margin-top:16px;border-top:1px solid var(--line);padding-top:14px">
      <label style="font-weight:600">Product photo</label>
      <div id="pimg-prev" style="margin:8px 0">${p.image
        ? `<img src="/uploads/products/${_esc(p.image)}" alt="" style="width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`
        : `<span class="muted">No photo uploaded — generated art is shown.</span>`}</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <input type="file" id="pimg-file" accept="image/jpeg,image/png,image/webp">
        <button type="button" class="btn sm" id="pimg-up">Upload photo</button>
        ${p.image ? `<button type="button" class="btn sm danger" id="pimg-del">Remove photo</button>` : ""}
      </div>
      <small class="muted">JPG / PNG / WebP, max 5 MB. The photo replaces the generated art everywhere in the shop.</small>
    </div>`}
    ${modalFooter(isNew ? "Create product" : "Save changes")}
  </form>`);
  wireModal(body, async (form) => {
    const payload = {
      brand_id: Number(val(form, "brand_id")) || null,
      type: val(form, "type"), name: val(form, "name"), slug: val(form, "slug"),
      gender: val(form, "gender"), concentration: val(form, "concentration"),
      family: val(form, "family"),
      release_year: val(form, "release_year") ? Number(val(form, "release_year")) : null,
      perfumer: val(form, "perfumer"),
      top_notes: csvToArr(val(form, "top_notes")), mid_notes: csvToArr(val(form, "mid_notes")),
      base_notes: csvToArr(val(form, "base_notes")), accords: csvToArr(val(form, "accords")),
      description: form.querySelector('[name="description"]').value,
      description_my: form.querySelector('[name="description_my"]').value,
      seasons: checkedVals(form, "seasons"), occasions: checkedVals(form, "occasions"),
      longevity: Number(val(form, "longevity")) || 3, sillage: Number(val(form, "sillage")) || 3,
      origin: val(form, "origin"), art_seed: Number(val(form, "art_seed")) || 0,
      status: val(form, "status"),
      authenticity: form.querySelector('[name="authenticity"]').value,
      authenticity_my: form.querySelector('[name="authenticity_my"]').value,
      featured: chkVal(form, "featured") ? 1 : 0,
      is_new: chkVal(form, "is_new") ? 1 : 0,
      bestseller: chkVal(form, "bestseller") ? 1 : 0,
    };
    if (!payload.brand_id) throw Object.assign(new Error("Pick a brand"), { code: "validation" });
    if (isNew) await rq("POST", "/api/admin/products", payload);
    else await rq("PATCH", "/api/admin/products/" + p.id, payload);
    toastOk(isNew ? "Product created" : "Product saved");
    onSaved();
  });
  // Photo upload (existing products only — needs an id)
  if (!isNew) {
    const upBtn = body.querySelector("#pimg-up");
    const delBtn = body.querySelector("#pimg-del");
    const prev = body.querySelector("#pimg-prev");
    const paint = (img) => {
      p.image = img || "";
      prev.innerHTML = img
        ? `<img src="/uploads/products/${_esc(img)}" alt="" style="width:120px;height:120px;object-fit:cover;border-radius:12px;border:1px solid var(--line)">`
        : `<span class="muted">No photo uploaded — generated art is shown.</span>`;
      if (delBtn) delBtn.style.display = img ? "" : "none";
    };
    if (upBtn) upBtn.addEventListener("click", async () => {
      const file = body.querySelector("#pimg-file").files[0];
      if (!file) { toastErr("Choose a photo first"); return; }
      upBtn.disabled = true;
      try {
        const fd = new FormData();
        fd.append("image", file);
        const res = await fetch("/api/admin/products/" + p.id + "/image", {
          method: "POST", credentials: "same-origin", body: fd,
        });
        const j = await res.json();
        if (!j || !j.ok) throw Object.assign(new Error(j && j.error || "upload_failed"), { code: j && j.error });
        paint(j.data.image);
        toastOk("Photo uploaded");
        onSaved();
      } catch (e) {
        toastErr(e.code === "file_too_large" ? "Photo must be under 5 MB"
          : e.code === "invalid_file_type" ? "JPG, PNG or WebP only"
          : (e.code || "Upload failed"));
      } finally { upBtn.disabled = false; }
    });
    if (delBtn) delBtn.addEventListener("click", async () => {
      if (!confirm("Remove this product's photo?")) return;
      try {
        await rq("DELETE", "/api/admin/products/" + p.id + "/image");
        paint("");
        toastOk("Photo removed");
        onSaved();
      } catch (e) { toastErr(e.code || "Remove failed"); }
    });
  }
}

async function vVariants(el, pid) {
  let prod = null, variants = [];
  try {
    const d = await rq("GET", "/api/admin/products/" + pid + "/variants");
    prod = d.product || null;
    variants = d.variants || d.items || [];
  } catch (e) { toastErr(e.code || "Failed to load variants"); }
  const pname = prod ? prod.name : `Product #${pid}`;
  el.innerHTML = `
  <div class="pagehead"><button class="btn sm" id="vv-back">← Products</button>
    <h1>Variants</h1><span class="sub muted">${_esc(pname)}</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="vv-new">+ New variant</button></div>
  <div id="vv-list"></div>`;
  const render = () => {
    $("#vv-list", el).innerHTML = tableShell(["Name", "Size", "SKU", "Price", "Compare at", "Stock", "Low at", "Active", "Actions"],
      variants.map((v) => `<tr>
        <td><b>${_esc(v.name)}</b><br><small class="muted">${_esc(v.atomizer || "")}</small></td>
        <td class="num">${_esc(v.size_ml)} ml</td><td><small>${_esc(v.sku)}</small></td>
        <td class="num">${_fmtMMK(v.price)} Ks</td><td class="num">${v.compare_at ? _fmtMMK(v.compare_at) + " Ks" : "—"}</td>
        <td class="num" style="${v.stock_qty <= v.low_threshold ? "color:var(--danger);font-weight:700" : ""}">${_esc(v.stock_qty)}</td>
        <td class="num">${_esc(v.low_threshold)}</td>
        <td>${v.active ? badge("yes", "active") : badge("no", "draft")}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit="${v.id}">Edit</button>
        <button class="btn sm danger" data-del="${v.id}">Delete</button></td></tr>`).join(""), 980);
    $$("#vv-list [data-edit]", el).forEach((b) => b.addEventListener("click", () => variantModal(pid, variants.find((v) => String(v.id) === b.dataset.edit), reload)));
    $$("#vv-list [data-del]", el).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this variant? If orders reference it, it will be deactivated instead.")) return;
      try { await rq("DELETE", "/api/admin/variants/" + b.dataset.del); toastOk("Variant removed"); reload(); }
      catch (e) { toastErr(e.code || "Delete failed"); }
    }));
  };
  const reload = async () => {
    try { const d = await rq("GET", "/api/admin/products/" + pid + "/variants"); variants = d.variants || d.items || []; } catch {}
    render();
  };
  const variantModal = (pid2, v, onSaved) => {
    const isNew = !v; v = v || {};
    const body = showModal(isNew ? "New variant" : "Edit variant", `<form>
      <div class="grid2">${F.text("name", "Name", v.name || "5ml Decant", "required")}${F.num("size_ml", "Size (ml)", v.size_ml || 5, "required step=any min=0")}</div>
      <div class="grid2">${F.text("sku", "SKU", v.sku || "", "required")}${F.text("atomizer", "Atomizer", v.atomizer || "Glass spray atomizer")}</div>
      <div class="grid2">${F.num("price", "Price (MMK)", v.price ?? "", "required min=0")}${F.num("compare_at", "Compare-at (MMK)", v.compare_at || "")}</div>
      <div class="grid2">${F.num("stock_qty", "Stock qty", v.stock_qty ?? 0, "min=0")}${F.num("low_threshold", "Low-stock threshold", v.low_threshold ?? 3, "min=0")}</div>
      ${F.chk("active", "Active (visible in shop)", v.active !== 0)}
      ${modalFooter(isNew ? "Create variant" : "Save changes")}
    </form>`);
    wireModal(body, async (form) => {
      const payload = {
        name: val(form, "name"), size_ml: Number(val(form, "size_ml")),
        sku: val(form, "sku"), atomizer: val(form, "atomizer"),
        price: Number(val(form, "price")) || 0,
        compare_at: val(form, "compare_at") ? Number(val(form, "compare_at")) : null,
        stock_qty: Number(val(form, "stock_qty")) || 0,
        low_threshold: Number(val(form, "low_threshold")) || 0,
        active: chkVal(form, "active") ? 1 : 0,
      };
      if (isNew) await rq("POST", `/api/admin/products/${pid2}/variants`, payload);
      else await rq("PATCH", "/api/admin/variants/" + v.id, payload);
      toastOk(isNew ? "Variant created" : "Variant saved");
      onSaved();
    });
  };
  $("#vv-back", el).addEventListener("click", () => { location.hash = "#/products"; });
  $("#vv-new", el).addEventListener("click", () => variantModal(pid, null, reload));
  render();
}

/* ================= BRANDS ================= */
ROUTES.brands = async function (el) {
  let brands = [];
  try { const d = await rq("GET", "/api/admin/brands"); brands = d.brands || d.items || []; } catch (e) { toastErr(e.code || "Failed to load brands"); }
  el.innerHTML = `
  <div class="pagehead"><h1>Brands</h1><span class="sub muted">တံဆိပ်များ</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="br-new">+ New brand</button></div>
  <div id="br-list"></div>`;
  const render = () => {
    $("#br-list", el).innerHTML = tableShell(["Name", "Slug", "Products", "Sort", "Active", "Actions"],
      brands.map((b) => `<tr>
        <td><b>${_esc(b.name)}</b></td><td><small>${_esc(b.slug)}</small></td>
        <td class="num">${_esc(b.product_count ?? "")}</td><td class="num">${_esc(b.sort)}</td>
        <td>${b.active ? badge("yes", "active") : badge("no", "draft")}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit="${b.id}">Edit</button>
        <button class="btn sm danger" data-del="${b.id}">Delete</button></td></tr>`).join(""), 720);
    $$("#br-list [data-edit]", el).forEach((x) => x.addEventListener("click", () => brandModal(brands.find((b) => String(b.id) === x.dataset.edit), reload)));
    $$("#br-list [data-del]", el).forEach((x) => x.addEventListener("click", async () => {
      if (!confirm("Delete this brand? Only possible when no products use it.")) return;
      try { await rq("DELETE", "/api/admin/brands/" + x.dataset.del); toastOk("Brand deleted"); reload(); }
      catch (e) { toastErr(e.code || "Delete failed"); }
    }));
  };
  const reload = async () => {
    try { const d = await rq("GET", "/api/admin/brands"); brands = d.brands || d.items || []; } catch {}
    render();
  };
  const brandModal = (b, onSaved) => {
    const isNew = !b; b = b || {};
    const body = showModal(isNew ? "New brand" : "Edit brand", `<form>
      ${F.text("name", "Name", b.name || "", "required data-slug-src")}
      ${F.text("slug", "Slug", b.slug || "", "required data-slug-dst")}
      ${F.ta("description", "Description (EN)", b.description || "")}
      ${F.ta("description_my", "Description (မြန်မာ)", b.description_my || "")}
      <div class="grid2">${F.num("sort", "Sort order", b.sort || 0)}${F.chk("active", "Active", b.active !== 0)}</div>
      ${modalFooter(isNew ? "Create brand" : "Save changes")}
    </form>`);
    wireModal(body, async (form) => {
      const payload = {
        name: val(form, "name"), slug: val(form, "slug"),
        description: form.querySelector('[name="description"]').value,
        description_my: form.querySelector('[name="description_my"]').value,
        sort: Number(val(form, "sort")) || 0, active: chkVal(form, "active") ? 1 : 0,
      };
      if (isNew) await rq("POST", "/api/admin/brands", payload);
      else await rq("PATCH", "/api/admin/brands/" + b.id, payload);
      toastOk(isNew ? "Brand created" : "Brand saved");
      try { const d2 = await rq("GET", "/api/admin/brands"); BRANDS = d2.brands || d2.items || []; } catch {}
      onSaved();
    });
  };
  $("#br-new", el).addEventListener("click", () => brandModal(null, reload));
  render();
};

/* ================= INVENTORY (source bottles) ================= */
ROUTES.inventory = async function (el, q) {
  const pidF = q.get("product_id") || "";
  let bottles = [];
  const load = async () => {
    try {
      const d = await rq("GET", "/api/admin/bottles" + (pidF ? "?product_id=" + encodeURIComponent(pidF) : ""));
      bottles = d.bottles || d.items || [];
    } catch (e) { toastErr(e.code || "Failed to load bottles"); }
  };
  await load();
  let products = [];
  try { const d = await rq("GET", "/api/admin/products?limit=100"); products = d.items || []; } catch {}
  const pname = (id) => { const p = products.find((x) => String(x.id) === String(id)); return p ? p.name : "#" + id; };
  el.innerHTML = `
  <div class="pagehead"><h1>Inventory</h1><span class="sub muted">source bottles · ml tracking</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="iv-new">+ Add bottle</button></div>
  <div class="toolbar">
    <select id="iv-pid"><option value="">All products</option>
      ${products.map((p) => `<option value="${p.id}"${String(p.id) === pidF ? " selected" : ""}>${_esc(p.name)}</option>`).join("")}
    </select>
    <button class="btn" id="iv-go">Filter</button>
  </div>
  <div id="iv-list"></div>`;
  const render = () => {
    $("#iv-list", el).innerHTML = tableShell(["Ref", "Product", "Original", "Current", "Reserved", "Available", "Supplier / batch", "Actions"],
      bottles.map((b) => {
        const avail = (Number(b.current_ml) || 0) - (Number(b.reserved_ml) || 0);
        return `<tr>
        <td><b>${_esc(b.ref)}</b><br><small class="muted">${fmtDay(b.purchased_at)}</small></td>
        <td>${_esc(b.product_name || pname(b.product_id))}</td>
        <td class="num">${_esc(b.original_ml)} ml</td>
        <td class="num"><b>${_esc(b.current_ml)} ml</b></td>
        <td class="num">${_esc(b.reserved_ml)} ml</td>
        <td class="num" style="${avail <= 0 ? "color:var(--danger);font-weight:700" : ""}">${avail.toFixed(1)} ml</td>
        <td><small>${_esc(b.supplier || "—")}${b.batch ? " · " + _esc(b.batch) : ""}</small></td>
        <td style="white-space:nowrap"><button class="btn sm" data-adj="${b.id}">Adjust ml</button>
        <button class="btn sm" data-mov="${b.id}">Movements</button></td></tr>`;
      }).join(""), 980);
    $$("#iv-list [data-adj]", el).forEach((x) => x.addEventListener("click", () => {
      const b = bottles.find((y) => String(y.id) === x.dataset.adj);
      const body = showModal(`Adjust bottle ${b.ref}`, `<form>
        ${F.num("current_ml", "New current ml", b.current_ml, "required step=any min=0")}
        ${F.text("note", "Note (reason)", "")}
        ${modalFooter("Save adjustment")}
      </form>`);
      wireModal(body, async (form) => {
        await rq("PATCH", "/api/admin/bottles/" + b.id, { current_ml: Number(val(form, "current_ml")), note: val(form, "note") });
        toastOk("Bottle adjusted"); await load(); render();
      });
    }));
    $$("#iv-list [data-mov]", el).forEach((x) => x.addEventListener("click", () => { location.hash = "#/movements?bottle_id=" + x.dataset.mov; }));
  };
  $("#iv-go", el).addEventListener("click", () => {
    const v = $("#iv-pid", el).value;
    location.hash = "#/inventory" + (v ? "?product_id=" + v : "");
  });
  $("#iv-new", el).addEventListener("click", () => {
    const body = showModal("Add source bottle", `<form>
      ${F.sel("product_id", "Product", products.map((p) => [p.id, p.name]), "", "required")}
      <div class="grid2">${F.text("ref", "Ref (unique)", "", "required")}${F.num("original_ml", "Original ml", "", "required step=any min=0")}</div>
      <div class="grid2">${F.text("batch", "Batch code", "")}${F.text("supplier", "Supplier", "")}</div>
      <div class="grid2">${F.num("cost_mmk", "Cost (MMK)", 0, "min=0")}${F.date("purchased_at", "Purchased on", "")}</div>
      ${F.ta("notes", "Notes", "")}
      ${modalFooter("Add bottle")}
    </form>`);
    wireModal(body, async (form) => {
      const pd = val(form, "purchased_at");
      await rq("POST", "/api/admin/bottles", {
        product_id: Number(val(form, "product_id")),
        ref: val(form, "ref"), original_ml: Number(val(form, "original_ml")),
        batch: val(form, "batch"), supplier: val(form, "supplier"),
        cost_mmk: Number(val(form, "cost_mmk")) || 0,
        purchased_at: pd ? new Date(pd).getTime() : null,
        notes: form.querySelector('[name="notes"]').value,
      });
      toastOk("Bottle added"); await load(); render();
    });
  });
  render();
};

/* ================= MOVEMENTS ================= */
ROUTES.movements = async function (el, q) {
  const bidF = q.get("bottle_id") || "", oidF = q.get("order_id") || "";
  const pg = pager("/api/admin/movements?" + new URLSearchParams({ ...(bidF ? { bottle_id: bidF } : {}), ...(oidF ? { order_id: oidF } : {}) }).toString());
  el.innerHTML = `
  <div class="pagehead"><h1>Movements</h1><span class="sub muted">inventory ml ledger</span></div>
  <div class="toolbar">
    <input type="text" id="mv-bid" placeholder="Bottle ID" value="${_esc(bidF)}" style="width:110px">
    <input type="text" id="mv-oid" placeholder="Order ID" value="${_esc(oidF)}" style="width:110px">
    <button class="btn" id="mv-go">Filter</button>
    ${bidF || oidF ? `<button class="btn sm" id="mv-clear">Clear</button>` : ""}
  </div>
  <div id="mv-list"></div><div id="mv-more"></div>`;
  const render = () => {
    $("#mv-list", el).innerHTML = tableShell(["Time", "Bottle", "Type", "Qty (ml)", "Balance", "Order", "Actor", "Note"],
      pg.items.map((m) => `<tr>
        <td>${fmtDate(m.created_at)}</td><td><small>${_esc(m.bottle_ref || ("#" + m.bottle_id))}</small></td>
        <td>${badge(m.type, m.type === "deduct" ? "cancelled" : m.type === "purchase" ? "delivered" : "confirmed")}</td>
        <td class="num">${_esc(m.qty_ml)}</td><td class="num">${_esc(m.balance_ml)}</td>
        <td>${m.order_id ? _esc(m.order_number || ("#" + m.order_id)) : "—"}</td>
        <td><small>${_esc(m.actor_name || (m.actor_id ? "#" + m.actor_id : "system"))}</small></td>
        <td><small>${_esc(m.note || "")}</small></td></tr>`).join(""), 900);
    $("#mv-more", el).innerHTML = pg.hasMore ? loadMoreBtn("mv-load") : "";
    const lm = $("#mv-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  $("#mv-go", el).addEventListener("click", () => {
    const b = $("#mv-bid", el).value.trim(), o = $("#mv-oid", el).value.trim();
    location.hash = "#/movements?" + new URLSearchParams({ ...(b ? { bottle_id: b } : {}), ...(o ? { order_id: o } : {}) }).toString();
  });
  const cl = $("#mv-clear", el);
  if (cl) cl.addEventListener("click", () => { location.hash = "#/movements"; });
  await pg.load(true);
  render();
};

/* ================= CUSTOMERS ================= */
ROUTES.customers = async function (el, q) {
  const qF = q.get("q") || "";
  const pg = pager("/api/admin/customers" + (qF ? "?q=" + encodeURIComponent(qF) : ""));
  const isAdmin = ME.role === "admin";
  el.innerHTML = `
  <div class="pagehead"><h1>Customers</h1><span class="sub muted">ဝယ်သူများ</span></div>
  <div class="toolbar">
    <input type="text" id="cu-q" placeholder="Search name / email / phone" value="${_esc(qF)}" style="min-width:220px">
    <button class="btn" id="cu-go">Search</button>
  </div>
  <div id="cu-list"></div><div id="cu-more"></div>`;
  const render = () => {
    $("#cu-list", el).innerHTML = tableShell(["Name", "Email", "Phone", "Orders", "Spent", "Verified", "Joined", "Actions"],
      pg.items.map((c) => `<tr>
        <td><b>${_esc(c.name)}</b></td><td><small>${_esc(c.email)}</small></td><td>${_esc(c.phone)}</td>
        <td class="num">${_esc(c.order_count ?? "")}</td><td class="num">${c.total_spent != null ? _fmtMMK(c.total_spent) + " Ks" : "—"}</td>
        <td>${c.email_verified ? badge("yes", "active") : badge("no", "draft")}</td>
        <td>${fmtDay(c.created_at)}</td>
        <td><button class="btn sm" data-edit="${c.id}">Edit</button></td></tr>`).join(""), 900);
    $$("#cu-list [data-edit]", el).forEach((b) => b.addEventListener("click", () => {
      const c = pg.items.find((x) => String(x.id) === b.dataset.edit);
      const body = showModal("Edit customer", `<form>
        ${F.text("name", "Name", c.name || "", "required")}
        ${F.text("phone", "Phone", c.phone || "")}
        ${isAdmin ? F.sel("role", "Role", [["customer", "Customer"], ["staff", "Staff"], ["admin", "Admin"]], c.role || "customer") : ""}
        ${modalFooter("Save changes")}
      </form>`);
      wireModal(body, async (form) => {
        const payload = { name: val(form, "name"), phone: val(form, "phone") };
        if (isAdmin) payload.role = val(form, "role");
        await rq("PATCH", "/api/admin/customers/" + c.id, payload);
        toastOk("Customer saved"); await pg.load(true); render();
      });
    }));
    $("#cu-more", el).innerHTML = pg.hasMore ? loadMoreBtn("cu-load") : "";
    const lm = $("#cu-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  const apply = () => { location.hash = "#/customers" + ($("#cu-q", el).value.trim() ? "?q=" + encodeURIComponent($("#cu-q", el).value.trim()) : ""); };
  $("#cu-go", el).addEventListener("click", apply);
  $("#cu-q", el).addEventListener("keydown", (e) => { if (e.key === "Enter") apply(); });
  await pg.load(true);
  render();
};

/* ================= STAFF (admin only) ================= */
ROUTES.staff = async function (el) {
  let staff = [];
  const load = async () => {
    try { const d = await rq("GET", "/api/admin/staff"); staff = d.staff || d.items || []; }
    catch (e) { toastErr(e.code || "Failed to load staff"); }
  };
  await load();
  el.innerHTML = `
  <div class="pagehead"><h1>Staff</h1><span class="sub muted">ဝန်ထမ်းများ · admin only</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="st-new">+ Add staff</button></div>
  <div id="st-list"></div>`;
  const render = () => {
    $("#st-list", el).innerHTML = tableShell(["Name", "Email", "Phone", "Role", "Active", "Actions"],
      staff.map((s) => `<tr>
        <td><b>${_esc(s.name)}</b>${s.id === ME.id ? ' <small class="muted">(you)</small>' : ""}</td>
        <td><small>${_esc(s.email)}</small></td><td>${_esc(s.phone)}</td>
        <td>${badge(s.role, s.role === "admin" ? "delivered" : "confirmed")}</td>
        <td>${s.active !== 0 ? badge("yes", "active") : badge("no", "draft")}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit="${s.id}">Edit</button>
        <button class="btn sm danger" data-del="${s.id}"${s.id === ME.id ? " disabled title='Cannot remove yourself'" : ""}>Remove</button></td></tr>`).join(""), 800);
    $$("#st-list [data-edit]", el).forEach((b) => b.addEventListener("click", () => {
      const s = staff.find((x) => String(x.id) === b.dataset.edit);
      const body = showModal("Edit staff", `<form>
        ${F.text("name", "Name", s.name || "", "required")}
        ${F.text("phone", "Phone", s.phone || "")}
        ${F.sel("role", "Role", [["staff", "Staff"], ["admin", "Admin"]], s.role || "staff")}
        ${F.pass("password", "New password (leave blank to keep)")}
        ${F.chk("active", "Active account", s.active !== 0)}
        ${modalFooter("Save changes")}
      </form>`);
      wireModal(body, async (form) => {
        const payload = { name: val(form, "name"), phone: val(form, "phone"), role: val(form, "role"), active: chkVal(form, "active") ? 1 : 0 };
        const pw = val(form, "password");
        if (pw) payload.password = pw;
        await rq("PATCH", "/api/admin/staff/" + s.id, payload);
        toastOk("Staff saved"); await load(); render();
      });
    }));
    $$("#st-list [data-del]", el).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Remove this staff account?")) return;
      try { await rq("DELETE", "/api/admin/staff/" + b.dataset.del); toastOk("Staff removed"); await load(); render(); }
      catch (e) { toastErr(e.code || "Remove failed"); }
    }));
  };
  $("#st-new", el).addEventListener("click", () => {
    const body = showModal("Add staff", `<form>
      ${F.text("name", "Name", "", "required")}
      ${F.email("email", "Email", "", "required")}
      ${F.text("phone", "Phone (09…)", "")}
      ${F.pass("password", "Password (min 6 chars)", "required")}
      ${F.sel("role", "Role", [["staff", "Staff"], ["admin", "Admin"]], "staff")}
      ${modalFooter("Create staff")}
    </form>`);
    wireModal(body, async (form) => {
      await rq("POST", "/api/admin/staff", {
        name: val(form, "name"), email: val(form, "email"),
        phone: val(form, "phone"), password: val(form, "password"), role: val(form, "role"),
      });
      toastOk("Staff created"); await load(); render();
    });
  });
  render();
};

/* ================= REVIEWS ================= */
ROUTES.reviews = async function (el, q) {
  const statusF = q.get("status") || "pending";
  const pg = pager("/api/admin/reviews?status=" + encodeURIComponent(statusF));
  el.innerHTML = `
  <div class="pagehead"><h1>Reviews</h1><span class="sub muted">သုံးသပ်ချက်များ · moderation</span></div>
  <div class="toolbar">
    <select id="rv-status">
      ${["pending", "published", "rejected"].map((s) => `<option value="${s}"${s === statusF ? " selected" : ""}>${s[0].toUpperCase() + s.slice(1)}</option>`).join("")}
    </select>
    <button class="btn" id="rv-go">Filter</button>
  </div>
  <div id="rv-list"></div><div id="rv-more"></div>`;
  const render = () => {
    $("#rv-list", el).innerHTML = tableShell(["Product", "User", "Rating", "Review", "Status", "Date", "Actions"],
      pg.items.map((r) => `<tr>
        <td><small>${_esc(r.product_name || ("#" + r.product_id))}</small></td>
        <td><small>${_esc(r.user_name || ("#" + r.user_id))}${r.verified ? " ✓" : ""}</small></td>
        <td class="num">${"★".repeat(r.rating)}<br><small class="muted">L${r.longevity || "–"} S${r.sillage || "–"}</small></td>
        <td style="max-width:320px"><b>${_esc(r.title || "")}</b><br><small>${_esc((r.content || "").slice(0, 220))}${(r.content || "").length > 220 ? "…" : ""}</small></td>
        <td>${badge(r.status, r.status)}</td><td>${fmtDate(r.created_at)}</td>
        <td style="white-space:nowrap">
          ${r.status !== "published" ? `<button class="btn sm ok" data-pub="${r.id}">Approve</button>` : ""}
          ${r.status !== "rejected" ? `<button class="btn sm danger" data-rej="${r.id}">Reject</button>` : ""}
        </td></tr>`).join(""), 1000);
    $$("#rv-list [data-pub]", el).forEach((b) => b.addEventListener("click", async () => {
      try { await rq("PATCH", "/api/admin/reviews/" + b.dataset.pub, { status: "published" }); toastOk("Review published"); await pg.load(true); render(); }
      catch (e) { toastErr(e.code || "Failed"); }
    }));
    $$("#rv-list [data-rej]", el).forEach((b) => b.addEventListener("click", async () => {
      try { await rq("PATCH", "/api/admin/reviews/" + b.dataset.rej, { status: "rejected" }); toastOk("Review rejected"); await pg.load(true); render(); }
      catch (e) { toastErr(e.code || "Failed"); }
    }));
    $("#rv-more", el).innerHTML = pg.hasMore ? loadMoreBtn("rv-load") : "";
    const lm = $("#rv-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  $("#rv-go", el).addEventListener("click", () => { location.hash = "#/reviews?status=" + $("#rv-status", el).value; });
  await pg.load(true);
  render();
};

/* ================= COUPONS ================= */
ROUTES.coupons = async function (el) {
  let coupons = [];
  const load = async () => {
    try { const d = await rq("GET", "/api/admin/coupons"); coupons = d.coupons || d.items || []; }
    catch (e) { toastErr(e.code || "Failed to load coupons"); }
  };
  await load();
  el.innerHTML = `
  <div class="pagehead"><h1>Coupons</h1><span class="sub muted">ကူပွန်များ</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="cp-new">+ New coupon</button></div>
  <div id="cp-list"></div>`;
  const render = () => {
    $("#cp-list", el).innerHTML = tableShell(["Code", "Type", "Value", "Min order", "Uses", "Valid", "Active", "Actions"],
      coupons.map((c) => `<tr>
        <td><b>${_esc(c.code)}</b></td><td>${_esc(c.type)}</td>
        <td class="num">${c.type === "percent" ? c.value + "%" : c.type === "free_delivery" ? "—" : _fmtMMK(c.value) + " Ks"}</td>
        <td class="num">${_fmtMMK(c.min_order)} Ks</td>
        <td class="num">${c.used_count}${c.max_uses ? " / " + c.max_uses : ""}</td>
        <td><small>${c.starts_at ? fmtDay(c.starts_at) : "…"} → ${c.ends_at ? fmtDay(c.ends_at) : "…"}</small></td>
        <td>${c.active ? badge("yes", "active") : badge("no", "draft")}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit="${c.id}">Edit</button>
        <button class="btn sm danger" data-del="${c.id}">Delete</button></td></tr>`).join(""), 900);
    $$("#cp-list [data-edit]", el).forEach((b) => b.addEventListener("click", () => couponModal(coupons.find((x) => String(x.id) === b.dataset.edit), reload)));
    $$("#cp-list [data-del]", el).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this coupon?")) return;
      try { await rq("DELETE", "/api/admin/coupons/" + b.dataset.del); toastOk("Coupon deleted"); await load(); render(); }
      catch (e) { toastErr(e.code || "Delete failed"); }
    }));
  };
  const reload = async () => { await load(); render(); };
  const couponModal = (c, onSaved) => {
    const isNew = !c; c = c || { type: "percent", active: 1 };
    const body = showModal(isNew ? "New coupon" : "Edit coupon", `<form>
      <div class="grid2">${F.text("code", "Code", c.code || "", "required style=text-transform:uppercase")}${F.sel("type", "Type", [["percent", "Percent %"], ["fixed", "Fixed MMK"], ["free_delivery", "Free delivery"]], c.type)}</div>
      <div class="grid2">${F.num("value", "Value (% or MMK)", c.value ?? "", "min=0")}${F.num("min_order", "Min order (MMK)", c.min_order || 0, "min=0")}</div>
      <div class="grid2">${F.num("max_uses", "Max uses (blank = unlimited)", c.max_uses || "", "min=1")}${F.chk("active", "Active", c.active !== 0)}</div>
      <div class="grid2">${F.dt("starts_at", "Starts at", dtLocal(c.starts_at))}${F.dt("ends_at", "Ends at", dtLocal(c.ends_at))}</div>
      ${modalFooter(isNew ? "Create coupon" : "Save changes")}
    </form>`);
    wireModal(body, async (form) => {
      const payload = {
        code: val(form, "code").toUpperCase(), type: val(form, "type"),
        value: Number(val(form, "value")) || 0, min_order: Number(val(form, "min_order")) || 0,
        max_uses: val(form, "max_uses") ? Number(val(form, "max_uses")) : null,
        starts_at: msFromDtLocal(val(form, "starts_at")), ends_at: msFromDtLocal(val(form, "ends_at")),
        active: chkVal(form, "active") ? 1 : 0,
      };
      if (isNew) await rq("POST", "/api/admin/coupons", payload);
      else await rq("PATCH", "/api/admin/coupons/" + c.id, payload);
      toastOk(isNew ? "Coupon created" : "Coupon saved");
      onSaved();
    });
  };
  $("#cp-new", el).addEventListener("click", () => couponModal(null, reload));
  render();
};

/* ================= ZONES ================= */
ROUTES.zones = async function (el) {
  let zones = [];
  const load = async () => {
    try { const d = await rq("GET", "/api/admin/zones"); zones = d.zones || d.items || []; }
    catch (e) { toastErr(e.code || "Failed to load zones"); }
  };
  await load();
  el.innerHTML = `
  <div class="pagehead"><h1>Delivery zones</h1><span class="sub muted">ပို့ဆောင်ရေးဇုန်များ</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="zn-new">+ New zone</button></div>
  <div id="zn-list"></div>`;
  const twList = (z) => { try { const a = JSON.parse(z.townships); return Array.isArray(a) ? a : []; } catch { return []; } };
  const render = () => {
    $("#zn-list", el).innerHTML = tableShell(["Name", "Region", "Townships", "Fee", "ETA", "COD", "Active", "Actions"],
      zones.map((z) => {
        const tw = twList(z);
        return `<tr>
        <td><b>${_esc(z.name)}</b><br><small class="muted">${_esc(z.name_my || "")}</small></td>
        <td>${_esc(z.region || "")}</td>
        <td><small>${tw.slice(0, 4).map(_esc).join(", ")}${tw.length > 4 ? ` <span class="muted">+${tw.length - 4} more</span>` : ""}</small></td>
        <td class="num">${_fmtMMK(z.fee)} Ks</td><td><small>${_esc(z.eta_days || "")}</small></td>
        <td>${z.cod_available ? badge("yes", "active") : badge("no", "draft")}</td>
        <td>${z.active ? badge("yes", "active") : badge("no", "draft")}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit="${z.id}">Edit</button>
        <button class="btn sm danger" data-del="${z.id}">Delete</button></td></tr>`;
      }).join(""), 1000);
    $$("#zn-list [data-edit]", el).forEach((b) => b.addEventListener("click", () => zoneModal(zones.find((x) => String(x.id) === b.dataset.edit), reload)));
    $$("#zn-list [data-del]", el).forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Delete this zone?")) return;
      try { await rq("DELETE", "/api/admin/zones/" + b.dataset.del); toastOk("Zone deleted"); await load(); render(); }
      catch (e) { toastErr(e.code || "Delete failed"); }
    }));
  };
  const reload = async () => { await load(); render(); };
  const zoneModal = (z, onSaved) => {
    const isNew = !z; z = z || {};
    const body = showModal(isNew ? "New zone" : "Edit zone", `<form>
      <div class="grid2">${F.text("name", "Name (EN)", z.name || "", "required")}${F.text("name_my", "Name (မြန်မာ)", z.name_my || "")}</div>
      ${F.text("region", "Region", z.region || "")}
      ${F.ta("townships", "Townships — one per line", twList(z).join("\n"))}
      <div class="grid2">${F.num("fee", "Delivery fee (MMK)", z.fee ?? 0, "min=0")}${F.text("eta_days", "ETA (e.g. 1–3 days)", z.eta_days || "")}</div>
      <div class="grid2">${F.num("sort", "Sort order", z.sort || 0)}<div></div></div>
      <div class="checks" style="margin-top:10px">
        <label><input type="checkbox" name="cod_available"${z.cod_available !== 0 ? " checked" : ""}> COD available</label>
        <label><input type="checkbox" name="active"${z.active !== 0 ? " checked" : ""}> Active</label>
      </div>
      ${modalFooter(isNew ? "Create zone" : "Save changes")}
    </form>`);
    wireModal(body, async (form) => {
      const payload = {
        name: val(form, "name"), name_my: val(form, "name_my"), region: val(form, "region"),
        townships: form.querySelector('[name="townships"]').value.split("\n").map((s) => s.trim()).filter(Boolean),
        fee: Number(val(form, "fee")) || 0, eta_days: val(form, "eta_days"),
        sort: Number(val(form, "sort")) || 0,
        cod_available: chkVal(form, "cod_available") ? 1 : 0,
        active: chkVal(form, "active") ? 1 : 0,
      };
      if (isNew) await rq("POST", "/api/admin/zones", payload);
      else await rq("PATCH", "/api/admin/zones/" + z.id, payload);
      toastOk(isNew ? "Zone created" : "Zone saved");
      onSaved();
    });
  };
  $("#zn-new", el).addEventListener("click", () => zoneModal(null, reload));
  render();
};

/* ================= BANNERS ================= */
ROUTES.banners = async function (el) {
  let banners = [];
  const load = async () => {
    try { const d = await rq("GET", "/api/admin/banners"); banners = d.banners || d.items || []; }
    catch (e) { toastErr(e.code || "Failed to load banners"); }
  };
  await load();
  const GRADS = ["peach", "rose", "sage", "lavender", "gold", "sky"];
  el.innerHTML = `
  <div class="pagehead"><h1>Banners</h1><span class="sub muted">ဘန်နာများ</span><div class="spacer" style="flex:1"></div>
    <button class="btn primary" id="bn-new">+ New banner</button></div>
  <div id="bn-list"></div>`;
  const render = () => {
    $("#bn-list", el).innerHTML = tableShell(["Title", "Subtitle", "CTA → link", "Gradient", "Sort", "Active", "Actions"],
      banners.map((b) => `<tr>
        <td><b>${_esc(b.title)}</b><br><small class="muted">${_esc(b.title_my || "")}</small></td>
        <td><small>${_esc(b.subtitle || "")}</small></td>
        <td><small>${_esc(b.cta_text || "—")}${b.link ? ` → <span class="muted">${_esc(b.link)}</span>` : ""}</small></td>
        <td><small>${_esc(b.gradient || "")}</small></td><td class="num">${_esc(b.sort)}</td>
        <td>${b.active ? badge("yes", "active") : badge("no", "draft")}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-edit="${b.id}">Edit</button>
        <button class="btn sm danger" data-del="${b.id}">Delete</button></td></tr>`).join(""), 940);
    $$("#bn-list [data-edit]", el).forEach((x) => x.addEventListener("click", () => bannerModal(banners.find((y) => String(y.id) === x.dataset.edit), reload)));
    $$("#bn-list [data-del]", el).forEach((x) => x.addEventListener("click", async () => {
      if (!confirm("Delete this banner?")) return;
      try { await rq("DELETE", "/api/admin/banners/" + x.dataset.del); toastOk("Banner deleted"); await load(); render(); }
      catch (e) { toastErr(e.code || "Delete failed"); }
    }));
  };
  const reload = async () => { await load(); render(); };
  const bannerModal = (b, onSaved) => {
    const isNew = !b; b = b || {};
    const body = showModal(isNew ? "New banner" : "Edit banner", `<form>
      <div class="grid2">${F.text("title", "Title (EN)", b.title || "", "required")}${F.text("title_my", "Title (မြန်မာ)", b.title_my || "")}</div>
      <div class="grid2">${F.text("subtitle", "Subtitle (EN)", b.subtitle || "")}${F.text("subtitle_my", "Subtitle (မြန်မာ)", b.subtitle_my || "")}</div>
      <div class="grid2">${F.text("cta_text", "CTA text (EN)", b.cta_text || "")}${F.text("cta_text_my", "CTA text (မြန်မာ)", b.cta_text_my || "")}</div>
      <div class="grid2">${F.text("link", "Link", b.link || "")}${F.sel("gradient", "Gradient", GRADS, b.gradient || "peach")}</div>
      <div class="grid2">${F.num("sort", "Sort order", b.sort || 0)}${F.chk("active", "Active", b.active !== 0)}</div>
      ${modalFooter(isNew ? "Create banner" : "Save changes")}
    </form>`);
    wireModal(body, async (form) => {
      const payload = {
        title: val(form, "title"), title_my: val(form, "title_my"),
        subtitle: val(form, "subtitle"), subtitle_my: val(form, "subtitle_my"),
        cta_text: val(form, "cta_text"), cta_text_my: val(form, "cta_text_my"),
        link: val(form, "link"), gradient: val(form, "gradient"),
        sort: Number(val(form, "sort")) || 0, active: chkVal(form, "active") ? 1 : 0,
      };
      if (isNew) await rq("POST", "/api/admin/banners", payload);
      else await rq("PATCH", "/api/admin/banners/" + b.id, payload);
      toastOk(isNew ? "Banner created" : "Banner saved");
      onSaved();
    });
  };
  $("#bn-new", el).addEventListener("click", () => bannerModal(null, reload));
  render();
};

/* ================= CONTENT ================= */
ROUTES.content = async function (el, q) {
  const key = q.get("key") || CONTENT_KEYS[0];
  let page = { key, title: "", body_en: "", body_my: "" };
  try { const d = await rq("GET", "/api/content/" + encodeURIComponent(key)); page = d.content || d.page || d; } catch (e) { /* new key */ }
  el.innerHTML = `
  <div class="pagehead"><h1>Content</h1><span class="sub muted">static pages · EN + မြန်မာ</span></div>
  <div class="toolbar">
    ${CONTENT_KEYS.map((k) => `<button class="btn sm${k === key ? " primary" : ""}" data-key="${k}">${_esc(k)}</button>`).join("")}
  </div>
  <div class="panel"><form id="ct-form">
    ${F.text("title", "Title", page.title || "")}
    ${F.ta("body_en", "Body (EN)", page.body_en || "", 'style="min-height:220px"')}
    ${F.ta("body_my", "Body (မြန်မာ)", page.body_my || "", 'style="min-height:220px"')}
    <div class="actions" style="display:flex;justify-content:flex-end;margin-top:14px">
      <button type="submit" class="btn primary">Save page</button>
    </div>
  </form></div>`;
  $$("[data-key]", el).forEach((b) => b.addEventListener("click", () => { location.hash = "#/content?key=" + b.dataset.key; }));
  $("#ct-form", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    try {
      await rq("PUT", "/api/admin/content/" + encodeURIComponent(key), {
        title: val(form, "title"),
        body_en: form.querySelector('[name="body_en"]').value,
        body_my: form.querySelector('[name="body_my"]').value,
      });
      toastOk("Page saved");
    } catch (err) { toastErr(err.code || "Save failed"); }
  });
};

/* ================= SETTINGS (admin only) ================= */
ROUTES.settings = async function (el) {
  let settings = {};
  try { settings = await rq("GET", "/api/admin/settings"); } catch (e) { toastErr(e.code || "Failed to load settings"); }
  const KNOWN = {
    shop_name: "Shop name", free_delivery_threshold: "Free delivery threshold (MMK)",
    pay_kbzpay: "KBZPay instruction", pay_wavepay: "WavePay instruction",
    pay_ayapay: "AYA Pay instruction", pay_bank: "Bank transfer instruction",
    contact_phone: "Contact phone", promo_notice: "Promo notice (EN)", promo_notice_my: "Promo notice (မြန်မာ)",
  };
  el.innerHTML = `
  <div class="pagehead"><h1>Settings</h1><span class="sub muted">ဆက်တင် · admin only</span></div>
  <div class="panel"><form id="st-form">
    <div id="st-rows"></div>
    <div class="toolbar" style="margin-top:12px">
      <input type="text" id="st-newkey" placeholder="new_setting_key" style="width:200px">
      <button type="button" class="btn sm" id="st-add">+ Add key</button>
      <div class="spacer"></div>
      <button type="submit" class="btn primary">Save all settings</button>
    </div>
    <p class="muted">Payment instructions shown at checkout come from the <b>pay_*</b> keys.</p>
  </form></div>`;
  const rows = $("#st-rows", el);
  const addRow = (k, v) => {
    const div = document.createElement("div");
    div.innerHTML = `<label class="f">${_esc(KNOWN[k] || k)} <span class="muted">· ${_esc(k)}</span>
      <input type="text" data-k="${_esc(k)}" value="${_esc(v)}"></label>`;
    rows.appendChild(div);
  };
  Object.keys(KNOWN).forEach((k) => addRow(k, settings[k] ?? ""));
  Object.keys(settings).filter((k) => !KNOWN[k]).forEach((k) => addRow(k, settings[k]));
  $("#st-add", el).addEventListener("click", () => {
    const k = $("#st-newkey", el).value.trim();
    if (!k) return;
    addRow(k, "");
    $("#st-newkey", el).value = "";
  });
  $("#st-form", el).addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = {};
    $$("input[data-k]", rows).forEach((i) => { payload[i.dataset.k] = i.value; });
    try { await rq("PUT", "/api/admin/settings", payload); toastOk("Settings saved"); }
    catch (err) { toastErr(err.code || "Save failed"); }
  });
};

/* ================= OUTBOX ================= */
ROUTES.outbox = async function (el) {
  const pg = pager("/api/admin/outbox");
  el.innerHTML = `
  <div class="pagehead"><h1>Email outbox</h1><span class="sub muted">transactional email log</span></div>
  <div id="ob-list"></div><div id="ob-more"></div>`;
  const render = () => {
    $("#ob-list", el).innerHTML = tableShell(["To", "Subject", "Template", "Created", "Sent", "Actions"],
      pg.items.map((m) => `<tr>
        <td><small>${_esc(m.to_email)}</small></td>
        <td><small>${_esc(m.subject)}</small></td>
        <td><small>${_esc(m.template || "")}</small></td>
        <td>${fmtDate(m.created_at)}</td>
        <td>${m.sent_at ? fmtDate(m.sent_at) : badge("queued", "pending")}</td>
        <td><button class="btn sm" data-resend="${m.id}">Resend</button></td></tr>`).join(""), 900);
    $$("#ob-list [data-resend]", el).forEach((b) => b.addEventListener("click", async () => {
      try { await rq("POST", "/api/admin/outbox/" + b.dataset.resend + "/resend"); toastOk("Resent"); await pg.load(true); render(); }
      catch (e) { toastErr(e.code || "Resend failed"); }
    }));
    $("#ob-more", el).innerHTML = pg.hasMore ? loadMoreBtn("ob-load") : "";
    const lm = $("#ob-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  await pg.load(true);
  render();
};

/* ================= AUDIT LOG (admin only) ================= */
ROUTES.audit = async function (el) {
  const pg = pager("/api/admin/audit");
  el.innerHTML = `
  <div class="pagehead"><h1>Audit log</h1><span class="sub muted">လုပ်ဆောင်ချက်မှတ်တမ်း · admin only</span></div>
  <div id="au-list"></div><div id="au-more"></div>`;
  const render = () => {
    $("#au-list", el).innerHTML = tableShell(["Time", "Actor", "Action", "Entity", "Entity ID", "Detail"],
      pg.items.map((a) => `<tr>
        <td>${fmtDate(a.created_at)}</td>
        <td><small>${_esc(a.actor_name || (a.actor_id ? "#" + a.actor_id : "system"))}</small></td>
        <td><b>${_esc(a.action)}</b></td>
        <td><small>${_esc(a.entity || "")}</small></td>
        <td><small>${_esc(a.entity_id || "")}</small></td>
        <td><small>${_esc((a.detail || "").slice(0, 160))}</small></td></tr>`).join(""), 900);
    $("#au-more", el).innerHTML = pg.hasMore ? loadMoreBtn("au-load") : "";
    const lm = $("#au-load", el);
    if (lm) lm.addEventListener("click", async () => { lm.disabled = true; await pg.load(); render(); });
  };
  await pg.load(true);
  render();
};
