import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

/* ================= DISCORD ================= */
const WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!WEBHOOK) {
  console.error("DISCORD_WEBHOOK missing");
  process.exit(1);
}

/* ================= LOCATION ================= */
const HOME_ZIP = "94080";
const MAX_MILES = 150;

/* ================= TIMING ================= */
const CHECK_INTERVAL = 5 * 60 * 1000;
const COOLDOWN_MINUTES = 30;

/* ================= PRODUCTS ================= */
const PRODUCTS = [
  { game: "pokemon", name: "Pokémon Booster Box", tags: ["booster box"], weight: 45 },
  { game: "pokemon", name: "Pokémon ETB", tags: ["elite trainer box", "etb"], weight: 30 },
  { game: "pokemon", name: "Pokémon Collection", tags: ["collection", "bundle"], weight: 20 },
  { game: "onepiece", name: "One Piece Booster Box", tags: ["one piece", "booster box"], weight: 50 }
];

/* ================= STORES ================= */
const STORES = [
  {
    name: "Target",
    url: "https://www.target.com/s?searchTerm=pokemon+trading+cards",
    pickupSignals: ["Pick up today", "Ready for pickup"],
    score: 30
  },
  {
    name: "Walmart",
    url: "https://www.walmart.com/search?q=pokemon+trading+cards",
    pickupSignals: ["Pickup today"],
    score: 25
  },
  {
    name: "Best Buy",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards",
    pickupSignals: ["Pickup Today"],
    score: 15
  },
  {
    name: "Barnes & Noble",
    url: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards",
    pickupSignals: ["Available for Pickup"],
    score: 10
  },
  {
    name: "Costco",
    url: "https://www.costco.com/CatalogSearch?keyword=pokemon",
    pickupSignals: [],
    score: 8
  }
];

/* ================= LINKS ================= */
const CHECKOUT_LINKS = {
  Target: q => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  Walmart: q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  BestBuy: q =>
    `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}&pickupStoreShippingZip=${HOME_ZIP}`,
  "Barnes & Noble": q => `https://www.barnesandnoble.com/s/${encodeURIComponent(q)}`,
  Costco: q => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}`
};

/* ================= MEMORY ================= */
const cooldown = new Map();

/* ================= HELPERS ================= */
function detectProduct(html) {
  const t = html.toLowerCase();
  return PRODUCTS.find(p => p.tags.some(tag => t.includes(tag)));
}

function isCooling(key) {
  const last = cooldown.get(key);
  return last && Date.now() - last < COOLDOWN_MINUTES * 60 * 1000;
}

function setCooling(key) {
  cooldown.set(key, Date.now());
}

/* ================= BEST BUY ZIP ACCURACY ================= */
function bestBuyInStoreAccurate(html) {
  return /ready for pickup/i.test(html) && /store pickup/i.test(html);
}

/* ================= CONFIDENCE ================= */
function leakConfidence({ ebay, instore, weight, storeScore }) {
  let score = weight + storeScore + ebay;
  if (instore) score += 25;
  return Math.min(95, score);
}

/* ================= DISCORD BUTTONS ================= */
function checkoutButtons(store, product) {
  return [
    {
      type: 2,
      style: 5,
      label: "🛒 Checkout Now",
      url: CHECKOUT_LINKS[store]?.(product)
    },
    {
      type: 2,
      style: 5,
      label: "🏬 Store Page",
      url: STORES.find(s => s.name === store)?.url
    },
    {
      type: 2,
      style: 5,
      label: "🔍 Backup Search",
      url: `https://www.google.com/search?q=${encodeURIComponent(product + " " + store)}`
    }
  ].filter(b => b.url);
}

/* ================= DISCORD SENDER ================= */
async function sendDiscord(title, desc, buttons = []) {
  const payload = {
    embeds: [{
      title,
      description: desc,
      color: 5793266,
      footer: { text: "TCG Bot • Railway" },
      timestamp: new Date()
    }],
    components: buttons.length
      ? [{ type: 1, components: buttons }]
      : []
  };

  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.error("Discord error:", err.message);
  }
}

/* ================= EBAY DEMAND ================= */
async function ebayBoost(query) {
  try {
    const html = await (await fetch(
      `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1`
    )).text();

    const sold = (html.match(/s-item__title/g) || []).length;
    if (sold >= 20) return 30;
    if (sold >= 10) return 15;
    return 5;
  } catch {
    return 0;
  }
}

/* ================= MAIN ================= */
async function run() {
  console.log("TCG bot scanning…");

  for (const store of STORES) {
    try {
      const html = await (await fetch(store.url)).text();
      const product = detectProduct(html);
      if (!product) continue;

      const key = `${product.name}-${store.name}`;
      if (isCooling(key)) continue;

      const online = /add to cart|ship it/i.test(html);
      const instore =
        store.name === "Best Buy"
          ? bestBuyInStoreAccurate(html)
          : store.pickupSignals.some(s => html.includes(s));

      if (!online && !instore) continue;

      const ebay = await ebayBoost(product.name);
      const confidence = leakConfidence({
        ebay,
        instore,
        weight: product.weight,
        storeScore: store.score
      });

      await sendDiscord(
        instore ? `🏬 IN-STORE — ${product.name}` : `🔥 ONLINE — ${product.name}`,
        `**Store:** ${store.name}\n**Confidence:** ${confidence}%`,
        checkoutButtons(store.name, product.name)
      );

      setCooling(key);
    } catch {
      console.log(`${store.name} skipped`);
    }
  }
}

/* ================= STARTUP ================= */
sendDiscord("🟢 Pokémon TCG bot online");
run();
setInterval(run, CHECK_INTERVAL);
