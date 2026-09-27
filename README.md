# Perfume Online Decants Shop

A luxury online shop for authentic perfume decants, built with **Tech Stack 2**:
Node.js + Express, built-in `node:sqlite`, vanilla JavaScript frontend (no framework,
no build step), hand-rolled scrypt authentication with SQLite sessions.

Design: light cream background, pastel peach / lilac / blue glassmorphism,
dark-brown text, elegant serif headings, mobile-first. Bilingual EN / မြန်မာ
(persistent language preference). All product artwork is CSS/SVG-generated —
no external product-image dependency. Webfonts (Playfair Display, Inter,
Noto Sans Myanmar) are self-hosted in `public/fonts/` — no external requests.

## Run

```bash
npm install
node server.js        # or: npm start
```

Then open http://localhost:3000. The SQLite database is created at
`data/perfume.db` on first run and seeded automatically (12 perfumes,
delivery zones, coupon `WELCOME10`, demo accounts).

Requirements: Node.js 22.5+ (`node:sqlite` is built in — no native addons).

## Demo accounts

| Role     | Email               | Password    |
|----------|---------------------|-------------|
| Admin    | admin@perfume.shop  | admin123    |
| Staff    | staff@perfume.shop  | staff123    |
| Customer | customer@perfume.shop | customer123 |

Coupon for testing: `WELCOME10` (10% off, min order 20,000 Ks).

## Features

**Shopper**
- Home with hero banners, best sellers, new arrivals
- Shop with search, brand / family / gender / concentration filters, sorting
- Product detail: note pyramid, accords, variants (2ml/3ml/5ml/10ml) with live pricing, reviews, related fragrances
- Guest cart (signed cookie) + logged-in cart with sign-in merge
- Coupons, delivery zones with server-side fees, COD or manual mobile-bank transfer
- Guest checkout; payment-proof upload (screenshot + txn ref) verified by number+phone
- Guest order tracking (`/track.html`) with cancel + proof upload; account pages for members
- Favorites, reviews (verified-purchase marking), addresses, EN/MM switcher

**Admin / staff** (`/admin.html`)
- Dashboard: sales today, pending payments, fulfillment queue, low stock, best sellers
- Orders: full lifecycle pending_payment → payment_verification → confirmed → preparing → packed → shipped → delivered (+ cancelled/refunded), with inventory reserve on confirm and ml deduction on pack
- Payment verification: approve/reject with proof screenshot viewer
- Catalog: brands, products, variants; source bottles with ml-level inventory movements log
- Customers, staff management (admin only), review moderation, coupons, delivery zones, banners/content/settings, email outbox, audit log

**Inventory model** — every order reserves milliliters from source bottles at
confirmation and deducts at packing; cancellations release the reservation.
All movements are logged immutably.

## API

See [API.md](API.md) for the full endpoint reference (`{ok:true,data}` envelope).

## Deployment notes

- `render.yaml` is included. The persistent disk needs a paid Render instance;
  on the free plan remove the `disk` block and `DB_PATH` — the app then uses a
  local SQLite file and **data resets on each redeploy** (documented in the file).
- Set `SESSION_SECRET` in production (generated automatically on Render).
- Uploads live in `data/uploads/proofs/` — keep this directory persistent
  alongside the database.

## Intentional stubs

No third-party email or payment API keys are configured:

- **Email** — verification, password-reset and order-notification emails are
  rendered from templates, logged to the console, and stored in the admin
  outbox (`/api/admin/outbox`). Plug in Resend/SMTP in `src/email.js` to send.
- **Payments** — KBZPay / WavePay / AYA Pay / bank transfer are manual:
  instructions shown at checkout, customer submits transaction reference +
  screenshot, staff verifies in admin. Automated gateway callbacks and refunds
  are deferred.
