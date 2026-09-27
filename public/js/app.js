/* ============================================================
   app.js — shared frontend core for the Perfume Decant Shop
   Load order: i18n.js -> app.js -> page script.
   Pages call: initChrome() on DOMContentLoaded.
   ============================================================ */

const state = { user: null, settings: null };

/* ---------- API wrapper ---------- */
async function api(path, opts = {}) {
  const { body, headers, ...rest } = opts;
  const h = Object.assign({}, headers || {});
  let b = body;
  if (body !== undefined && body !== null && typeof body === 'object' && !(body instanceof FormData)) {
    h['Content-Type'] = 'application/json';
    b = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, Object.assign({ credentials: 'same-origin', headers: h, body: b }, rest));
  } catch (e) {
    const err = new Error('network');
    err.code = 'network';
    throw err;
  }
  let json = null;
  try { json = await res.json(); } catch (e) { /* non-JSON */ }
  if (!json || json.ok !== true) {
    const code = (json && json.error) || 'error';
    const err = new Error(code);
    err.code = code;
    err.status = res.status;
    if (json && json.fieldErrors) err.fieldErrors = json.fieldErrors;
    throw err;
  }
  return json.data;
}

function apiErrorMessage(err) {
  if (!err) return t('common.error');
  if (err.code === 'network') return t('error.network');
  const key = 'error.' + err.code;
  const msg = t(key);
  return (msg === key) ? t('common.error') : msg;
}

/* ---------- formatting ---------- */
function fmtMMK(n) {
  const v = Math.round(Number(n) || 0);
  return v.toLocaleString('en-US') + ' ' + t('common.currency');
}

function fmtDate(ts) {
  if (!ts) return '';
  try {
    return new Date(Number(ts)).toLocaleDateString(currentLang() === 'my' ? 'my-MM' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  } catch (e) { return ''; }
}

function fmtDateTime(ts) {
  if (!ts) return '';
  try {
    return new Date(Number(ts)).toLocaleString(currentLang() === 'my' ? 'my-MM' : 'en-GB', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  } catch (e) { return ''; }
}

function esc(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* ---------- toast ---------- */
function toast(msg, isErr) {
  let w = document.querySelector('.toast-wrap');
  if (!w) {
    w = document.createElement('div');
    w.className = 'toast-wrap';
    document.body.appendChild(w);
  }
  const el = document.createElement('div');
  el.className = 'toast' + (isErr ? ' err' : '');
  el.textContent = msg;
  w.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 320);
  }, 2600);
}

/* ---------- generative perfume art (no external images) ---------- */
function perfumeArt(seed, label) {
  const s = String(seed === null || seed === undefined ? 'pds' : seed);
  let h = 7;
  for (let i = 0; i < s.length; i++) { h = ((h * 31) + s.charCodeAt(i)) >>> 0; }
  const hue1 = h % 360;
  const hue2 = (h + 45) % 360;
  const hue3 = (h + 90) % 360;
  const ch = esc((String(label || 'P').trim().charAt(0) || 'P').toUpperCase());
  const gid = 'pg' + (h % 1000000);
  const bx = 78 + (h % 12);            // slight horizontal drift for variety
  return '' +
  '<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">' +
    '<defs>' +
      '<linearGradient id="' + gid + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="hsl(' + hue1 + ',72%,90%)"/>' +
        '<stop offset=".55" stop-color="hsl(' + hue2 + ',68%,85%)"/>' +
        '<stop offset="1" stop-color="hsl(' + hue3 + ',62%,80%)"/>' +
      '</linearGradient>' +
      '<linearGradient id="' + gid + 'b" x1="0" y1="0" x2="1" y2="0">' +
        '<stop offset="0" stop-color="rgba(255,255,255,.75)"/>' +
        '<stop offset=".5" stop-color="rgba(255,255,255,.25)"/>' +
        '<stop offset="1" stop-color="rgba(255,255,255,.55)"/>' +
      '</linearGradient>' +
    '</defs>' +
    '<rect width="200" height="220" fill="url(#' + gid + ')"/>' +
    '<circle cx="' + (30 + h % 40) + '" cy="36" r="46" fill="rgba(255,255,255,.28)"/>' +
    '<circle cx="' + (160 - h % 30) + '" cy="188" r="60" fill="rgba(255,255,255,.20)"/>' +
    '<circle cx="' + (168 - h % 20) + '" cy="30" r="14" fill="rgba(255,255,255,.35)"/>' +
    /* bottle: cap, neck, body */
    '<rect x="' + (bx - 13) + '" y="34" width="26" height="22" rx="4" fill="#4A3428"/>' +
    '<rect x="' + (bx - 17) + '" y="56" width="34" height="14" rx="3" fill="rgba(74,52,40,.75)"/>' +
    '<rect x="' + (bx - 38) + '" y="70" width="76" height="112" rx="18" fill="rgba(255,255,255,.38)" stroke="rgba(255,255,255,.85)" stroke-width="2"/>' +
    '<rect x="' + (bx - 38) + '" y="70" width="76" height="112" rx="18" fill="url(#' + gid + 'b)"/>' +
    /* liquid */
    '<rect x="' + (bx - 30) + '" y="104" width="60" height="70" rx="12" fill="hsl(' + hue2 + ',60%,72%)" opacity=".55"/>' +
    /* highlight */
    '<rect x="' + (bx - 28) + '" y="80" width="9" height="88" rx="4.5" fill="rgba(255,255,255,.6)"/>' +
    /* monogram medallion */
    '<circle cx="' + bx + '" cy="140" r="24" fill="rgba(251,247,240,.9)" stroke="rgba(74,52,40,.35)" stroke-width="1.5"/>' +
    '<text x="' + bx + '" y="149" text-anchor="middle" font-family="Georgia,serif" font-size="24" font-weight="bold" fill="#4A3428">' + ch + '</text>' +
    /* base shadow */
    '<ellipse cx="' + bx + '" cy="192" rx="42" ry="7" fill="rgba(74,52,40,.14)"/>' +
  '</svg>';
}

/* ---------- status badges ---------- */
function statusBadge(status) {
  if (!status) return '';
  const isPay = String(status).indexOf('proof') === 0 ||
    ['pending', 'paid', 'failed', 'refunded'].indexOf(status) >= 0;
  const key = (isPay ? 'ps.' : 'st.') + status;
  const label = t(key) === key ? status : t(key);
  return '<span class="badge st-' + esc(status) + '">' + esc(label) + '</span>';
}

function paymentMethodLabel(method) {
  const map = { cod: 'checkout.cod', kbzpay: 'KBZPay', wavepay: 'WavePay', ayapay: 'AYA Pay', bank: 'Bank Transfer' };
  if (map[method] === 'checkout.cod') return t('checkout.cod');
  return map[method] || method;
}

/* ---------- stars ---------- */
function stars(avg) {
  const n = Math.round(Number(avg) || 0);
  let s = '';
  for (let i = 1; i <= 5; i++) s += i <= n ? '★' : '☆';
  return '<span class="stars" aria-hidden="true">' + s + '</span>';
}

/* ---------- product card (shared) ---------- */
function productCard(p) {
  const slug = esc(p.slug || '');
  const name = esc(p.name || '');
  const brand = esc(p.brand || '');
  const art = perfumeArt(p.art_seed || p.id, p.name);
  const flags = [];
  if (p.is_new) flags.push('<span class="badge b-new">' + esc(t('shop.sort_new')) + '</span>');
  if (p.bestseller) flags.push('<span class="badge b-best">' + esc(t('home.best_sellers')) + '</span>');
  const priceHtml = (p.min_price !== undefined)
    ? (p.min_price === p.max_price
        ? fmtMMK(p.min_price)
        : fmtMMK(p.min_price) + ' <small>–</small> ' + fmtMMK(p.max_price))
    : '';
  const stock = p.in_stock === false
    ? '<div class="stock-note out">' + esc(t('product.out_of_stock')) + '</div>'
    : '<div class="stock-note ok">' + esc(t('product.in_stock')) + '</div>';
  const rating = (p.rating_count > 0)
    ? '<div class="card-rating">' + stars(p.rating_avg) + '<span>(' + Number(p.rating_count) + ')</span></div>'
    : '';
  return '' +
  '<article class="product-card" data-product-id="' + esc(p.id) + '">' +
    '<a class="card-art" href="/product.html?slug=' + slug + '" aria-label="' + name + '">' + art +
      '<div class="card-flags">' + flags.join('') + '</div>' +
    '</a>' +
    '<button class="icon-btn fav-btn" data-fav="' + esc(p.id) + '" aria-label="' + esc(t('nav.favorites')) + '" title="' + esc(t('nav.favorites')) + '">♡</button>' +
    '<div class="card-body">' +
      '<div class="card-brand">' + brand + '</div>' +
      '<a class="card-name" href="/product.html?slug=' + slug + '">' + name + '</a>' +
      rating +
      '<div class="card-foot">' +
        '<div class="price">' + priceHtml + '</div>' +
        '<button class="btn btn-primary btn-sm" data-add="' + slug + '"' + (p.in_stock === false ? ' disabled' : '') + '>' + esc(t('product.add_to_cart')) + '</button>' +
      '</div>' +
      stock +
    '</div>' +
  '</article>';
}

/* card-level interactions: quick add + favorite (event delegation) */
function bindCardActions(scope) {
  const root = scope || document;
  if (root.__cardsBound) return;
  root.__cardsBound = true;
  root.addEventListener('click', async (e) => {
    const addBtn = e.target.closest('[data-add]');
    if (addBtn && !addBtn.disabled) {
      e.preventDefault();
      await quickAdd(addBtn.dataset.add, addBtn);
      return;
    }
    const favBtn = e.target.closest('[data-fav]');
    if (favBtn) {
      e.preventDefault();
      e.stopPropagation();
      await toggleFavorite(favBtn.dataset.fav, favBtn);
    }
  });
}

async function quickAdd(slug, btn) {
  try {
    if (btn) { btn.disabled = true; }
    const product = await api('/api/products/' + encodeURIComponent(slug));
    const variants = (product.variants || []).filter(v => v.active && v.stock_qty > 0);
    if (!variants.length) { toast(t('common.out_of_stock_msg'), true); return; }
    variants.sort((a, b) => a.size_ml - b.size_ml);
    await api('/api/cart/items', { method: 'POST', body: { variant_id: variants[0].id, qty: 1 } });
    await updateCartBadge();
    toast(t('common.added_to_cart'));
  } catch (err) {
    toast(apiErrorMessage(err), true);
  } finally {
    if (btn) { btn.disabled = false; }
  }
}

async function toggleFavorite(productId, btn) {
  try {
    const r = await api('/api/favorites/' + encodeURIComponent(productId), { method: 'POST' });
    if (btn) {
      btn.classList.toggle('faved', !!r.favorited);
      btn.textContent = r.favorited ? '♥' : '♡';
    }
    toast(t(r.favorited ? 'product.favorite_added' : 'product.favorite_removed'));
    document.dispatchEvent(new CustomEvent('favoriteschange', { detail: { productId, favorited: r.favorited } }));
  } catch (err) {
    if (err.code === 'auth_required' || err.status === 401) {
      toast(t('product.login_to_favorite'), true);
      setTimeout(() => { location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search); }, 900);
    } else {
      toast(apiErrorMessage(err), true);
    }
  }
}

/* ---------- header / footer ---------- */
function renderHeader() {
  const host = document.getElementById('siteHeader');
  if (!host) return;
  const u = state.user;
  const accountArea = u
    ? '<button class="account-chip" id="accountChip" aria-haspopup="true">' +
        '<span class="avatar">' + esc((u.name || u.email || 'U').trim().charAt(0).toUpperCase()) + '</span>' +
        '<span>' + esc(u.name || u.email || '') + '</span>' +
      '</button>'
    : '<a class="btn btn-ghost btn-sm" href="/login.html" data-i18n="nav.login">Log In</a>' +
      '<a class="btn btn-primary btn-sm" href="/register.html" data-i18n="nav.register">Sign Up</a>';
  host.innerHTML =
  '<div class="promo-bar" id="promoBar" hidden></div>' +
  '<div class="site-header"><div class="container header-inner">' +
    '<a class="logo" href="/index.html" aria-label="Home">' +
      '<span class="logo-mark">P</span>' +
      '<span class="logo-name" data-shop-name data-i18n="brand_name">Maison Décant</span>' +
    '</a>' +
    '<button class="icon-btn hamburger" id="navToggle" data-i18n-aria="nav.menu" aria-label="Menu">☰</button>' +
    '<nav class="main-nav" id="mainNav" aria-label="Primary">' +
      '<a href="/index.html" data-nav="home" data-i18n="nav.home">Home</a>' +
      '<a href="/shop.html" data-nav="shop" data-i18n="nav.shop">Shop</a>' +
      '<a href="/track.html" data-nav="track" data-i18n="nav.track">Track Order</a>' +
      (u ? '<a href="/orders.html" data-nav="orders" data-i18n="nav.orders">My Orders</a>' : '') +
      (u && (u.role === 'admin' || u.role === 'staff') ? '<a href="/admin/index.html" data-i18n="nav.admin">Admin</a>' : '') +
    '</nav>' +
    '<div class="header-actions">' +
      '<div class="lang-switch" role="group" aria-label="Language">' +
        '<button data-lang="en" type="button">EN</button>' +
        '<button data-lang="my" type="button">မြန်မာ</button>' +
      '</div>' +
      '<a class="icon-btn cart-btn" href="/cart.html" data-i18n-aria="nav.cart" aria-label="Cart">🛍<span class="cart-count" id="cartCount" hidden>0</span></a>' +
      accountArea +
    '</div>' +
  '</div></div>';

  const navToggle = host.querySelector('#navToggle');
  const mainNav = host.querySelector('#mainNav');
  navToggle.addEventListener('click', () => {
    mainNav.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (mainNav.classList.contains('open') &&
        !mainNav.contains(e.target) && !navToggle.contains(e.target)) {
      mainNav.classList.remove('open');
    }
  });
  host.querySelectorAll('.lang-switch button').forEach(b => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
  const chip = host.querySelector('#accountChip');
  if (chip) {
    chip.addEventListener('click', () => {
      if (confirm(t('nav.logout') + '?')) doLogout();
    });
  }
  markActiveNav();
}

function markActiveNav() {
  const path = location.pathname;
  document.querySelectorAll('[data-nav]').forEach(a => {
    const key = a.dataset.nav;
    const on = (key === 'home' && (path === '/' || path.endsWith('/index.html'))) ||
               (key !== 'home' && path.indexOf('/' + key) === 0);
    a.classList.toggle('active', on);
  });
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch (e) { /* ignore */ }
  state.user = null;
  toast(t('auth.logout_done'));
  setTimeout(() => { location.href = '/index.html'; }, 600);
}

function renderFooter() {
  const host = document.getElementById('siteFooter');
  if (!host) return;
  host.innerHTML =
  '<div class="site-footer"><div class="container">' +
    '<div class="footer-grid">' +
      '<div class="footer-col">' +
        '<div class="logo" style="margin-bottom:.8rem"><span class="logo-mark">P</span><span class="logo-name" data-shop-name data-i18n="brand_name">Maison Décant</span></div>' +
        '<p class="text-soft" style="font-size:.9rem" data-i18n="brand_tag"></p>' +
        '<p class="text-soft" style="font-size:.9rem" id="footerContact"></p>' +
      '</div>' +
      '<div class="footer-col"><h4 data-i18n="home.shop_links">Shop</h4><ul>' +
        '<li><a href="/shop.html" data-i18n="nav.shop">Shop</a></li>' +
        '<li><a href="/shop.html?sort=new" data-i18n="home.new_arrivals">New Arrivals</a></li>' +
        '<li><a href="/shop.html?sort=bestselling" data-i18n="home.best_sellers">Best Sellers</a></li>' +
        '<li><a href="/favorites.html" data-i18n="nav.favorites">Favorites</a></li>' +
      '</ul></div>' +
      '<div class="footer-col"><h4 data-i18n="home.policies">Policies</h4><ul>' +
        '<li><a href="/page.html?key=shipping" data-i18n="policy.shipping">Shipping &amp; Delivery</a></li>' +
        '<li><a href="/page.html?key=returns" data-i18n="policy.returns">Returns</a></li>' +
        '<li><a href="/page.html?key=privacy" data-i18n="policy.privacy">Privacy</a></li>' +
        '<li><a href="/page.html?key=terms" data-i18n="policy.terms">Terms</a></li>' +
      '</ul></div>' +
      '<div class="footer-col"><h4 data-i18n="home.contact">Contact</h4><ul>' +
        '<li><a href="/track.html" data-i18n="nav.track">Track Order</a></li>' +
        '<li><a href="/account.html" data-i18n="nav.account">Account</a></li>' +
      '</ul></div>' +
    '</div>' +
    '<div class="footer-bottom">' +
      '<span>© <span id="year"></span> <span data-shop-name data-i18n="brand_name">Maison Décant</span>. <span data-i18n="home.rights">All rights reserved.</span></span>' +
    '</div>' +
  '</div></div>';
  const y = host.querySelector('#year');
  if (y) y.textContent = new Date().getFullYear();
  applyI18n(host);
}

/* ---------- cart badge ---------- */
async function updateCartBadge() {
  const b = document.getElementById('cartCount');
  if (!b) return;
  try {
    const cart = await api('/api/cart');
    const n = (cart.lines || []).reduce((a, l) => a + (Number(l.qty) || 0), 0);
    b.textContent = n;
    b.hidden = n <= 0;
  } catch (e) {
    b.hidden = true;
  }
}

/* ---------- auth guard ---------- */
async function requireAuth() {
  let me = null;
  try { me = await api('/api/auth/me'); } catch (e) { me = null; }
  if (me && me.user) { state.user = me.user; return me.user; }
  location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
  const err = new Error('auth_required');
  err.code = 'auth_required';
  throw err;
}

async function requireStaff() {
  const u = await requireAuth();
  if (u.role !== 'admin' && u.role !== 'staff') {
    location.href = '/index.html';
    const err = new Error('forbidden');
    err.code = 'forbidden';
    throw err;
  }
  return u;
}

/* ---------- boot ---------- */
async function loadPublicSettings() {
  try {
    const s = await api('/api/settings/public');
    state.settings = s || {};
    const bar = document.getElementById('promoBar');
    const lang = currentLang();
    const notice = (lang === 'my' && s.promo_notice_my) ? s.promo_notice_my : s.promo_notice;
    if (bar && notice) { bar.textContent = notice; bar.hidden = false; }
    if (s.shop_name) {
      document.querySelectorAll('[data-shop-name]').forEach(el => { el.textContent = s.shop_name; });
      document.title = s.shop_name;
    }
    const fc = document.getElementById('footerContact');
    if (fc && s.contact_phone) fc.textContent = '☎ ' + s.contact_phone;
  } catch (e) { /* settings are optional chrome */ }
}

async function initChrome() {
  renderHeader();
  renderFooter();
  applyI18n();
  bindCardActions(document);
  loadPublicSettings();
  try {
    const me = await api('/api/auth/me');
    state.user = (me && me.user) ? me.user : null;
    renderHeader();
    applyI18n();
  } catch (e) { state.user = null; }
  updateCartBadge();
  document.addEventListener('langchange', () => {
    loadPublicSettings();
    updateCartBadge();
  });
}
