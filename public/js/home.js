/* ============================================================
   home.js — homepage: banners carousel, product sections, brands
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  initChrome();
  loadBanners();
  loadSections();
  loadBrands();
  document.addEventListener('langchange', () => {
    loadBanners();
    loadSections();
    loadBrands();
  });
});

/* ---------- banners carousel ---------- */
let carTimer = null;
let carIndex = 0;
let carCount = 0;

function bannerText(b, field) {
  const lang = currentLang();
  const myKey = field + '_my';
  if (lang === 'my' && b[myKey]) return b[myKey];
  return b[field] || '';
}

function defaultSlide() {
  return {
    title: t('home.hero_title'),
    subtitle: t('home.hero_sub'),
    cta_text: t('home.hero_cta'),
    cta_link: '/shop.html',
    theme: 'slide--peach'
  };
}

function slideTheme(i, b) {
  if (b.theme) return b.theme;
  return ['slide--peach', 'slide--lilac', 'slide--blue'][i % 3];
}

function renderSlides(banners) {
  const track = document.getElementById('carouselTrack');
  const dots = document.getElementById('carouselDots');
  if (!track) return;
  const list = (banners && banners.length) ? banners : [defaultSlide()];
  carCount = list.length;
  carIndex = 0;
  track.innerHTML = list.map((b, i) => {
    const title = esc(bannerText(b, 'title'));
    const sub = esc(bannerText(b, 'subtitle'));
    const cta = esc(bannerText(b, 'cta_text'));
    const link = esc(b.link || b.cta_link || '/shop.html');
    const art = b.image_url
      ? '<img src="' + esc(b.image_url) + '" alt="" style="width:min(240px,60vw);border-radius:20px;box-shadow:0 18px 30px rgba(74,52,40,.22)">'
      : perfumeArt('banner-' + (b.id || i), bannerText(b, 'title'));
    return '<div class="slide ' + slideTheme(i, b) + '">' +
      '<div><span class="kicker">' + esc(t('home.hero_kicker')) + '</span>' +
      '<h1>' + title + '</h1>' +
      (sub ? '<p>' + sub + '</p>' : '') +
      '<div class="slide-cta">' +
        (cta ? '<a class="btn btn-primary btn-lg" href="' + link + '">' + cta + '</a>' : '') +
        '<a class="btn btn-glass btn-lg" href="/shop.html?sort=new">' + esc(t('home.hero_cta2')) + '</a>' +
      '</div></div>' +
      '<div class="slide-art">' + art + '</div>' +
    '</div>';
  }).join('');
  dots.innerHTML = list.map((_, i) =>
    '<button type="button" data-dot="' + i + '" aria-label="Slide ' + (i + 1) + '"' + (i === 0 ? ' class="on"' : '') + '></button>'
  ).join('');
  dots.querySelectorAll('button').forEach(d =>
    d.addEventListener('click', () => goSlide(Number(d.dataset.dot)))
  );
  updateSlide();
  restartAuto();
}

function updateSlide() {
  const track = document.getElementById('carouselTrack');
  const dots = document.getElementById('carouselDots');
  if (!track || !carCount) return;
  track.style.transform = 'translateX(-' + (carIndex * 100) + '%)';
  if (dots) dots.querySelectorAll('button').forEach((d, i) => d.classList.toggle('on', i === carIndex));
}

function goSlide(i) {
  if (!carCount) return;
  carIndex = (i + carCount) % carCount;
  updateSlide();
  restartAuto();
}

function restartAuto() {
  if (carTimer) { clearInterval(carTimer); carTimer = null; }
  if (carCount < 2) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  carTimer = setInterval(() => { carIndex = (carIndex + 1) % carCount; updateSlide(); }, 5500);
}

async function loadBanners() {
  try {
    const banners = await api('/api/banners');
    renderSlides(Array.isArray(banners) ? banners : []);
  } catch (e) {
    renderSlides([]);
  }
  const prev = document.getElementById('carPrev');
  const next = document.getElementById('carNext');
  const car = document.getElementById('bannerCarousel');
  if (prev && !prev.__bound) {
    prev.__bound = true;
    prev.addEventListener('click', () => goSlide(carIndex - 1));
    next.addEventListener('click', () => goSlide(carIndex + 1));
    car.addEventListener('mouseenter', () => { if (carTimer) clearInterval(carTimer); });
    car.addEventListener('mouseleave', restartAuto);
  }
}

/* ---------- product sections ---------- */
function skeletonGrid(el, n) {
  if (!el) return;
  el.innerHTML = Array.from({ length: n }, () =>
    '<div class="product-card"><div class="skeleton" style="aspect-ratio:1/1.06"></div>' +
    '<div class="card-body"><div class="skeleton" style="height:14px;width:60%"></div>' +
    '<div class="skeleton" style="height:18px"></div>' +
    '<div class="skeleton" style="height:34px;border-radius:999px"></div></div></div>'
  ).join('');
}

function renderGrid(el, items) {
  if (!el) return;
  if (!items || !items.length) {
    el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>' +
      esc(t('shop.no_results')) + '</p></div>';
    return;
  }
  el.innerHTML = items.map(productCard).join('');
  applyI18n(el);
  markFavorites(el);
}

async function loadSections() {
  const featured = document.getElementById('featuredGrid');
  const fresh = document.getElementById('newGrid');
  const best = document.getElementById('bestGrid');
  [featured, fresh, best].forEach(el => skeletonGrid(el, 4));
  try {
    const [pop, nw, bs] = await Promise.all([
      api('/api/products?sort=popular&limit=24').catch(() => ({ items: [] })),
      api('/api/products?sort=new&limit=8').catch(() => ({ items: [] })),
      api('/api/products?sort=bestselling&limit=8').catch(() => ({ items: [] }))
    ]);
    const popItems = pop.items || [];
    const feat = popItems.filter(p => p.featured).slice(0, 8);
    renderGrid(featured, feat.length ? feat : popItems.slice(0, 8));
    renderGrid(fresh, nw.items || []);
    renderGrid(best, bs.items || []);
  } catch (e) {
    [featured, fresh, best].forEach(el => {
      if (el) el.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><p>' +
        esc(t('common.error')) + '</p></div>';
    });
  }
}

/* ---------- favorites state on cards ---------- */
async function markFavorites(scope) {
  if (!state.user) return;
  try {
    const favs = await api('/api/favorites');
    const ids = new Set((favs.items || []).map(p => String(p.id)));
    (scope || document).querySelectorAll('[data-fav]').forEach(btn => {
      if (ids.has(String(btn.dataset.fav))) {
        btn.classList.add('faved');
        btn.textContent = '♥';
      }
    });
  } catch (e) { /* ignore */ }
}

document.addEventListener('favoriteschange', () => { /* no-op hook for pages */ });

/* ---------- brands ---------- */
async function loadBrands() {
  const strip = document.getElementById('brandStrip');
  if (!strip) return;
  try {
    const r = await api('/api/brands');
    const brands = r.brands || [];
    if (!brands.length) { strip.innerHTML = ''; return; }
    strip.innerHTML = brands.map(b =>
      '<a class="brand-pill" href="/shop.html?brand=' + esc(b.slug) + '">' + esc(b.name) + '</a>'
    ).join('');
  } catch (e) { strip.innerHTML = ''; }
}
