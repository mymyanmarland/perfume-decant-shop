/* Product detail page — Tech Stack 2 (vanilla JS, no build step).
 * Loads GET /api/products/:slug and renders: gallery, info, variant
 * selector, quantity stepper, add-to-cart (POST /api/cart/items),
 * favorite toggle, reviews (list + write-review form for logged-in
 * users via POST /api/reviews), and related fragrances.
 * Reuses shared helpers when present: api(), fmtMMK(), t(),
 * applyI18n(), perfumeArt(), updateCartBadge().
 */
(function () {
  'use strict';

  /* ---------- embedded i18n (EN + Myanmar) ---------- */
  var STR = {
    en: {
      'product.notes_top': 'Top Notes', 'product.notes_heart': 'Heart Notes',
      'product.notes_base': 'Base Notes',
      'product.longevity': 'Longevity', 'product.sillage': 'Sillage',
      'product.only_left': 'Only {n} left in stock', 'product.in_stock': 'In Stock',
      'product.out_of_stock': 'Out of Stock', 'product.low_stock': 'Low Stock',
      'product.added': 'Added to cart', 'product.added_err': 'Could not add to cart. Please try again.',
      'product.select_size': 'Please choose a decant size first.',
      'product.fav_on': 'Saved to favorites', 'product.fav_off': 'Removed from favorites',
      'product.login_fav': 'Please log in to save favorites.',
      'product.login_review': 'Please log in to write a review.',
      'product.login': 'Log in',
      'product.your_rating': 'Your Rating', 'product.your_longevity': 'Longevity (optional)',
      'product.your_sillage': 'Sillage (optional)', 'product.rev_title': 'Title (optional)',
      'product.rev_title_ph': 'Sum it up in a few words', 'product.rev_content': 'Your Review',
      'product.rev_content_ph': 'How does it smell? How long does it last on you? (min 10 characters)',
      'product.submit_review': 'Submit Review', 'product.review_ok': 'Thank you! Your review is pending approval.',
      'product.review_err': 'Could not submit review. Please check the form.',
      'product.no_reviews': 'No reviews yet — be the first to share your thoughts!',
      'product.write_review': 'Write a Review',
      'product.verified': 'Verified Purchase',
      'product.reviews_of': '{n} reviews',
      'product.auth_default': 'Every decant is poured fresh from a sealed, authentic retail bottle. Batch codes available on request.',
      'product.err_load': 'Could not load this fragrance. Please try again later.',
      'product.qty_max': 'Only {n} available',
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
      'product.notes_top': 'အပေါ်ယံ နုတ်များ', 'product.notes_heart': 'အလယ် နုတ်များ',
      'product.notes_base': 'အောက် နုတ်များ',
      'product.longevity': 'ခံနိုင်ရည်', 'product.sillage': 'ရနံ့ပျံ့နှံ့မှု',
      'product.only_left': '{n} ခုသာ ကျန်ရှိပါသည်', 'product.in_stock': 'ပစ္စည်းရှိ',
      'product.out_of_stock': 'ကုန်နေ', 'product.low_stock': 'ပစ္စည်းနည်းနေ',
      'product.added': 'ဈေးခြင်းထဲသို့ ထည့်ပြီးပါပြီ',
      'product.added_err': 'ဈေးခြင်းထဲ ထည့်၍မရပါ။ ထပ်ကြိုးစားပါ။',
      'product.select_size': 'Decant ပမာဏ အရင်ရွေးချယ်ပါ။',
      'product.fav_on': 'အကြိုက်ဆုံးထဲ သိမ်းပြီးပါပြီ',
      'product.fav_off': 'အကြိုက်ဆုံးထဲက ဖယ်ရှားပြီးပါပြီ',
      'product.login_fav': 'အကြိုက်ဆုံးသိမ်းရန် အကောင့်ဝင်ပါ။',
      'product.login_review': 'သုံးသပ်ချက်ရေးရန် အကောင့်ဝင်ပါ။',
      'product.login': 'အကောင့်ဝင်ရန်',
      'product.your_rating': 'သင့်အဆင့်သတ်မှတ်ချက်',
      'product.your_longevity': 'ခံနိုင်ရည် (ရွေးချယ်နိုင်)',
      'product.your_sillage': 'ရနံ့ပျံ့နှံ့မှု (ရွေးချယ်နိုင်)',
      'product.rev_title': 'ခေါင်းစဉ် (ရွေးချယ်နိုင်)',
      'product.rev_title_ph': 'အကျဉ်းချုပ် ခေါင်းစဉ်ရေးပါ',
      'product.rev_content': 'သင့်သုံးသပ်ချက်',
      'product.rev_content_ph': 'ဘယ်လိုအနံ့ရလဲ? ဘယ်လောက်ကြာခံလဲ? (အနည်းဆုံး စာလုံး ၁၀ လုံး)',
      'product.submit_review': 'သုံးသပ်ချက် တင်သွင်းရန်',
      'product.review_ok': 'ကျေးဇူးတင်ပါသည်။ သုံးသပ်ချက်ကို စစ်ဆေးနေပါသည်။',
      'product.review_err': 'သုံးသပ်ချက် တင်၍မရပါ။ ဖောင်ကို စစ်ဆေးပါ။',
      'product.no_reviews': 'သုံးသပ်ချက်မရှိသေးပါ — ပထမဆုံး ရေးသားပေးပါ။',
      'product.write_review': 'သုံးသပ်ချက်ရေးရန်',
      'product.verified': 'ဝယ်ယူမှု အတည်ပြု',
      'product.reviews_of': 'သုံးသပ်ချက် {n} ခု',
      'product.auth_default': 'Decant တိုင်းကို စစ်မှန်သော အလုံပိတ် retail ပုလင်းမှ လတ်လတ်ဆတ်ဆတ် ခွဲထည့်ပေးပါသည်။ Batch code များ တောင်းခံနိုင်ပါသည်။',
      'product.err_load': 'ဤရေမွှေးကို ဖတ်၍မရပါ။ နောက်မှ ထပ်ကြိုးစားပါ။',
      'product.qty_max': '{n} ခုသာ ရနိုင်ပါသည်',
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
  function artSrc(seed, label) {
    try {
      if (typeof perfumeArt === 'function') {
        var r = perfumeArt(seed, label);
        if (typeof r === 'string' && r) return r;
      }
    } catch (e) {}
    return null;
  }
  function artHTML(seed, label, cls, style) {
    var src = artSrc(seed, label);
    var st = style ? ' style="' + style + '"' : '';
    if (src && src.charAt(0) === '<') {
      return '<span class="' + cls + '" role="img" aria-label="' + esc(label) + '"' + st + '>' + src + '</span>';
    }
    if (src) return '<img class="' + cls + '" src="' + esc(src) + '" alt="' + esc(label) + '"' + st + '>';
    var h = 0; var s = String(seed || label || '');
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    var hues = [340, 265, 210, 25, 150];
    var hue = hues[h % hues.length];
    return '<div class="' + cls + '" role="img" aria-label="' + esc(label) + '"' + st +
      ' style="display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,hsl(' +
      hue + ',60%,88%),hsl(' + ((hue + 40) % 360) + ',55%,78%));color:#3E2B21;font-family:serif;font-size:3.4rem' +
      (style ? ';' + style : '') + '">' + esc(String(label || '?').trim().charAt(0).toUpperCase()) + '</div>';
  }
  function stars(avg) {
    var full = Math.round(Number(avg) || 0), s = '';
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
  function valLabel(kind, v) {
    var key = 'shop.' + kind + '.' + String(v).toLowerCase();
    var s = null;
    try { if (typeof t === 'function') s = t(key); } catch (e) {}
    if (s && s !== key) return s;
    var L = curLang();
    return (STR[L] && STR[L][key]) || STR.en[key] || v;
  }

  var slug = new URLSearchParams(location.search).get('slug') || '';
  var product = null;
  var selVariant = null;
  var qty = 1;
  var me = null;
  var revCursor = null, revHasMore = false;

  /* ---------- gallery ---------- */
  function renderGallery() {
    var seed = product.art_seed || product.slug;
    var label = product.name;
    var main = $('artMain');
    var thumbs = $('pdThumbs');
    // Uploaded photo takes over the whole gallery; otherwise show art variants.
    if (typeof productVisual === 'function' && (product.image_url || product.image)) {
      main.insertAdjacentHTML('afterbegin',
        productVisual(product, '') .replace('loading="lazy"', ''));
      thumbs.innerHTML = '';
      thumbs.style.display = 'none';
    } else {
    // main + 3 gradient variants (derived seeds) as thumbnails
    var arts = [seed, seed + '-alt1', seed + '-alt2', seed + '-alt3'];
    main.insertAdjacentHTML('afterbegin', artHTML(arts[0], label, 'pd-art-img', 'width:100%;height:100%;object-fit:cover'));
    thumbs.innerHTML = '';
    thumbs.style.display = '';
    arts.forEach(function (sd, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pd-thumb' + (i === 0 ? ' active' : '');
      b.setAttribute('aria-label', 'View ' + (i + 1));
      b.innerHTML = artHTML(sd, label, '', '');
      b.addEventListener('click', function () {
        thumbs.querySelectorAll('.pd-thumb').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var img = main.querySelector('img, div[role=img]');
        if (img) img.remove();
        main.insertAdjacentHTML('afterbegin', artHTML(sd, label, 'pd-art-img', 'width:100%;height:100%;object-fit:cover'));
      });
      thumbs.appendChild(b);
    });
    } // end art-variant gallery
    var badges = '';
    if (product.is_new) badges += '<span class="badge new">NEW</span>';
    if (product.bestseller) badges += '<span class="badge best">BESTSELLER</span>';
    $('pdBadges').innerHTML = badges;
  }

  /* ---------- info + variants ---------- */
  function stockInfo(v) {
    if (!v || v.stock_qty <= 0) return { cls: 'out', txt: tt('product.out_of_stock') };
    if (v.stock_qty <= (v.low_threshold || 3)) return { cls: 'low', txt: tt('product.only_left', { n: v.stock_qty }) };
    return { cls: 'ok', txt: tt('product.in_stock') };
  }
  function renderInfo() {
    $('crumbName').textContent = product.name;
    document.title = product.name + ' — ' + (product.brand && product.brand.name || product.brand || '');
    $('pdBrand').textContent = (product.brand && product.brand.name) || product.brand || '';
    $('pdName').textContent = product.name;
    var meta = [];
    if (product.concentration) meta.push(esc(product.concentration));
    if (product.family) meta.push(esc(product.family));
    if (product.gender) meta.push(esc(valLabel('gender', product.gender)));
    if (product.release_year) meta.push(esc(String(product.release_year)));
    $('pdMeta').innerHTML = meta.join(' <span aria-hidden="true">·</span> ');
    var rc = product.rating_count ? ' <a href="#reviewsSection">' + esc(tt('product.reviews_of', { n: product.rating_count })) + '</a>' : '';
    $('pdStars').innerHTML = '<span aria-label="rated ' + esc(String(product.rating_avg || 0)) + ' of 5">' +
      stars(product.rating_avg) + '</span>' + rc;
    // description lang-aware
    var L = curLang();
    var desc = (L === 'my' && product.description_my) ? product.description_my : product.description;
    $('pdDesc').textContent = desc || '';
    var auth = (L === 'my' && product.authenticity_my) ? product.authenticity_my : product.authenticity;
    $('authText').textContent = auth || tt('product.auth_default');
    renderVariants();
    updatePriceBlock();
  }
  function renderVariants() {
    var wrap = $('vPills');
    wrap.innerHTML = '';
    var variants = (product.variants || []).filter(function (v) { return v.active !== 0 && v.active !== false; });
    variants.forEach(function (v) {
      var st = stockInfo(v);
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'v-pill' + (selVariant && selVariant.id === v.id ? ' active' : '');
      b.disabled = v.stock_qty <= 0;
      b.innerHTML = '<span class="sz">' + esc(v.size_ml) + ' ml</span>' +
        '<span class="pr">' + esc(money(v.price)) + '</span>' +
        '<span class="st ' + st.cls + '">' + esc(st.txt) + '</span>';
      b.addEventListener('click', function () {
        selVariant = v; qty = 1;
        wrap.querySelectorAll('.v-pill').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        updatePriceBlock();
      });
      wrap.appendChild(b);
    });
    if (!selVariant) {
      selVariant = variants.find(function (v) { return v.stock_qty > 0; }) || variants[0] || null;
      if (selVariant) {
        var first = wrap.querySelector('.v-pill:not([disabled])') || wrap.querySelector('.v-pill');
        if (first) first.classList.add('active');
      }
    }
  }
  function updatePriceBlock() {
    var btn = $('addCart');
    if (!selVariant) {
      $('pdPrice').textContent = '';
      $('pdStockLine').textContent = '';
      btn.disabled = true;
      return;
    }
    var cmp = selVariant.compare_at && selVariant.compare_at > selVariant.price
      ? '<span class="compare">' + esc(money(selVariant.compare_at)) + '</span>' : '';
    $('pdPrice').innerHTML = esc(money(selVariant.price)) + cmp;
    var st = stockInfo(selVariant);
    var line = $('pdStockLine');
    line.className = 'pd-stockline ' + st.cls;
    line.textContent = st.txt + (selVariant.atomizer ? ' · ' + selVariant.atomizer : '');
    btn.disabled = selVariant.stock_qty <= 0;
    paintQty();
  }
  function paintQty() {
    var max = selVariant ? selVariant.stock_qty : 1;
    if (qty > max) qty = Math.max(1, max);
    if (qty < 1) qty = 1;
    $('qVal').value = qty;
  }

  /* ---------- notes / accords / meters ---------- */
  function asArr(v) {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string') { try { var p = JSON.parse(v); return Array.isArray(p) ? p : [v]; } catch (e) { return [v]; } }
    return [];
  }
  function renderDetails() {
    var top = asArr(product.top_notes), heart = asArr(product.mid_notes),
        base = asArr(product.base_notes), accords = asArr(product.accords);
    function col(title, notes, icon) {
      if (!notes.length) return '';
      return '<div class="note-col"><h3>' + icon + ' ' + esc(title) + '</h3><ul>' +
        notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>';
    }
    $('pyramid').innerHTML =
      col(tt('product.notes_top'), top, '✦') +
      col(tt('product.notes_heart'), heart, '❧') +
      col(tt('product.notes_base'), base, '⬢');
    $('accords').innerHTML = accords.map(function (a) {
      return '<span class="chip">' + esc(a) + '</span>';
    }).join('');
    function meter(label, val) {
      var segs = '';
      for (var i = 1; i <= 5; i++) segs += '<span class="seg' + (i <= val ? ' fill' : '') + '"></span>';
      return '<div class="meter-row"><span>' + esc(label) + '</span><div class="meter">' + segs +
        '</div><b>' + esc(String(val || 0)) + '/5</b></div>';
    }
    $('meters').innerHTML = meter(tt('product.longevity'), product.longevity) +
      meter(tt('product.sillage'), product.sillage);
    $('seasons').innerHTML = asArr(product.seasons).map(function (s) {
      return '<span class="chip">' + esc(valLabel('season', s)) + '</span>';
    }).join('');
    $('occasions').innerHTML = asArr(product.occasions).map(function (o) {
      return '<span class="chip">' + esc(valLabel('occasion', o)) + '</span>';
    }).join('');
  }

  /* ---------- cart / favorite ---------- */
  async function addToCart() {
    if (!selVariant) { toast(tt('product.select_size')); return; }
    if (selVariant.stock_qty <= 0) { toast(tt('product.out_of_stock')); return; }
    var btn = $('addCart');
    btn.disabled = true;
    try {
      await req('/cart/items', { method: 'POST', body: { variant_id: selVariant.id, qty: qty } });
      toast(tt('product.added'));
      try { if (typeof updateCartBadge === 'function') updateCartBadge(); } catch (e) {}
    } catch (e) {
      toast((e && e.fieldErrors && e.fieldErrors.qty) || tt('product.added_err'));
    }
    btn.disabled = selVariant.stock_qty <= 0;
  }
  async function toggleFav() {
    var btn = $('favBtn');
    try {
      var data = await req('/favorites/' + product.id, { method: 'POST' });
      var on = !!(data && data.favorited);
      btn.classList.toggle('on', on);
      btn.textContent = on ? '♥' : '♡';
      toast(on ? tt('product.fav_on') : tt('product.fav_off'));
    } catch (e) {
      if (e && (e.code === 'auth_required' || e.code === 'forbidden')) {
        toast(tt('product.login_fav'));
        location.href = '/login.html?next=' + encodeURIComponent(location.pathname + location.search);
      } else toast(tt('product.added_err'));
    }
  }

  /* ---------- reviews ---------- */
  function revHTML(r) {
    var d = new Date(r.created_at || Date.now());
    var date = d.toLocaleDateString(curLang() === 'my' ? 'my-MM' : 'en-GB',
      { year: 'numeric', month: 'short', day: 'numeric' });
    return '<article class="rev"><div class="rev-head"><div>' +
      '<span class="rev-name">' + esc(r.user_name || '—') + '</span>' +
      (r.verified ? '<span class="rev-verified">' + esc(tt('product.verified')) + '</span>' : '') +
      '<div class="rev-stars">' + stars(r.rating) + '</div></div>' +
      '<span class="rev-date">' + esc(date) + '</span></div>' +
      (r.title ? '<div class="rev-title">' + esc(r.title) + '</div>' : '') +
      '<p class="rev-body">' + esc(r.content || '') + '</p></article>';
  }
  function renderReviews(items, append) {
    var list = $('revList');
    if (!append) list.innerHTML = '';
    if (!items.length && !append) {
      list.innerHTML = '<p style="color:var(--ink-soft)">' + esc(tt('product.no_reviews')) + '</p>';
      return;
    }
    list.insertAdjacentHTML('beforeend', items.map(revHTML).join(''));
  }
  async function loadMoreReviews() {
    if (!revHasMore) return;
    var btn = $('revMore');
    btn.disabled = true;
    try {
      var data = await req('/products/' + encodeURIComponent(slug) + '/reviews' +
        (revCursor ? '?cursor=' + encodeURIComponent(revCursor) : ''));
      renderReviews(data.items || [], true);
      revCursor = data.nextCursor || null;
      revHasMore = !!data.hasMore;
      btn.hidden = !revHasMore;
    } catch (e) {}
    btn.disabled = false;
  }
  function renderReviewForm() {
    var wrap = $('revFormWrap');
    if (!me) {
      wrap.innerHTML = '<p style="margin-top:18px;color:var(--ink-soft)">' + esc(tt('product.login_review')) +
        ' <a href="/login.html?next=' + encodeURIComponent(location.pathname + location.search) +
        '" style="color:var(--gold);font-weight:700">' + esc(tt('product.login')) + '</a></p>';
      return;
    }
    wrap.innerHTML =
      '<form class="rev-form" id="revForm"><h3 style="margin:0" class="serif">' + esc(tt('product.write_review')) + '</h3>' +
      '<label>' + esc(tt('product.your_rating')) +
      '<span class="star-input" id="starInput">' +
      [1, 2, 3, 4, 5].map(function (i) { return '<span data-v="' + i + '">★</span>'; }).join('') +
      '</span></label>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">' +
      '<label>' + esc(tt('product.your_longevity')) +
      '<select id="revLong"><option value="">—</option>' +
      [1, 2, 3, 4, 5].map(function (i) { return '<option value="' + i + '">' + i + ' / 5</option>'; }).join('') +
      '</select></label>' +
      '<label>' + esc(tt('product.your_sillage')) +
      '<select id="revSil"><option value="">—</option>' +
      [1, 2, 3, 4, 5].map(function (i) { return '<option value="' + i + '">' + i + ' / 5</option>'; }).join('') +
      '</select></label></div>' +
      '<label>' + esc(tt('product.rev_title')) +
      '<input id="revTitle" maxlength="120" placeholder="' + esc(tt('product.rev_title_ph')) + '"></label>' +
      '<label>' + esc(tt('product.rev_content')) +
      '<textarea id="revContent" rows="4" minlength="10" maxlength="2000" required placeholder="' +
      esc(tt('product.rev_content_ph')) + '"></textarea></label>' +
      '<button class="btn-submit" type="submit">' + esc(tt('product.submit_review')) + '</button></form>';
    var rating = 5;
    var starBox = $('starInput');
    function paintStars() {
      starBox.querySelectorAll('span').forEach(function (sp) {
        sp.classList.toggle('on', Number(sp.getAttribute('data-v')) <= rating);
      });
    }
    starBox.addEventListener('click', function (e) {
      var sp = e.target.closest('span[data-v]');
      if (sp) { rating = Number(sp.getAttribute('data-v')); paintStars(); }
    });
    paintStars();
    $('revForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var btn = e.target.querySelector('.btn-submit');
      btn.disabled = true;
      var content = $('revContent').value.trim();
      if (content.length < 10) { toast(tt('product.review_err')); btn.disabled = false; return; }
      try {
        await req('/reviews', {
          method: 'POST',
          body: {
            product_id: product.id,
            rating: rating,
            longevity: $('revLong').value ? Number($('revLong').value) : undefined,
            sillage: $('revSil').value ? Number($('revSil').value) : undefined,
            title: $('revTitle').value.trim() || undefined,
            content: content
          }
        });
        wrap.innerHTML = '<p style="margin-top:18px;color:#2e7d4f;font-weight:600">' +
          esc(tt('product.review_ok')) + '</p>';
      } catch (err) {
        toast((err && err.fieldErrors && err.fieldErrors.content) || tt('product.review_err'));
        btn.disabled = false;
      }
    });
  }

  /* ---------- related ---------- */
  function renderRelated() {
    var rel = product.related || [];
    var sec = $('relSection'), track = $('relTrack');
    if (!rel.length) { sec.hidden = true; return; }
    sec.hidden = false;
    track.innerHTML = '';
    rel.forEach(function (p) {
      var price = (p.min_price === p.max_price || !p.max_price)
        ? money(p.min_price) : money(p.min_price) + ' +';
      var a = document.createElement('a');
      a.className = 'p-card rel-card';
      a.href = '/product.html?slug=' + encodeURIComponent(p.slug);
      a.innerHTML = '<div class="p-art">' + (typeof productVisual === 'function'
        ? productVisual(p, artHTML(p.art_seed || p.slug, p.name, '', ''))
        : artHTML(p.art_seed || p.slug, p.name, '', '')) + '</div>' +
        '<div class="p-body"><div class="p-brand">' + esc(p.brand || '') + '</div>' +
        '<h3 class="p-name">' + esc(p.name) + '</h3>' +
        '<div class="p-stars">' + stars(p.rating_avg) + '</div>' +
        '<div class="p-price">' + esc(price) + '</div></div>';
      track.appendChild(a);
    });
  }

  /* ---------- init ---------- */
  async function init() {
    try { if (typeof applyI18n === 'function') applyI18n(); } catch (e) {}
    try { if (typeof updateCartBadge === 'function') updateCartBadge(); } catch (e) {}
    try { var m = await req('/auth/me'); me = (m && m.user) || null; } catch (e) { me = null; }

    if (!slug) { $('pdSkeleton').hidden = true; $('pdError').hidden = false; return; }
    try {
      var data = await req('/products/' + encodeURIComponent(slug));
      product = data.product || data;
      if (!product || !product.id) throw new Error('not_found');
    } catch (e) {
      $('pdSkeleton').hidden = true;
      $('pdError').hidden = false;
      toast(tt('product.err_load'));
      return;
    }
    $('pdSkeleton').hidden = true;
    $('pdContent').hidden = false;

    renderGallery();
    renderInfo();
    renderDetails();
    renderRelated();

    // reviews: first page came with product; paginate the rest
    var first = product.reviews || [];
    $('revCount').textContent = product.rating_count ? '(' + product.rating_count + ')' : '';
    renderReviews(first, false);
    revCursor = null; revHasMore = false;
    // if product payload included pagination hints, honour them
    if (product.reviews_nextCursor) { revCursor = product.reviews_nextCursor; revHasMore = true; }
    else if (first.length >= 6 && (product.rating_count || 0) > first.length) {
      // fall back: cursor = last review id (API uses keyset cursor)
      revCursor = first[first.length - 1].id; revHasMore = true;
    }
    $('revMore').hidden = !revHasMore;
    $('revMore').addEventListener('click', loadMoreReviews);

    renderReviewForm();

    // favorite initial state
    try {
      var favs = await req('/favorites');
      var on = (favs.items || []).some(function (p) { return p.id === product.id; });
      $('favBtn').classList.toggle('on', on);
      $('favBtn').textContent = on ? '♥' : '♡';
    } catch (e) {}

    // buy box events
    $('qMinus').addEventListener('click', function () { qty--; paintQty(); });
    $('qPlus').addEventListener('click', function () {
      var max = selVariant ? selVariant.stock_qty : 1;
      if (qty < max) qty++; else toast(tt('product.qty_max', { n: max }));
      paintQty();
    });
    $('qVal').addEventListener('change', function (e) {
      qty = parseInt(e.target.value, 10) || 1; paintQty();
    });
    $('addCart').addEventListener('click', addToCart);
    $('favBtn').addEventListener('click', toggleFav);

    try { if (typeof applyI18n === 'function') applyI18n(); } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', init);
})();
