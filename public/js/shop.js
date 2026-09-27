/* Shop catalog page — Tech Stack 2 (vanilla JS, no build step).
 * Reads filter state from URL query params, fetches GET /api/products,
 * renders product cards, "load more" via nextCursor, and syncs every
 * filter change back to the URL (history.replaceState) before reloading.
 * Reuses shared helpers when present: api(), fmtMMK(), t(), applyI18n(),
 * perfumeArt(), updateCartBadge(). All own strings fall back to the
 * embedded EN+MM dictionaries below via tt().
 */
(function () {
  'use strict';

  /* ---------- embedded i18n (EN + Myanmar) ---------- */
  var STR = {
    en: {
      'shop.search_ph': 'Search perfumes, brands, notes…',
      'shop.results': '{n} fragrances',
      'shop.results_one': '1 fragrance',
      'shop.loading': 'Loading…',
      'shop.load_more': 'Load more',
      'shop.badge_new': 'NEW', 'shop.badge_best': 'BESTSELLER',
      'shop.in_stock': 'In Stock', 'shop.sold_out': 'Sold Out',
      'shop.from': 'From', 'shop.reviews': 'reviews',
      'shop.fav_on': 'Saved to favorites', 'shop.fav_off': 'Removed from favorites',
      'shop.login_fav': 'Please log in to save favorites.',
      'shop.err_load': 'Could not load products. Please try again.',
      'shop.season.spring': 'Spring', 'shop.season.summer': 'Summer',
      'shop.season.autumn': 'Autumn', 'shop.season.winter': 'Winter',
      'shop.occasion.daily': 'Daily', 'shop.occasion.office': 'Office',
      'shop.occasion.evening': 'Evening', 'shop.occasion.formal': 'Formal',
      'shop.occasion.date': 'Date', 'shop.occasion.party': 'Party',
      'shop.occasion.gift': 'Gift',
      'shop.gender.masculine': 'Masculine', 'shop.gender.feminine': 'Feminine',
      'shop.gender.unisex': 'Unisex'
    },
    my: {
      'shop.search_ph': 'ရေမွှေး၊ ဘရမ်း၊ နုတ်များ ရှာဖွေရန်…',
      'shop.results': 'ရေမွှေး {n} မျိုး',
      'shop.results_one': 'ရေမွှေး ၁ မျိုး',
      'shop.loading': 'ဖတ်နေသည်…',
      'shop.load_more': 'နောက်ထပ်ပြရန်',
      'shop.badge_new': 'အသစ်', 'shop.badge_best': 'အရောင်းရဆုံး',
      'shop.in_stock': 'ပစ္စည်းရှိ', 'shop.sold_out': 'ကုန်နေ',
      'shop.from': 'မှ', 'shop.reviews': 'သုံးသပ်ချက်',
      'shop.fav_on': 'အကြိုက်ဆုံးထဲ သိမ်းပြီးပါပြီ',
      'shop.fav_off': 'အကြိုက်ဆုံးထဲက ဖယ်ရှားပြီးပါပြီ',
      'shop.login_fav': 'အကြိုက်ဆုံးသိမ်းရန် အကောင့်ဝင်ပါ။',
      'shop.err_load': 'ထုတ်ကုန်များ ဖတ်၍မရပါ။ ထပ်ကြိုးစားပါ။',
      'shop.season.spring': 'နွေဦး', 'shop.season.summer': 'နွေ',
      'shop.season.autumn': 'ဆောင်းဦး', 'shop.season.winter': 'ဆောင်း',
      'shop.occasion.daily': 'နေ့စဉ်', 'shop.occasion.office': 'ရုံး',
      'shop.occasion.evening': 'ညနေ', 'shop.occasion.formal': 'ပွဲတက်',
      'shop.occasion.date': 'ချိန်းတွေ့', 'shop.occasion.party': 'ပါတီ',
      'shop.occasion.gift': 'လက်ဆောင်',
      'shop.gender.masculine': 'အမျိုးသား', 'shop.gender.feminine': 'အမျိုးသမီး',
      'shop.gender.unisex': 'ကျား/မ'
    }
  };

  function curLang() {
    try {
      var l = document.documentElement.lang || '';
      if (l.slice(0, 2).toLowerCase() === 'my') return 'my';
      var s = localStorage.getItem('lang') || '';
      if (s.slice(0, 2).toLowerCase() === 'my') return 'my';
    } catch (e) {}
    return 'en';
  }
  function tt(key, vars) {
    var s = null;
    try { if (typeof t === 'function') s = t(key); } catch (e) {}
    if (!s || s === key) {
      var L = curLang();
      s = (STR[L] && STR[L][key]) || STR.en[key] || key;
    }
    if (vars) Object.keys(vars).forEach(function (k) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    });
    return s;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function money(n) {
    try { if (typeof fmtMMK === 'function') return fmtMMK(n); } catch (e) {}
    return Number(n || 0).toLocaleString('en-US') + ' MMK';
  }
  /* api(): shared helper if present, else plain fetch. Normalises the
   * {ok,data} envelope and throws {code} on API errors. */
  async function req(path, opts) {
    opts = opts || {};
    var r;
    if (typeof api === 'function') {
      r = await api('/api' + path, { method: opts.method || 'GET', body: opts.body });
    } else {
      var res = await fetch('/api' + path, {
        method: opts.method || 'GET',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: opts.body ? JSON.stringify(opts.body) : undefined
      });
      r = await res.json().catch(function () { return null; });
    }
    if (r && typeof r === 'object' && 'ok' in r) {
      if (!r.ok) {
        var e = new Error(r.error || 'api_error');
        e.code = r.error; e.fieldErrors = r.fieldErrors; throw e;
      }
      return r.data;
    }
    return r;
  }
  function artImg(p, cls) {
    var seed = p.art_seed || p.slug, label = p.name;
    try {
      if (typeof perfumeArt === 'function') {
        var r = perfumeArt(seed, label);
        if (typeof productVisual === 'function') r = productVisual(p, r);
        if (typeof r === 'string' && r) {
          if (r.charAt(0) === '<') {
            return '<span class="' + cls + '" role="img" aria-label="' + esc(label) + '">' + r + '</span>';
          }
          return '<img class="' + cls + '" src="' + esc(r) + '" alt="' + esc(label) + '" loading="lazy">';
        }
      }
    } catch (e) {}
    var h = 0; var s = String(seed || label || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var hues = [340, 265, 210, 25, 150];
    var hue = hues[h % hues.length];
    return '<div class="' + cls + '" role="img" aria-label="' + esc(label) + '" style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,hsl(' +
      hue + ',60%,88%),hsl(' + ((hue + 40) % 360) + ',55%,78%));color:#3E2B21;font-family:serif;font-size:2rem">' +
      esc(String(label || '?').trim().charAt(0).toUpperCase()) + '</div>';
  }
  function stars(avg) {
    var full = Math.round(Number(avg) || 0);
    var s = '';
    for (var i = 1; i <= 5; i++) s += i <= full ? '★' : '☆';
    return s;
  }
  var toastTimer = null;
  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }
  function $(id) { return document.getElementById(id); }

  /* ---------- filter state <-> URL ---------- */
  var PARAMS = ['q', 'brand', 'min_price', 'max_price', 'size', 'family',
    'concentration', 'gender', 'season', 'occasion',
    'min_longevity', 'min_sillage', 'available', 'sort'];

  function readURL() {
    var p = new URLSearchParams(location.search);
    return {
      q: p.get('q') || '',
      brand: p.getAll('brand').filter(Boolean),
      min_price: p.get('min_price') || '',
      max_price: p.get('max_price') || '',
      size: p.get('size') || '',
      family: p.get('family') || '',
      concentration: p.get('concentration') || '',
      gender: p.get('gender') || '',
      season: p.get('season') || '',
      occasion: p.get('occasion') || '',
      min_longevity: p.get('min_longevity') || '',
      min_sillage: p.get('min_sillage') || '',
      available: p.get('available') === '1',
      sort: p.get('sort') || 'new'
    };
  }
  function syncURL() {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    state.brand.forEach(function (b) { p.append('brand', b); });
    ['min_price', 'max_price', 'size', 'family', 'concentration',
     'gender', 'season', 'occasion', 'min_longevity', 'min_sillage'].forEach(function (k) {
      if (state[k]) p.set(k, state[k]);
    });
    if (state.available) p.set('available', '1');
    if (state.sort && state.sort !== 'new') p.set('sort', state.sort);
    var qs = p.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }
  function queryString(extra) {
    var p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    state.brand.forEach(function (b) { p.append('brand', b); });
    ['min_price', 'max_price', 'size', 'family', 'concentration',
     'gender', 'season', 'occasion', 'min_longevity', 'min_sillage'].forEach(function (k) {
      if (state[k]) p.set(k, state[k]);
    });
    if (state.available) p.set('available', '1');
    if (state.sort) p.set('sort', state.sort);
    p.set('limit', '24');
    if (extra) Object.keys(extra).forEach(function (k) { p.set(k, extra[k]); });
    return p.toString();
  }

  var state = readURL();
  var cursor = null, hasMore = false, loading = false, total = 0;
  var favSet = {};   // productId -> true (only known when logged in)
  var searchTimer = null;

  /* ---------- filter controls ---------- */
  function optLabel(kind, v) {
    var key = 'shop.' + kind + '.' + String(v).toLowerCase();
    var s = null;
    try { if (typeof t === 'function') s = t(key); } catch (e) {}
    if (s && s !== key) return s;
    var L = curLang();
    var hit = (STR[L] && STR[L][key]) || STR.en[key];
    return hit || v;
  }
  function fillSelect(id, values, kind) {
    var sel = $(id);
    var keep = sel.querySelector('option[value=""]');
    sel.innerHTML = '';
    if (keep) sel.appendChild(keep);
    (values || []).forEach(function (v) {
      var o = document.createElement('option');
      o.value = v; o.textContent = kind ? optLabel(kind, v) : v;
      sel.appendChild(o);
    });
  }
  async function loadMeta() {
    try {
      var brands = await req('/brands');
      var list = (brands && brands.brands) || brands || [];
      var box = $('fBrands');
      box.innerHTML = '';
      list.forEach(function (b) {
        var slug = b.slug || b.name;
        var lab = document.createElement('label');
        lab.className = 'f-check';
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = slug; cb.name = 'brand';
        cb.checked = state.brand.indexOf(slug) !== -1;
        cb.addEventListener('change', onBrandChange);
        lab.appendChild(cb);
        lab.appendChild(document.createTextNode(' ' + (b.name || slug)));
        box.appendChild(lab);
      });
    } catch (e) { $('fBrands').innerHTML = ''; }
    try {
      var f = await req('/filters');
      fillSelect('fFamily', f.families, null);
      fillSelect('fConcentration', f.concentrations, null);
      fillSelect('fGender', f.genders, 'gender');
      fillSelect('fSeason', f.seasons, 'season');
      fillSelect('fOccasion', f.occasions, 'occasion');
      if (f.priceBounds) {
        if (!state.min_price) $('fMinPrice').placeholder = money(f.priceBounds.min).replace(' MMK', '');
        if (!state.max_price) $('fMaxPrice').placeholder = money(f.priceBounds.max).replace(' MMK', '');
      }
    } catch (e) {}
  }
  function paintControls() {
    $('q').value = state.q;
    $('q').placeholder = tt('shop.search_ph');
    $('sort').value = state.sort;
    $('fMinPrice').value = state.min_price;
    $('fMaxPrice').value = state.max_price;
    $('fSize').value = state.size;
    $('fFamily').value = state.family;
    $('fConcentration').value = state.concentration;
    $('fGender').value = state.gender;
    $('fSeason').value = state.season;
    $('fOccasion').value = state.occasion;
    $('fMinLongevity').value = state.min_longevity;
    $('fMinSillage').value = state.min_sillage;
    $('fAvailable').checked = state.available;
  }

  function reload() {
    cursor = null; hasMore = false;
    syncURL();
    loadProducts(true);
  }
  function onBrandChange() {
    var checked = Array.prototype.filter.call(
      document.querySelectorAll('#fBrands input[name=brand]:checked'),
      function () { return true; }).map(function (c) { return c.value; });
    state.brand = checked;
    reload();
  }

  /* ---------- product list ---------- */
  function cardHTML(p) {
    var price = (p.min_price === p.max_price || !p.max_price)
      ? money(p.min_price)
      : tt('shop.from') + ' ' + money(p.min_price);
    var stockCls = p.in_stock ? 'ok' : 'out';
    var stockTxt = p.in_stock ? tt('shop.in_stock') : tt('shop.sold_out');
    var badges = '';
    if (p.is_new) badges += '<span class="badge new">' + esc(tt('shop.badge_new')) + '</span>';
    if (p.bestseller) badges += '<span class="badge best">' + esc(tt('shop.badge_best')) + '</span>';
    var fav = favSet[p.id] ? ' on' : '';
    var rc = p.rating_count ? ' <span class="cnt">(' + p.rating_count + ')</span>' : '';
    return '<article class="p-card">' +
      '<div class="p-art"><a href="/product.html?slug=' + encodeURIComponent(p.slug) + '" aria-label="' + esc(p.name) + '">' +
      artImg(p, '') + '</a>' +
      (badges ? '<div class="p-badges">' + badges + '</div>' : '') +
      '<button class="fav-btn' + fav + '" data-fav="' + p.id + '" aria-label="favorite">' +
      (favSet[p.id] ? '♥' : '♡') + '</button></div>' +
      '<div class="p-body">' +
      '<div class="p-brand">' + esc(p.brand || '') + '</div>' +
      '<h3 class="p-name"><a href="/product.html?slug=' + encodeURIComponent(p.slug) + '">' + esc(p.name) + '</a></h3>' +
      '<div class="p-stars">' + stars(p.rating_avg) + rc + '</div>' +
      '<div class="p-price">' + esc(price) + '</div>' +
      '<div class="p-stock ' + stockCls + '">' + esc(stockTxt) + '</div>' +
      '</div></article>';
  }

  function setLoading(first) {
    var grid = $('grid');
    if (first) {
      grid.innerHTML = '';
      for (var i = 0; i < 8; i++) {
        var d = document.createElement('div');
        d.className = 'skel'; grid.appendChild(d);
      }
      $('emptyState').hidden = true;
    }
    var btn = $('loadMore');
    btn.disabled = true;
    btn.textContent = tt('shop.loading');
  }

  async function loadProducts(first) {
    if (loading) return;
    loading = true;
    if (first) setLoading(true);
    else { var b = $('loadMore'); b.disabled = true; b.textContent = tt('shop.loading'); }
    try {
      var extra = {};
      if (cursor) extra.cursor = cursor;
      var data = await req('/products?' + queryString(extra));
      var items = data.items || [];
      total = data.total != null ? data.total : total;
      cursor = data.nextCursor || null;
      hasMore = !!data.hasMore;
      var grid = $('grid');
      if (first) grid.innerHTML = '';
      grid.insertAdjacentHTML('beforeend', items.map(cardHTML).join(''));
      $('emptyState').hidden = grid.children.length > 0;
      $('resultCount').textContent = total === 1 ? tt('shop.results_one') : tt('shop.results', { n: total });
      var btn = $('loadMore');
      btn.hidden = !hasMore;
      btn.disabled = false;
      btn.textContent = tt('shop.load_more');
      if (typeof applyI18n === 'function') { try { applyI18n(); } catch (e) {} }
    } catch (e) {
      if (first) {
        $('grid').innerHTML = '';
        $('emptyState').hidden = false;
        $('emptyState').querySelector('h2').textContent = tt('shop.err_load');
      } else toast(tt('shop.err_load'));
    }
    loading = false;
  }

  async function toggleFav(btn) {
    var id = btn.getAttribute('data-fav');
    try {
      var data = await req('/favorites/' + id, { method: 'POST' });
      var on = !!(data && data.favorited);
      favSet[id] = on;
      btn.classList.toggle('on', on);
      btn.textContent = on ? '♥' : '♡';
      toast(on ? tt('shop.fav_on') : tt('shop.fav_off'));
    } catch (e) {
      if (e && (e.code === 'auth_required' || e.code === 'forbidden')) {
        toast(tt('shop.login_fav'));
        location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
      } else toast(tt('shop.err_load'));
    }
  }

  async function loadFavState() {
    try {
      var data = await req('/favorites');
      (data.items || []).forEach(function (p) { favSet[p.id] = true; });
      document.querySelectorAll('[data-fav]').forEach(function (btn) {
        if (favSet[btn.getAttribute('data-fav')]) {
          btn.classList.add('on'); btn.textContent = '♥';
        }
      });
    } catch (e) { /* guest or error: hearts stay neutral */ }
  }

  /* ---------- events ---------- */
  function bind() {
    $('q').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        state.q = e.target.value.trim();
        reload();
      }, 400);
    });
    $('searchBtn').addEventListener('click', function () {
      clearTimeout(searchTimer);
      state.q = $('q').value.trim();
      reload();
    });
    $('sort').addEventListener('change', function (e) { state.sort = e.target.value; reload(); });
    $('fAvailable').addEventListener('change', function (e) { state.available = e.target.checked; reload(); });
    [['fSize', 'size'], ['fFamily', 'family'], ['fConcentration', 'concentration'],
     ['fGender', 'gender'], ['fSeason', 'season'], ['fOccasion', 'occasion'],
     ['fMinLongevity', 'min_longevity'], ['fMinSillage', 'min_sillage']].forEach(function (pair) {
      $(pair[0]).addEventListener('change', function (e) { state[pair[1]] = e.target.value; reload(); });
    });
    $('applyPrice').addEventListener('click', function () {
      state.min_price = $('fMinPrice').value.trim();
      state.max_price = $('fMaxPrice').value.trim();
      reload();
    });
    [$('fMinPrice'), $('fMaxPrice')].forEach(function (inp) {
      inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); $('applyPrice').click(); }
      });
    });
    $('clearFilters').addEventListener('click', function () {
      state = readURL(); // reset helper shape
      state = { q: '', brand: [], min_price: '', max_price: '', size: '', family: '',
        concentration: '', gender: '', season: '', occasion: '',
        min_longevity: '', min_sillage: '', available: false, sort: 'new' };
      paintControls();
      document.querySelectorAll('#fBrands input[name=brand]').forEach(function (c) { c.checked = false; });
      reload();
    });
    $('loadMore').addEventListener('click', function () { loadProducts(false); });
    $('grid').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-fav]');
      if (btn) { e.preventDefault(); toggleFav(btn); }
    });
    var ft = $('filterToggle');
    var panel = $('filterPanel');
    var setFilters = function (open) {
      panel.classList.toggle('open', open);
      ft.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    };
    ft.addEventListener('click', function () {
      setFilters(!panel.classList.contains('open'));
    });
    var fc = $('filterClose');
    if (fc) fc.addEventListener('click', function () { setFilters(false); });
    document.addEventListener('click', function (e) {
      if (panel.classList.contains('open') &&
          !panel.contains(e.target) && !ft.contains(e.target)) {
        setFilters(false);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('open')) setFilters(false);
    });
  }

  /* ---------- init ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    try { if (typeof applyI18n === 'function') applyI18n(); } catch (e) {}
    try { if (typeof updateCartBadge === 'function') updateCartBadge(); } catch (e) {}
    paintControls();
    bind();
    loadMeta().then(paintControls);
    loadProducts(true);
    loadFavState();
  });
})();
