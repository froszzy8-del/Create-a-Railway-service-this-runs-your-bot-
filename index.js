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
    score: 30,
    maxQty: 5
  },
  {
    name: "Walmart",
    url: "https://www.walmart.com/search?q=pokemon+trading+cards",
    pickupSignals: ["Pickup today"],
    score: 25,
    maxQty: 12
  },
  {
    name: "Best Buy",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards",
    pickupSignals: ["Pickup Today"],
    score: 15,
    maxQty: 2
  },
  {
    name: "Barnes & Noble",
    url: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards",
    pickupSignals: ["Available for Pickup"],
    score: 10,
    maxQty: 2
  },
  {
    name: "Costco",
    url: "https://www.costco.com/CatalogSearch?keyword=pokemon",
    pickupSignals: [],
    score: 8,
    maxQty: 1
  }
];

/* ================= PRODUCT LINKS ================= */
const PRODUCT_LINKS = {
  "Pokémon Booster Box": {
    Target: "https://www.target.com/s?searchTerm=pokemon+booster+box",
    Walmart: "https://www.walmart.com/search?q=pokemon+booster+box",
    BestBuy: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+booster+box",
    "Barnes & Noble": "https://www.barnesandnoble.com/s/pokemon+booster+box"
  },
  "Pokémon ETB": {
    Target: "https://www.target.com/s?searchTerm=pokemon+elite+trainer+box",
    Walmart: "https://www.walmart.com/search?q=pokemon+elite+trainer+box",
    BestBuy: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+elite+trainer+box",
    "Barnes & Noble": "https://www.barnesandnoble.com/s/pokemon+elite+trainer+box"
  }
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

/* ================= CART INTENT ================= */
function cartIntentLink(store, productName) {
  const base =
    PRODUCT_LINKS[productName]?.[store] ||
    STORES.find(s => s.name === store)?.url;

  if (!base) return null;

  if (store === "Best Buy") {
    return `${base}&pickupStoreShippingZip=${HOME_ZIP}`;
  }

  return base;
}

/* ================= DISCORD BUTTONS ================= */
function checkoutButtons(store, productName, maxQty) {
  return [
    {
      type: 2,
      style: 5,
      label: `🛒 Checkout (x${maxQty})`,
      url: cartIntentLink(store, productName)
    },
    {
      type: 2,
      style: 5,
      label: "📦 Product Page",
      url: PRODUCT_LINKS[productName]?.[store]
    },
    {
      type: 2,
      style: 5,
      label: "🔍 Backup Search",
      url: `https://www.google.com/search?q=${encodeURIComponent(productName + " " + store)}`
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

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
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
        checkoutButtons(store.name, product.name, store.maxQty)
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
