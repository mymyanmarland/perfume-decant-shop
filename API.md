# Perfume Decant Shop — API Contract (Tech Stack 2)

Base: Express 4, JSON. All routes under `/api/*`.
Envelope: `{ ok: true, data: <any> }` on success, `{ ok: false, error: "<code>", fieldErrors?: {...} }` on failure.
Money = integer MMK. ml = float. Timestamps = integer ms.

## Modules (already implemented — REQUIRE them, do not reimplement)
- `src/db.js` → `{ db, get, all, run, tx, setting, setSetting, audit }`
- `src/auth.js` → `{ attachUser, requireAuth, requireStaff, requireAdmin, createUser, createSession, destroySession, setSessionCookie, clearSessionCookie, publicUser, verifyPassword, hashPassword, newSalt }`
- `src/util.js` → `{ validMyanmarPhone, normalizePhone, validEmail, validPassword, esc, fmtMMK, slugify, parseJsonArray, nextOrderNumber, PAYMENT_METHODS, canTransition }`
- `src/pricing.js` → `{ priceCart(items, {couponCode, zoneId, userId}), checkMlAvailability(lines) }`
  - items: `[{variant_id, qty}]`. Returns `{lines, subtotal, discount, deliveryFee, total, coupon, zone, freeDelivery, errors}`.
- `src/cart.js` → `{ effectiveCart(req), saveCart(req,res,items), mergeCarts(userId, guestItems), getGuestCart(req), clearGuestCart(res), cleanItems }`
- `src/inventory.js` → `{ reserveForOrder(orderId, lines, actorId), deductForOrder(orderId, lines, actorId), releaseForOrder(orderId, lines, actorId, reason), adjustBottle(id, newMl, actorId, note), addBottle(data, actorId), bottleAvailability(productId) }`
  - lines for inventory fns: `{product_id, variant_id, variant_name, size_ml, qty}`
- `src/email.js` → `{ sendEmail(to, template, data, lang) }` templates: verify_email, password_reset, order_confirmation, payment_received, payment_approved, payment_rejected, order_shipped, order_delivered, order_cancelled, refund_confirmation.
- `src/seed.js` → `{ seed() }` — call once at boot.

## Auth model
- `attachUser` runs globally; `req.user = {id,name,email,phone,role,lang,email_verified}` or null.
- Roles: `customer`, `staff`, `admin`. `requireAuth`, `requireStaff` (staff+admin), `requireAdmin`.
- Staff CANNOT: manage users' roles, change settings, delete financial records. Enforce in admin routes.

## Endpoints

### Auth (`src/routes/auth.js`)
- `POST /api/auth/register` {name, email, phone, password, lang?} → validate (email, phone MM, pw≥6). Create user, create+set session, merge guest cart, sendEmail verify_email with link `${BASE_URL}/verify.html?token=`. data: `{user}`.
- `POST /api/auth/login` {email, password} → verify, set session, merge guest cart, clear guest cookie. data: `{user}`.
- `POST /api/auth/logout` → destroy session, clear cookie. data: `{ok:true}`.
- `GET /api/auth/me` → `{user}` or `{user:null}`.
- `PUT /api/auth/profile` (auth) {name?, phone?, lang?, notif_order_updates?, notif_promos?} → `{user}`.
- `POST /api/auth/change-password` (auth) {current, new} → verify current first.
- `GET /api/auth/verify-email?token=` → verify, set email_verified=1. data `{ok:true}`.
- `POST /api/auth/forgot-password` {email} → if user exists: set reset_token/expiry, sendEmail password_reset with `${BASE_URL}/reset.html?token=`. Always `{ok:true}`.
- `POST /api/auth/reset-password` {token, password} → validate token+expiry, update pw.

### Addresses (`src/routes/addresses.js`, auth)
- `GET /api/addresses` → `{addresses:[...]}` (user's, default first).
- `POST /api/addresses` {label?,name,phone,region,city?,township,address_line,notes?,is_default?} → validate phone MM. If is_default, unset others.
- `PUT /api/addresses/:id`, `DELETE /api/addresses/:id` (own only).

### Catalog — public (`src/routes/catalog.js`)
- `GET /api/brands` → `{brands:[{id,name,slug}]}` active only.
- `GET /api/filters` → `{families:[], concentrations:[], genders:[], seasons:[], occasions:[], priceBounds:{min,max}}` from active products.
- `GET /api/products` query: q, brand (slug), family, concentration, gender, season, occasion, min_price, max_price, size (variant size_ml), min_longevity, min_sillage, available=1, sort=new|price_asc|price_desc|rating|popular|bestselling, cursor, limit(≤48).
  → `{items, nextCursor, hasMore, total}`. item: `{id, slug, name, brand, brand_slug, concentration, family, gender, seasons[], occasions[], longevity, sillage, rating_avg, rating_count, featured, is_new, bestseller, art_seed, min_price, max_price, in_stock, description_my? no—keep short}`.
  - q searches name, brand name, description, notes, accords (LIKE).
  - price bounds = MIN/MAX over active variants.
  - available=1 → at least one active variant with stock_qty>0.
  - cursor = last item id (keyset, id DESC base order; for price sorts use (price,id) keyset — document choice in code).
- `GET /api/products/:slug` → `{product:{...all fields, notes arrays parsed, brand:{...}, variants:[{id,name,size_ml,sku,price,compare_at,atomizer,stock_qty,low_threshold,active}], reviews:[published, limit 6], related:[4 items same family or brand]}}`.

### Cart (`src/routes/cart.js`)
- `GET /api/cart?coupon=&zone_id=` → `priceCart(effectiveCart(req), {couponCode, zoneId, userId})` → `{lines, subtotal, discount, deliveryFee, total, coupon, zone, errors}`.
- `POST /api/cart/items` {variant_id, qty} → add (cap by stock), saveCart, return priced cart.
- `PUT /api/cart/items/:variant_id` {qty} (qty 0 = remove).
- `DELETE /api/cart/items/:variant_id`.
- All return the priced cart shape (with optional coupon/zone_id query passthrough).

### Favorites (auth, `src/routes/favorites.js`)
- `GET /api/favorites` → `{items:[product summaries]}`.
- `POST /api/favorites/:productId` → toggle → `{favorited:true|false}`.
- `DELETE /api/favorites/:productId`.

### Reviews (`src/routes/reviews.js`)
- `GET /api/products/:slug/reviews?cursor=` → published reviews `{items:[{id,rating,longevity,sillage,title,content,user_name,verified,created_at}], nextCursor, hasMore}`.
- `POST /api/reviews` (auth) {product_id, rating 1-5, longevity?, sillage?, title?, content (10-2000 chars)} → verified=1 if user has a delivered order containing product. status=pending. Recompute product rating only when published. → `{review}`.

### Checkout & payments (`src/routes/checkout.js`)
- `GET /api/checkout/payment-instructions?method=kbzpay|wavepay|ayapay|bank` → `{method, instruction}` from settings.
- `POST /api/checkout` {name, phone, email?, region, city?, township, address_line, notes?, payment_method, coupon_code?, zone_id, address_id?}:
  1. Validate all fields (phone MM, payment_method in list, zone exists+active; township must be in zone.townships; if zone.cod_available=0 and method=cod → error).
  2. items = effectiveCart(req); must be non-empty.
  3. priced = priceCart(items, {couponCode, zoneId, userId}); if priced.errors.length → 400.
  4. checkMlAvailability(lines) → 400 if short.
  5. tx: number=nextOrderNumber(); INSERT order (status: cod→`confirmed`, else `pending_payment`; payment_status: cod→`pending`, else `pending`); INSERT order_items (immutable snapshots); INSERT payment row {method, amount:total, status:'pending'}; coupon usage record; if cod → reserveForOrder(orderId, lines, userId) inside same tx.
  6. Clear cart. sendEmail order_confirmation. audit().
  → `{number, total, payment_method, status}`.
- `POST /api/checkout/:number/payment-proof` (multipart `screenshot` ≤5MB jpg/png/webp, `txn_ref` + `phone` required):
  ownership = logged-in order owner, staff/admin, OR guest proving ownership via matching order `phone` (same pattern as guest tracking);
  must be pending_payment|payment_verification with a non-cod method; save file to `data/uploads/proofs/<number>-<ts>.<ext>`; update payment {status:'proof_submitted', txn_ref, proof_path}; order.status='payment_verification'; sendEmail payment_received. → `{ok:true}`.
- Proof files served at `GET /api/uploads/proofs/:file` — only order owner, staff, admin.

### Orders (`src/routes/orders.js`)
- `GET /api/orders` (auth) → user's orders summary list (id, number, status, payment_status, total, created_at, item_count).
- `GET /api/orders/track?number=&phone=` (public) → order summary+timeline if number+phone match (guest tracking).
- `GET /api/orders/:number` (auth owner or staff) → full detail `{order, items, payment, shipment, timeline}`.
- `POST /api/orders/:number/cancel` {reason?, phone?} → allowed if status in [pending_payment, payment_verification, confirmed]; ownership = logged-in owner, staff/admin, OR guest with matching order `phone`; tx: if reserved (confirmed) → releaseForOrder; status=cancelled; email order_cancelled.
- `POST /api/orders/:number/reorder` (auth) → add order's variants (still active) to cart.

### Admin (`src/routes/admin.js`) — mount all under `/api/admin`, use requireStaff; user-role/settings/destructive ops use requireAdmin.
- `GET /api/admin/dashboard` → `{todayOrders, todaySales, pendingPayments, paymentsToVerify, fulfillmentQueue (confirmed+preparing+packed counts), lowStock:[variants ≤ threshold], bestSellers (top 5 by qty, 30d), recentCustomers (5)}`.
- Orders: `GET /api/admin/orders?status=&q=&cursor=`; `GET /api/admin/orders/:number`; `PATCH /api/admin/orders/:number/status` {status, tracking_ref?, courier?, note?} — validate canTransition; side effects in tx:
  - →confirmed (from payment_verification): reserveForOrder.
  - →packed (from preparing): deductForOrder.
  - →cancelled: releaseForOrder if was confirmed/preparing (reserved but not deducted); restore.
  - →shipped: upsert shipment {courier, tracking_ref, shipped_at}; email order_shipped.
  - →delivered: shipment.delivered_at; email order_delivered; (reviews become verifiable).
  - →refunded: email refund_confirmation; payment status refunded.
  audit every change.
- Payments: `GET /api/admin/payments?status=&cursor=`; `POST /api/admin/payments/:id/approve` → payment paid; order →confirmed (+reserveForOrder in tx); email payment_approved; `POST /api/admin/payments/:id/reject` {note} → payment failed; order →pending_payment; email payment_rejected.
- Products: `GET /api/admin/products?q=&status=&cursor=`; `POST /api/admin/products` (fields per schema); `PATCH /api/admin/products/:id`; `DELETE` → archive (status=archived), never hard delete if orders reference.
- Variants: `GET /api/admin/products/:id/variants`; `POST /api/admin/products/:id/variants`; `PATCH /api/admin/variants/:vid`; `DELETE /api/admin/variants/:vid` (only if no order_items reference → else deactivate).
- Brands: `GET/POST/PATCH/DELETE /api/admin/brands` (delete only if no products).
- Inventory: `GET /api/admin/bottles?product_id=`; `POST /api/admin/bottles` (→ addBottle); `PATCH /api/admin/bottles/:id` {current_ml, note} (→ adjustBottle); `GET /api/admin/movements?bottle_id=&order_id=&cursor=`.
- Customers: `GET /api/admin/customers?q=&cursor=` (no pw hashes!); `PATCH /api/admin/customers/:id` {name?, phone?} (role change → requireAdmin).
- Staff (requireAdmin): `GET/POST /api/admin/staff` {name,email,phone,password}; `PATCH /api/admin/staff/:id` {name?,phone?,role?,password?}; `DELETE /api/admin/staff/:id` (not self, not last admin).
- Reviews: `GET /api/admin/reviews?status=&cursor=`; `PATCH /api/admin/reviews/:id` {status} → recompute product rating_avg/count from published.
- Coupons: CRUD `/api/admin/coupons`.
- Zones: CRUD `/api/admin/zones` {name,name_my,region,townships[] (array),fee,eta_days,cod_available,active,sort}.
- Banners: CRUD `/api/admin/banners`.
- Content: `PUT /api/admin/content/:key` {title?, body_en?, body_my?}.
- Settings: `GET /api/admin/settings`; `PUT /api/admin/settings` {key: value} (requireAdmin; whitelist keys).
- Outbox: `GET /api/admin/outbox?cursor=`; `POST /api/admin/outbox/:id/resend` → console.log again + update sent_at.
- Audit: `GET /api/admin/audit?cursor=` (requireAdmin).

### CMS public (`src/routes/cms.js`)
- `GET /api/banners` → array of active banners ordered by sort.
- `GET /api/zones` → active delivery zones `{zones:[{id,name,name_my,region,townships[],fee,eta_days,cod_available}]}` (public; powers the checkout zone dropdown).
- `GET /api/content/:key` → `{key,title,body_en,body_my}`.
- `GET /api/settings/public` → `{shop_name, promo_notice, promo_notice_my, contact_phone, free_delivery_threshold}`.

## Conventions
- Always `audit(req.user?.id, action, entity, entityId, detail)` for admin mutations and order/payment changes.
- Errors: `{ok:false, error:"code"}` with codes like `validation`, `auth_required`, `forbidden`, `not_found`, `insufficient_stock`, `insufficient_ml`, `coupon_invalid`, `bad_transition`, `rate_limited`.
- Rate-limit auth endpoints lightly (in-memory: 20 req/min per IP on /api/auth/*).
- Validate Myanmar phone with `validMyanmarPhone` everywhere a phone is accepted.
