<div align="center">

<img src="docs/logo.webp" width="120" alt="Perfume Decant Shop logo"/>

# 🌸 Perfume Online Decants Shop

<img src="docs/decor-animated.svg" width="100%" alt="Animated perfume banner"/>

[![Typing SVG](https://readme-typing-svg.demolab.com?font=Playfair+Display&size=26&duration=2800&pause=900&color=8A6B4A&center=true&vCenter=true&width=650&lines=Authentic+luxury+decants%2C+poured+fresh;5ml+%E2%80%A2+10ml%E2%80%94no+full+bottles%2C+no+fakes;Bilingual+EN+%2F+%E1%80%BB%E1%80%99%E1%80%94%E1%80%BA%E1%80%99%E1%80%AC+%F0%9F%87%B2%F0%9F%87%B2)](https://git.io/typing-svg)

[![Node.js](https://img.shields.io/badge/Node.js-22-5FA04E?logo=nodedotjs&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)](https://sqlite.org)
[![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-no_build_step-F7DF1E?logo=javascript&logoColor=black)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Render](https://img.shields.io/badge/Live_on-Render-46E3B7?logo=render&logoColor=white)](https://perfume-decant-shop.onrender.com)

**A complete, production e-commerce experience for authentic perfume decants — zero frameworks, zero build step, pure craftsmanship.**

[![🌐 Visit the Live Shop](https://img.shields.io/badge/🌐_Visit_the_Live_Shop-perfume--decant--shop.onrender.com-C49A5B?style=for-the-badge)](https://perfume-decant-shop.onrender.com)

</div>

---

<img src="docs/hero-banner.webp" width="100%" alt="Perfume Decant Shop collection"/>

## ✨ Why this shop?

Buying a full designer bottle just to discover you don't love the scent is painful. This shop sells **authentic decants in 5ml and 10ml** — poured fresh from sealed retail bottles — so anyone can explore luxury fragrances (Dior, Chanel, Lancôme, YSL…) at a fraction of the price. Every product carries a bilingual description and a full **fragrance-note pyramid** (top / heart / base).

## 🛍️ Shopper features

<details open>
<summary><b>Browse & discover</b></summary>

- 🏠 Home with hero banners, best sellers & new arrivals
- 🔎 Shop with live search, brand / family / gender / concentration filters & sorting
- 🌸 Product detail: note pyramid, accords, longevity/sillage meters, bilingual descriptions
- ⭐ Reviews with verified-purchase badges, favorites, related fragrances
- 🌐 One-tap EN / မြန်မာ language switcher (preference persists)
</details>

<details>
<summary><b>Cart & checkout</b></summary>

- 🛒 Guest cart (signed cookie) + member cart with automatic merge on sign-in
- 🎟️ Coupons (try `WELCOME10`), delivery zones with server-side fee calculation
- 💵 Cash on delivery **or** manual mobile-bank transfer with payment-proof upload
- 📦 Guest order tracking at `/track.html` — cancel orders, upload proof, no account needed
</details>

## 🛡️ Admin & staff panel (`/admin.html`)

<details>
<summary><b>Everything a real shop needs</b></summary>

- 📊 Dashboard: today's sales, pending payments, fulfillment queue, low stock, best sellers
- 🧾 Full order lifecycle — `pending_payment → verification → confirmed → preparing → packed → shipped → delivered` (+ cancelled / refunded), with inventory reservation & ml deduction
- 🌸 **Product manager**: add / edit / archive products — new products automatically get **5ml + 10ml** variants
- 📷 **Photo uploads**: attach your own product photos (JPG/PNG/WebP ≤ 5MB); they instantly replace the generated artwork across cards, detail page, cart & checkout
- 🧴 Inventory in milliliters, stock movements log, brands, coupons, delivery zones, banners, CMS pages
- 👥 Staff accounts with role-based access, full audit log
</details>

## 🛠️ Tech stack

| Layer | Technology |
|---|---|
| 🟢 Backend | Node.js 22 + Express 5 |
| 🗄️ Database | `node:sqlite` (built-in, zero native addons) |
| 🎨 Frontend | Vanilla JavaScript — **no framework, no build step** |
| 🔐 Auth | Hand-rolled scrypt password hashing + SQLite sessions |
| 💅 Design | Cream glassmorphism, pastel peach/lilac/blue, Playfair Display + Noto Sans Myanmar (self-hosted) |
| ☁️ Deploy | Render (free tier) via `render.yaml` |

> **No `npm run build`. No bundler. No CDN.** Every byte is hand-written and self-hosted — the whole app fits in your head.

## 🚀 Run it locally

```bash
npm install
node server.js        # or: npm start
```

Then open **http://localhost:3000**. The SQLite database is created at `data/perfume.db` on first run and seeded automatically — 12 real perfumes, delivery zones, coupon `WELCOME10`, demo accounts.

Requirements: **Node.js 22.5+** (`node:sqlite` is built in).

## 📁 Project tour

```
├── server.js            # Express app: routes, static, uploads, SPA fallback
├── src/
│   ├── db.js            # SQLite schema + migrations
│   ├── seed.js          # 12 real perfumes, zones, coupon, demo users
│   ├── migrate.js       # startup normalization → every product gets 5ml + 10ml
│   └── routes/          # catalog, cart, checkout, orders, reviews, admin…
├── public/              # vanilla-JS pages (home, shop, product, cart, admin…)
│   ├── js/              # one script per page, shared core in app.js
│   └── fonts/           # self-hosted Playfair Display, Inter, Noto Sans Myanmar
├── docs/                # readme assets (this page's artwork ✨)
└── render.yaml          # one-click Render deploy
```

## 📖 API reference

Full endpoint documentation lives in [`API.md`](API.md).

---

<div align="center">

**Made with 💛 for fragrance lovers in Myanmar**

🌸 *Spray a little luxury, every day.* 🌸

</div>
