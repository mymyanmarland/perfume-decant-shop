"use strict";
/* Perfume Online Decants Shop — Express + SQLite + vanilla JS (Tech Stack 2). */
const express = require("express");
const cookieParser = require("cookie-parser");
const path = require("path");

const { attachUser } = require("./src/auth");
const { seed } = require("./src/seed");

const app = express();
const PORT = process.env.PORT || 3000;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* Light in-memory rate limit for auth endpoints: 30 req/min per IP. */
const hits = new Map();
app.use("/api/auth/", (req, res, next) => {
  const now = Date.now();
  const key = req.ip || "x";
  const arr = (hits.get(key) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(key, arr);
  if (arr.length > 30) return res.status(429).json({ ok: false, error: "rate_limited" });
  next();
});

app.use(attachUser);

const checkoutModule = require("./src/routes/checkout");
app.use("/api/auth", require("./src/routes/auth"));
app.use("/api/addresses", require("./src/routes/addresses"));
app.use("/api", require("./src/routes/catalog"));   // brands, filters, products
app.use("/api", require("./src/routes/cart"));      // cart
app.use("/api", require("./src/routes/favorites")); // favorites
app.use("/api", require("./src/routes/reviews"));   // reviews
app.use("/api/checkout", checkoutModule);           // checkout
app.use("/api/uploads", checkoutModule.uploadsRouter); // protected proof files
app.use("/api/orders", require("./src/routes/orders")); // orders
app.use("/api", require("./src/routes/cms"));       // banners, content, public settings
app.use("/api/admin", require("./src/routes/admin"));

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/health", (req, res) => res.json({ ok: true, data: { ts: Date.now() } }));

// SPA-ish fallback: unknown non-API GETs → index.html
app.get(/^\/(?!api\/).*/, (req, res, next) => {
  if (req.path.includes(".")) return next();
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use((err, req, res, _next) => {
  console.error("Unhandled:", err);
  res.status(500).json({ ok: false, error: "server_error" });
});

seed();
app.listen(PORT, () => console.log(`Perfume Decant Shop listening on :${PORT}`));
