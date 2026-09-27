"use strict";
/* Email notifications — no provider key in this build, so every email is
   rendered from a bilingual template, logged to console, and stored in
   email_outbox where admins can view/resend it. */
const { run } = require("./db");

const T = {
  verify_email: {
    subject: { en: "Verify your email — Perfume Decant Shop", my: "အီးမေးလ်အတည်ပြုပါ — Perfume Decant Shop" },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nအကောင့်အတည်ပြုရန် အောက်ပါလင့်ခ်ကို နှိပ်ပါ:\n${d.link}\n\nကျေးဇူးတင်ပါတယ်။`
      : `Hello ${d.name},\n\nPlease verify your account by clicking the link below:\n${d.link}\n\nThank you.`,
  },
  password_reset: {
    subject: { en: "Reset your password — Perfume Decant Shop", my: "စကားဝှက်ပြန်လည်သတ်မှတ်ပါ — Perfume Decant Shop" },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nစကားဝှက်အသစ်သတ်မှတ်ရန်:\n${d.link}\n\nဤတောင်းဆိုမှုကို သင်မလုပ်ခဲ့ပါက လျစ်လျူရှုပါ။`
      : `Hello ${d.name},\n\nReset your password here:\n${d.link}\n\nIf you did not request this, please ignore it.`,
  },
  order_confirmation: {
    subject: { en: (d) => `Order ${d.number} confirmed — Perfume Decant Shop`, my: (d) => `အော်ဒါ ${d.number} အတည်ပြုပြီးပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nသင့်အော်ဒါ ${d.number} ကို လက်ခံရရှိပါပြီ။ စုစုပေါင်း: ${d.total} Ks\n\nအခြေအနေကို ဝက်ဘ်ဆိုက်တွင်ติดตามနိုင်ပါတယ်။ ကျေးဇူးတင်ပါတယ်။`
      : `Hello ${d.name},\n\nYour order ${d.number} has been received. Total: ${d.total} Ks.\n\nYou can track its status on the website. Thank you!`,
  },
  payment_received: {
    subject: { en: (d) => `Payment proof received for ${d.number}`, my: (d) => `${d.number} အတွက် ငွေပေးချေမှုအထောက်အထား လက်ခံရရှိပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nအော်ဒါ ${d.number} အတွက် ငွေပေးချေမှုအထောက်အထားကို လက်ခံရရှိပါပြီ။ စစ်ဆေးပြီးပါက အကြောင်းကြားပါမယ်။`
      : `Hello ${d.name},\n\nWe received your payment proof for order ${d.number}. We will notify you once it is verified.`,
  },
  payment_approved: {
    subject: { en: (d) => `Payment approved for ${d.number}`, my: (d) => `${d.number} အတွက် ငွေပေးချေမှု အတည်ပြုပြီးပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nအော်ဒါ ${d.number} အတွက် ငွေပေးချေမှုကို အတည်ပြုပြီးပါပြီ။ သင့်အော်ဒါကို ပြင်ဆင်ပေးနေပါပြီ။`
      : `Hello ${d.name},\n\nPayment for order ${d.number} is approved. We are now preparing your order.`,
  },
  payment_rejected: {
    subject: { en: (d) => `Payment proof needs attention — ${d.number}`, my: (d) => `ငွေပေးချေမှုအထောက်အထား ပြန်စစ်ရန် — ${d.number}` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nအော်ဒါ ${d.number} အတွက် အထောက်အထားကို အတည်မပြုနိုင်ပါ (${d.note})။ ထပ်မံတင်ပေးပါ။`
      : `Hello ${d.name},\n\nWe could not verify the payment proof for order ${d.number} (${d.note}). Please submit it again.`,
  },
  order_shipped: {
    subject: { en: (d) => `Order ${d.number} shipped`, my: (d) => `အော်ဒါ ${d.number} ပို့ဆောင်လိုက်ပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nသင့်အော်ဒါ ${d.number} ကို ပို့ဆောင်လိုက်ပါပြီ။ Tracking: ${d.tracking}\n\nကျေးဇူးတင်ပါတယ်။`
      : `Hello ${d.name},\n\nYour order ${d.number} has shipped. Tracking: ${d.tracking}\n\nThank you!`,
  },
  order_delivered: {
    subject: { en: (d) => `Order ${d.number} delivered`, my: (d) => `အော်ဒါ ${d.number} ရောက်ရှိပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nသင့်အော်ဒါ ${d.number} ရောက်ရှိသွားပါပြီ။ သုံးသပ်ချက်ရေးပေးဖို့ ဖိတ်ခေါ်ပါတယ်။`
      : `Hello ${d.name},\n\nYour order ${d.number} has been delivered. We would love your review!`,
  },
  order_cancelled: {
    subject: { en: (d) => `Order ${d.number} cancelled`, my: (d) => `အော်ဒါ ${d.number} ပယ်ဖျက်လိုက်ပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nသင့်အော်ဒါ ${d.number} ကို ပယ်ဖျက်လိုက်ပါပြီ။`
      : `Hello ${d.name},\n\nYour order ${d.number} has been cancelled.`,
  },
  refund_confirmation: {
    subject: { en: (d) => `Refund processed for ${d.number}`, my: (d) => `${d.number} အတွက် ငွေပြန်အမ်းပြီးပါပြီ` },
    body: (d, lang) => lang === "my"
      ? `မင်္ဂလာပါ ${d.name}၊\n\nအော်ဒါ ${d.number} အတွက် ငွေပြန်အမ်းဆောင်ရွက်ပြီးပါပြီ။`
      : `Hello ${d.name},\n\nA refund has been processed for order ${d.number}.`,
  },
};

function subjectOf(tpl, data, lang) {
  const s = T[tpl].subject[lang] || T[tpl].subject.en;
  return typeof s === "function" ? s(data) : s;
}

/** Render + log + store. Returns the outbox id. */
function sendEmail(to, template, data = {}, lang = "my") {
  if (!T[template]) throw new Error("unknown_email_template:" + template);
  const subject = subjectOf(template, data, lang);
  const body = T[template].body(data, lang);
  console.log(`[email:${template}] to=${to} subject=${subject}`);
  const r = run(
    "INSERT INTO email_outbox (to_email, subject, body, template, created_at, sent_at) VALUES (?,?,?,?,?,?)",
    to, subject, body, template, Date.now(), Date.now()
  );
  return r.lastInsertRowid;
}

module.exports = { sendEmail, TEMPLATES: Object.keys(T) };
