"use strict";
/* Seed data — runs once when the brands table is empty. */
const { get, run } = require("./db");
const { createUser } = require("./auth");
const { addBottle } = require("./inventory");

const PERFUMES = [
  { brand: "Dior", name: "Sauvage", slug: "dior-sauvage", gender: "men", concentration: "Eau de Toilette",
    family: "Fresh Spicy", top: ["Calabrian Bergamot", "Pepper"], mid: ["Sichuan Pepper", "Lavender", "Pink Pepper", "Vetiver", "Patchouli", "Geranium", "Elemi"],
    base: ["Ambroxan", "Cedar", "Labdanum"], accords: ["Fresh", "Spicy", "Citrus", "Woody"],
    year: 2015, perfumer: "François Demachy", origin: "France",
    desc: "A radically fresh, raw and noble fragrance. Calabrian bergamot meets peppery woods for a bold, confident trail.",
    desc_my: "လန်းဆန်းပြီး ရဲရင့်တဲ့ ရနံ့။ Bergamot နဲ့ ငရုတ်ကောင်းရနံ့တို့ ရောစပ်ထားတဲ့ ယောက်ျားဆန်ဆန် စတိုင်။",
    seasons: ["spring", "summer", "autumn"], occasions: ["daily", "office", "evening"], longevity: 4, sillage: 4,
    seed: 11, featured: 1, bestseller: 1, is_new: 0,
    variants: [[2, 9000], [5, 18000], [10, 32000]],
    full_bottle: { size: 100, price: 265000, sku: "DIO-SAU-100" },
    bottle: { ref: "SRC-DIO-SAU-01", original_ml: 100, current_ml: 100, supplier: "Dior boutique Bangkok", cost_mmk: 240000 } },
  { brand: "Chanel", name: "Bleu de Chanel", slug: "bleu-de-chanel", gender: "men", concentration: "Eau de Parfum",
    family: "Woody Citrus", top: ["Grapefruit", "Lemon", "Mint", "Pink Pepper"], mid: ["Ginger", "Nutmeg", "Jasmine", "Iso E Super"],
    base: ["Incense", "Vetiver", "Cedar", "Sandalwood", "Patchouli", "Labdanum", "White Musk"], accords: ["Woody", "Citrus", "Fresh", "Elegant"],
    year: 2010, perfumer: "Jacques Polge", origin: "France",
    desc: "An ode to masculine freedom in an aromatic-woody fragrance. Citrus brightness over a deep, sensual woody base.",
    desc_my: "လွတ်လပ်မှုကို ကိုယ်စားပြုတဲ့ သစ်သားရနံ့။ Citrus လန်းဆန်းမှုနဲ့ နက်ရှိုင်းတဲ့ သစ်သားရနံ့ ရောစပ်ထားတယ်။",
    seasons: ["spring", "autumn", "winter"], occasions: ["office", "evening", "formal"], longevity: 5, sillage: 3,
    seed: 22, featured: 1, bestseller: 0, is_new: 0,
    variants: [[2, 12000], [5, 24000], [10, 42000]],
    bottle: { ref: "SRC-CHA-BLE-01", original_ml: 100, current_ml: 92, supplier: "Chanel counter Yangon", cost_mmk: 330000 } },
  { brand: "Creed", name: "Aventus", slug: "creed-aventus", gender: "men", concentration: "Eau de Parfum",
    family: "Fruity Woody", top: ["Pineapple", "Bergamot", "Black Currant", "Apple"], mid: ["Birch", "Patchouli", "Moroccan Jasmine", "Rose"],
    base: ["Musk", "Oakmoss", "Ambergris", "Vanilla"], accords: ["Fruity", "Smoky", "Woody", "Luxurious"],
    year: 2010, perfumer: "Olivier Creed", origin: "France",
    desc: "The legendary fruity-smoky masterpiece. Pineapple and birch create an unmistakable aura of success and power.",
    desc_my: "နာမည်ကျော် luxury ရနံ့။ နာနတ်သီးနဲ့ သစ်သားမီးခိုးရနံ့ ရောစပ်ထားတဲ့ အောင်မြင်မှုရဲ့ ကိုယ်စားပြု။",
    seasons: ["spring", "summer", "autumn"], occasions: ["evening", "formal", "date"], longevity: 5, sillage: 5,
    seed: 33, featured: 1, bestseller: 1, is_new: 0,
    variants: [[2, 25000], [5, 55000], [10, 98000]],
    bottle: { ref: "SRC-CRE-AVE-01", original_ml: 100, current_ml: 85, supplier: "Creed authorized reseller", cost_mmk: 780000 } },
  { brand: "Maison Francis Kurkdjian", name: "Baccarat Rouge 540", slug: "baccarat-rouge-540", gender: "unisex", concentration: "Eau de Parfum",
    family: "Amber Floral", top: ["Saffron", "Jasmine"], mid: ["Amberwood", "Ambergris"],
    base: ["Fir Resin", "Cedar"], accords: ["Amber", "Warm", "Sweet", "Radiant"],
    year: 2015, perfumer: "Francis Kurkdjian", origin: "France",
    desc: "Luminous and intense. Saffron and amberwood weave a radiant, long-lasting sillage that turns heads everywhere.",
    desc_my: "တောက်ပပြီး စွဲမက်ဖွယ်ကောင်းတဲ့ ရနံ့။ Saffron နဲ့ amber ရနံ့က ကြာရှည်ခံပြီး လူတိုင်းသတိထားမိစေတယ်။",
    seasons: ["autumn", "winter"], occasions: ["evening", "date", "formal"], longevity: 5, sillage: 5,
    seed: 44, featured: 1, bestseller: 1, is_new: 0,
    variants: [[2, 32000], [5, 68000], [10, 120000]],
    bottle: { ref: "SRC-MFK-BR5-01", original_ml: 70, current_ml: 70, supplier: "MFK boutique Singapore", cost_mmk: 690000 } },
  { brand: "Yves Saint Laurent", name: "Libre", slug: "ysl-libre", gender: "women", concentration: "Eau de Parfum",
    family: "Lavender Floral", top: ["Lavender", "Mandarin Orange", "Black Currant", "Petitgrain"], mid: ["Lavender", "Orange Blossom", "Jasmine"],
    base: ["Madagascar Vanilla", "Musk", "Cedar", "Ambergris"], accords: ["Floral", "Lavender", "Warm", "Bold"],
    year: 2019, perfumer: "Anne Flipo, Carlos Benaïm", origin: "France",
    desc: "A bold floral fragrance for the free woman. French lavender meets Moroccan orange blossom in fearless harmony.",
    desc_my: "လွတ်လပ်တဲ့ အမျိုးသမီးအတွက် ရဲရင့်တဲ့ ပန်းရနံ့။ Lavender နဲ့ လိမ္မော်ပန်းရနံ့ ရောစပ်ထားတယ်။",
    seasons: ["spring", "autumn", "winter"], occasions: ["daily", "office", "evening"], longevity: 4, sillage: 4,
    seed: 55, featured: 0, bestseller: 1, is_new: 0,
    variants: [[2, 11000], [5, 22000], [10, 38000]],
    full_bottle: { size: 90, price: 310000, sku: "YSL-LIB-90" },
    bottle: { ref: "SRC-YSL-LIB-01", original_ml: 90, current_ml: 90, supplier: "YSL counter Yangon", cost_mmk: 280000 } },
  { brand: "Giorgio Armani", name: "Sì", slug: "armani-si", gender: "women", concentration: "Eau de Parfum",
    family: "Fruity Floral", top: ["Blackcurrant Nectar"], mid: ["Freesia", "May Rose"],
    base: ["Vanilla", "Patchouli", "Blond Woods", "Ambroxan"], accords: ["Fruity", "Sweet", "Floral", "Elegant"],
    year: 2013, perfumer: "Christine Nagel", origin: "Italy",
    desc: "Chic, voluptuous and intense. Blackcurrant nectar wrapped in soft florals and warm vanilla woods.",
    desc_my: "ခေတ်မီပြီး နူးညံ့တဲ့ ရနံ့။ Blackcurrant သီးနဲ့ vanilla သစ်သားရနံ့ ရောစပ်ထားတဲ့ အမျိုးသမီးဆန်ဆန် စတိုင်။",
    seasons: ["autumn", "winter", "spring"], occasions: ["daily", "date", "evening"], longevity: 4, sillage: 3,
    seed: 66, featured: 0, bestseller: 0, is_new: 1,
    variants: [[2, 9500], [5, 19000], [10, 34000]],
    bottle: { ref: "SRC-ARM-SI-01", original_ml: 100, current_ml: 78, supplier: "Armani beauty counter", cost_mmk: 260000 } },
  { brand: "Lancôme", name: "La Vie Est Belle", slug: "la-vie-est-belle", gender: "women", concentration: "Eau de Parfum",
    family: "Gourmand Floral", top: ["Black Currant", "Pear"], mid: ["Iris", "Jasmine", "Orange Blossom"],
    base: ["Praline", "Vanilla", "Tonka Bean", "Patchouli"], accords: ["Sweet", "Gourmand", "Floral", "Happy"],
    year: 2012, perfumer: "Olivier Polge, Dominique Ropion", origin: "France",
    desc: "Life is beautiful — a joyful gourmand bouquet of iris, praline and vanilla that radiates happiness.",
    desc_my: "ပျော်ရွှင်မှုကို ဖော်ဆောင်တဲ့ ချိုမြိန်တဲ့ရနံ့။ Iris ပန်းနဲ့ praline, vanilla ရောစပ်ထားတယ်။",
    seasons: ["autumn", "winter"], occasions: ["daily", "date", "gift"], longevity: 5, sillage: 4,
    seed: 77, featured: 0, bestseller: 1, is_new: 0,
    variants: [[2, 9500], [5, 19000], [10, 34000]],
    full_bottle: { size: 100, price: 295000, sku: "LAN-LVB-100" },
    bottle: { ref: "SRC-LAN-LVB-01", original_ml: 100, current_ml: 100, supplier: "Lancôme counter Yangon", cost_mmk: 270000 } },
  { brand: "Versace", name: "Eros", slug: "versace-eros", gender: "men", concentration: "Eau de Toilette",
    family: "Fresh Oriental", top: ["Mint", "Green Apple", "Lemon"], mid: ["Tonka Bean", "Ambroxan", "Geranium"],
    base: ["Madagascar Vanilla", "Vetiver", "Oakmoss", "Cedar"], accords: ["Fresh", "Sweet", "Minty", "Sensual"],
    year: 2012, perfumer: "Aurélien Guichard", origin: "Italy",
    desc: "God of love in a bottle. Icy mint and green apple melt into sensual vanilla and woods.",
    desc_my: "လန်းဆန်းတဲ့ mint နဲ့ ပန်းသီးစိမ်းရနံ့ကနေ ချိုမြိန်တဲ့ vanilla ရနံ့ဆီ ကူးပြောင်းသွားတဲ့ ဆွဲဆောင်မှုရှိတဲ့ ရနံ့။",
    seasons: ["spring", "summer"], occasions: ["daily", "date", "evening"], longevity: 4, sillage: 4,
    seed: 88, featured: 0, bestseller: 0, is_new: 1,
    variants: [[2, 7500], [5, 15000], [10, 26000]],
    bottle: { ref: "SRC-VER-ERO-01", original_ml: 100, current_ml: 100, supplier: "Versace counter Bangkok", cost_mmk: 185000 } },
  { brand: "Paco Rabanne", name: "1 Million", slug: "paco-rabanne-1-million", gender: "men", concentration: "Eau de Toilette",
    family: "Spicy Leather", top: ["Grapefruit", "Mint", "Blood Mandarin"], mid: ["Rose", "Cinnamon", "Spicy Notes"],
    base: ["Leather", "Golden Woods", "Amber", "Blond Woods"], accords: ["Spicy", "Leathery", "Warm", "Bold"],
    year: 2008, perfumer: "Olivier Pescheux", origin: "France",
    desc: "Pure gold attitude. Sparkling citrus and cinnamon over rich leather — daring, magnetic, unforgettable.",
    desc_my: "ရွှေရောင်လို တောက်ပတဲ့ ရဲရင့်တဲ့ရနံ့။ Citrus နဲ့ သစ်ကြံပိုးခေါက်ရနံ့ကနေ သားရေရနံ့ဆီ ကူးပြောင်းတယ်။",
    seasons: ["autumn", "winter"], occasions: ["evening", "date", "party"], longevity: 4, sillage: 5,
    seed: 99, featured: 0, bestseller: 0, is_new: 0,
    variants: [[2, 8000], [5, 16000], [10, 28000]],
    bottle: { ref: "SRC-PAC-1M-01", original_ml: 100, current_ml: 65, supplier: "Paco Rabanne distributor", cost_mmk: 205000 } },
  { brand: "Chanel", name: "Coco Mademoiselle", slug: "coco-mademoiselle", gender: "women", concentration: "Eau de Parfum",
    family: "Oriental Floral", top: ["Orange", "Mandarin Orange", "Bergamot", "Orange Blossom"], mid: ["Turkish Rose", "Jasmine", "Mimosa", "Litchi"],
    base: ["Patchouli", "Vetiver", "Vanilla", "White Musk", "Opoponax"], accords: ["Citrus", "Floral", "Patchouli", "Elegant"],
    year: 2001, perfumer: "Jacques Polge", origin: "France",
    desc: "The essence of a bold, free woman. Sparkling citrus over a sensual patchouli heart — timeless Parisian chic.",
    desc_my: "ရဲရင့်လွတ်လပ်တဲ့ အမျိုးသမီးရဲ့ ကိုယ်စားပြု။ Citrus လန်းဆန်းမှုနဲ့ patchouli ရနံ့ ရောစပ်ထားတဲ့ ထာဝရစတိုင်။",
    seasons: ["spring", "autumn", "winter"], occasions: ["daily", "office", "formal"], longevity: 5, sillage: 4,
    seed: 110, featured: 1, bestseller: 0, is_new: 0,
    variants: [[2, 13000], [5, 25000], [10, 44000]],
    bottle: { ref: "SRC-CHA-CM-01", original_ml: 100, current_ml: 88, supplier: "Chanel counter Yangon", cost_mmk: 345000 } },
  { brand: "Dior", name: "J'adore", slug: "dior-jadore", gender: "women", concentration: "Eau de Parfum",
    family: "Floral", top: ["Ylang-Ylang", "Bergamot"], mid: ["Damask Rose", "Jasmine Sambac", "Indian Jasmine", "Orange Blossom", "Tuberose"],
    base: ["Musk", "Cedar", "Blackberry"], accords: ["Floral", "White Floral", "Radiant", "Feminine"],
    year: 1999, perfumer: "Calice Becker", origin: "France",
    desc: "A grand feminine floral bouquet. Ylang-ylang and damask rose compose an ode to femininity in full bloom.",
    desc_my: "ပန်းရနံ့တွေ စုစည်းထားတဲ့ အမျိုးသမီးဆန်ဆန် ရနံ့။ Ylang-ylang နဲ့ နှင်းဆီရနံ့က ကျော့ရှင်းမှုကို ဖော်ဆောင်တယ်။",
    seasons: ["spring", "summer"], occasions: ["daily", "formal", "gift"], longevity: 4, sillage: 3,
    seed: 121, featured: 0, bestseller: 0, is_new: 1,
    variants: [[2, 11000], [5, 22000], [10, 38000]],
    bottle: { ref: "SRC-DIO-JAD-01", original_ml: 100, current_ml: 100, supplier: "Dior boutique Bangkok", cost_mmk: 300000 } },
  { brand: "Tom Ford", name: "Tobacco Vanille", slug: "tobacco-vanille", gender: "unisex", concentration: "Eau de Parfum",
    family: "Oriental Vanilla", top: ["Tobacco Leaf", "Spicy Notes"], mid: ["Vanilla", "Cacao", "Tonka Bean", "Tobacco Blossom"],
    base: ["Dried Fruits", "Woody Notes"], accords: ["Tobacco", "Vanilla", "Warm", "Opulent"],
    year: 2007, perfumer: "Olivier Gillotin", origin: "USA",
    desc: "Opulent and indulgent. Rich tobacco leaf wrapped in creamy vanilla and dried fruits — pure luxury.",
    desc_my: "ဇိမ်ခံတဲ့ ရနံ့။ ဆေးရွက်ကြီးရနံ့ကို vanilla နဲ့ သစ်သီးခြောက်ရနံ့တို့ ရောစပ်ထားတဲ့ ခမ်းနားတဲ့စတိုင်။",
    seasons: ["autumn", "winter"], occasions: ["evening", "formal", "date"], longevity: 5, sillage: 5,
    seed: 132, featured: 1, bestseller: 0, is_new: 0,
    variants: [[2, 28000], [5, 60000], [10, 105000]],
    bottle: { ref: "SRC-TF-TV-01", original_ml: 100, current_ml: 70, supplier: "Tom Ford private blend stockist", cost_mmk: 830000 } },
];

const ZONES = [
  { name: "Yangon – Central", name_my: "ရန်ကုန် – မြို့လယ်", region: "Yangon",
    townships: ["Bahan","Kamayut","Sanchaung","Ahlone","Dagon","Lanmadaw","Pabedan","Kyauktada","Botahtaung","Mingalar Taung Nyunt","Tamwe","Yankin","Thingangyun","South Okkalapa","Mayangone"],
    fee: 3000, eta: "1–2 days", cod: 1, sort: 1 },
  { name: "Yangon – Outer", name_my: "ရန်ကုန် – မြို့ပြင်", region: "Yangon",
    townships: ["Hlaing","Insein","North Okkalapa","Shwepyitha","Hlaingthaya","Dagon Seikkan","Thaketa","Dawbon","Seikkyi Kanaungto","Cocokyun"],
    fee: 4000, eta: "1–3 days", cod: 1, sort: 2 },
  { name: "Mandalay", name_my: "မန္တလေး", region: "Mandalay",
    townships: ["Chanayethazan","Chanmyathazi","Mahaaungmye","Amarapura","Pyigyitagon","Patheingyi"],
    fee: 5000, eta: "2–3 days", cod: 1, sort: 3 },
  { name: "Other Regions", name_my: "အခြားတိုင်းဒေသကြီး", region: "Other",
    townships: ["Naypyitaw","Bago","Mawlamyine","Taunggyi","Monywa","Myitkyina","Sittwe","Pathein","Hpa-an","Loikaw"],
    fee: 7000, eta: "3–5 days", cod: 0, sort: 4 },
];

const CONTENT = [
  ["authenticity", "Authenticity Guarantee", "100% Authentic — guaranteed",
   "Every decant is hand-poured from an original retail bottle purchased from authorized boutiques and counters. Batch codes are recorded for every source bottle. If any product is proven inauthentic, we refund double the purchase price.",
   "၁၀၀% အစစ်အမှန်ဖြစ်ကြောင်း အာမခံပါသည် — Decant တိုင်းကို တရားဝင်ဆိုင်များမှ ဝယ်ယူထားသော မူရင်းပုလင်းများမှ တိုက်ရိုက်ဖြည့်သွင်းပေးပါသည်။ ပုလင်းတိုင်း၏ batch code ကို မှတ်တမ်းတင်ထားပါသည်။"],
  ["delivery", "Delivery Policy", "ပို့ဆောင်မှုမူဝါဒ",
   "Orders are dispatched within 1–2 business days after payment confirmation. Yangon delivery takes 1–3 days; Mandalay 2–3 days; other regions 3–5 days. Free delivery on orders over 100,000 Ks. Cash on Delivery is available in Yangon and Mandalay.",
   "ငွေပေးချေမှုအတည်ပြုပြီးနောက် ၁–၂ ရက်အတွင်း ပို့ဆောင်ပေးပါသည်။ ရန်ကုန် ၁–၃ ရက်၊ မန္တလေး ၂–၃ ရက်၊ အခြားဒေသ ၃–၅ ရက် ကြာနိုင်ပါသည်။ ၁၀၀,၀၀၀ ကျပ်အထက် အော်ဒါများ ပို့ခ အခမဲ့။"],
  ["returns", "Returns & Refunds", "ပြန်အမ်းငွေမူဝါဒ",
   "Unopened full bottles may be returned within 7 days. Decants are final sale for hygiene reasons — unless the wrong item was sent or the product is proven inauthentic, in which case we replace or refund in full.",
   "မဖွင့်ရသေးသော ပုလင်းအပြည့်များကို ၇ ရက်အတွင်း ပြန်ပေးနိုင်ပါသည်။ Decant များမှာ သန့်ရှင်းရေးအရ ပြန်မပေးနိုင်ပါ — မှားပို့မိခြင်း သို့မဟုတ် အတုဖြစ်ကြောင်း သက်သေပြနိုင်ပါက အစားထိုးပေး သို့မဟုတ် ငွေအပြည့်ပြန်အမ်းပေးပါမည်။"],
  ["faq", "Frequently Asked Questions", "မေးလေ့ရှိသောမေးခွန်းများ",
   "Q: What is a decant?\nA: A decant is a small amount of perfume transferred from the original retail bottle into a sterile glass atomizer — the same authentic juice, in a smaller size.\n\nQ: How long does delivery take?\nA: 1–3 days in Yangon, 2–5 days elsewhere in Myanmar.\n\nQ: How do I pay?\nA: KBZPay, WavePay, AYA Pay, bank transfer, or Cash on Delivery (Yangon/Mandalay).",
   "မေး: Decant ဆိုတာဘာလဲ။\nဖြေ: မူရင်းပုလင်းထဲက ရေမွှေးကို သန့်စင်ထားသော ဖန်ပုလင်းအသေးထဲ ပြောင်းထည့်ပေးခြင်းဖြစ်ပြီး ရနံ့အရည်မှာ အတူတူပဲဖြစ်ပါတယ်။\n\nမေး: ပို့ဆောင်ခ ဘယ်လောက်ကြာလဲ။\nဖြေ: ရန်ကုန် ၁–၃ ရက်၊ အခြားဒေသ ၂–၅ ရက်။"],
  ["contact", "Contact Us", "ဆက်သွယ်ရန်",
   "Phone: 09-777-123456 (9am–9pm)\nAddress: No. 123, Pansodan Street, Kyauktada Township, Yangon\nFacebook: Perfume Decant Shop Myanmar",
   "ဖုန်း: 09-777-123456 (နံနက် ၉ – ည ၉)\nလိပ်စာ: အမှတ် ၁၂၃၊ ပန်းဆိုးတန်းလမ်း၊ ကျောက်တံတားမြို့နယ်၊ ရန်ကုန်"],
];

const BANNERS = [
  { title: "Discover Your Signature Scent", title_my: "သင့်ရနံ့ကို ရှာဖွေလိုက်ပါ",
    subtitle: "Authentic decants from 8,000 Ks — try before you commit", subtitle_my: "၈,၀၀၀ ကျပ်မှ စတင် — အစစ်အမှန် decant များ",
    cta: "Shop Now", cta_my: "ယခုဝယ်ယူရန်", link: "/shop.html", gradient: "peach", sort: 1 },
  { title: "New: Baccarat Rouge 540", title_my: "အသစ်: Baccarat Rouge 540",
    subtitle: "The iconic radiant amber — now in 2ml, 5ml & 10ml", subtitle_my: "နာမည်ကျော် amber ရနံ့ — 2ml, 5ml, 10ml ရပြီ",
    cta: "Explore", cta_my: "ကြည့်ရှုရန်", link: "/product.html?slug=baccarat-rouge-540", gradient: "lilac", sort: 2 },
];

function seed() {
  if (get("SELECT COUNT(*) AS c FROM brands").c > 0) return false;
  const now = Date.now();

  // Demo users
  const adminId = createUser({ name: "Shop Admin", email: "admin@perfume.shop", phone: "09777123456", password: "admin123", role: "admin", lang: "my" });
  run("UPDATE users SET email_verified = 1 WHERE id = ?", adminId);
  const staffId = createUser({ name: "Shop Staff", email: "staff@perfume.shop", phone: "09777223456", password: "staff123", role: "staff", lang: "my" });
  run("UPDATE users SET email_verified = 1 WHERE id = ?", staffId);
  const custId = createUser({ name: "Aung Khant", email: "customer@perfume.shop", phone: "09777323456", password: "customer123", role: "customer", lang: "my" });
  run("UPDATE users SET email_verified = 1 WHERE id = ?", custId);

  // Brands + products
  const brandIds = {};
  for (const p of PERFUMES) {
    if (!brandIds[p.brand]) {
      const r = run("INSERT INTO brands (name, slug, active, sort) VALUES (?,?,1,0)", p.brand,
        p.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
      brandIds[p.brand] = r.lastInsertRowid;
    }
    const pr = run(`INSERT INTO products
      (brand_id, name, slug, type, gender, concentration, family, top_notes, mid_notes, base_notes, accords,
       release_year, perfumer, description, description_my, seasons, occasions, longevity, sillage, origin,
       art_seed, authenticity, authenticity_my, status, featured, is_new, bestseller, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'active',?,?,?,?)`,
      brandIds[p.brand], p.name, p.slug, "decant", p.gender, p.concentration, p.family,
      JSON.stringify(p.top), JSON.stringify(p.mid), JSON.stringify(p.base), JSON.stringify(p.accords),
      p.year, p.perfumer, p.desc, p.desc_my, JSON.stringify(p.seasons), JSON.stringify(p.occasions),
      p.longevity, p.sillage, p.origin, p.seed,
      "Hand-poured from a 100% authentic original bottle. Batch recorded.",
      "၁၀၀% မူရင်းပုလင်းမှ တိုက်ရိုက်ဖြည့်သွင်းပေးပါသည်။",
      p.featured, p.is_new, p.bestseller, now);
    const pid = pr.lastInsertRowid;
    const prefix = p.slug.split("-").map(w => w[0]).join("").toUpperCase().slice(0, 3);
    let sort = 0;
    for (const [ml, price] of p.variants) {
      run(`INSERT INTO variants (product_id, name, size_ml, sku, price, compare_at, atomizer, stock_qty, low_threshold, active, sort)
           VALUES (?,?,?,?,?,?, 'Glass spray atomizer', ?, 3, 1, ?)`,
        pid, `${ml}ml Decant`, ml, `${prefix}-${ml}ML`, price, Math.round(price * 1.2),
        Math.max(5, Math.floor(p.bottle.current_ml / ml) - 2), sort++);
    }
    if (p.full_bottle) {
      run(`INSERT INTO variants (product_id, name, size_ml, sku, price, compare_at, atomizer, stock_qty, low_threshold, active, sort)
           VALUES (?,?,?,?,?,?, 'Original retail bottle', 6, 2, 1, ?)`,
        pid, `Full Bottle ${p.full_bottle.size}ml`, p.full_bottle.size, p.full_bottle.sku,
        p.full_bottle.price, Math.round(p.full_bottle.price * 1.15), sort++);
    }
    addBottle({ product_id: pid, ...p.bottle }, adminId);
  }

  // Delivery zones
  for (const z of ZONES) {
    run(`INSERT INTO delivery_zones (name, name_my, region, townships, fee, eta_days, cod_available, active, sort)
         VALUES (?,?,?,?,?,?,?,1,?)`,
      z.name, z.name_my, z.region, JSON.stringify(z.townships), z.fee, z.eta, z.cod, z.sort);
  }

  // Welcome coupon
  run(`INSERT INTO coupons (code, type, value, min_order, max_uses, used_count, active, created_at)
       VALUES ('WELCOME10','percent',10,20000,500,0,1,?)`, now);

  // Settings
  const S = {
    shop_name: "Perfume Decant Shop",
    free_delivery_threshold: "100000",
    pay_kbzpay: "KBZPay: 09-777-123456 (Aung Khant)",
    pay_wavepay: "WavePay: 09-777-123456 (Aung Khant)",
    pay_ayapay: "AYA Pay: 09-777-123456 (Aung Khant)",
    pay_bank: "KBZ Bank: 1234-5678-9012-3456 (Aung Khant)",
    contact_phone: "09-777-123456",
    promo_notice: "Free delivery on orders over 100,000 Ks — this week only!",
    promo_notice_my: "၁၀၀,၀၀၀ ကျပ်အထက် အော်ဒါများ ပို့ခအခမဲ့ — ယခုအပတ်သာ!",
  };
  for (const [k, v] of Object.entries(S)) run("INSERT INTO settings (key, value) VALUES (?,?)", k, v);

  // Content pages
  for (const [key, title, , body_en, body_my] of CONTENT) {
    run("INSERT INTO content (key, title, body_en, body_my) VALUES (?,?,?,?)", key, title, body_en, body_my);
  }
  // Banners
  for (const b of BANNERS) {
    run(`INSERT INTO banners (title, title_my, subtitle, subtitle_my, cta_text, cta_text_my, link, gradient, active, sort)
         VALUES (?,?,?,?,?,?,?,?,1,?)`,
      b.title, b.title_my, b.subtitle, b.subtitle_my, b.cta, b.cta_my, b.link, b.gradient, b.sort);
  }

  // Sample reviews
  const p1 = get("SELECT id FROM products WHERE slug = 'dior-sauvage'").id;
  const p2 = get("SELECT id FROM products WHERE slug = 'baccarat-rouge-540'").id;
  for (const [pid, rating, title, content] of [
    [p1, 5, "Fresh and long-lasting", "Ordered the 5ml decant. Very fresh, lasted the whole day at the office. Authentic for sure."],
    [p2, 5, "Worth every kyat", "The 2ml let me try this luxury scent affordably. Projection is amazing. Will order 10ml next!"],
  ]) {
    run(`INSERT INTO reviews (product_id, user_id, rating, longevity, sillage, title, content, status, verified, created_at)
         VALUES (?,?,?,?,?,?,?,'published',0,?)`, pid, custId, rating, 5, 5, title, content, now);
  }
  for (const pid of [p1, p2]) {
    const agg = get("SELECT AVG(rating) AS a, COUNT(*) AS c FROM reviews WHERE product_id = ? AND status = 'published'", pid);
    run("UPDATE products SET rating_avg = ?, rating_count = ? WHERE id = ?", agg.a || 0, agg.c, pid);
  }

  console.log("Seeded demo data: 12 perfumes, zones, coupon WELCOME10, demo users.");
  return true;
}

module.exports = { seed };
