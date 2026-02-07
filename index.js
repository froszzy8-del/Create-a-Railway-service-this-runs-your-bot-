import fetch from "node-fetch";

// ================= CONFIG =================
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const HOME_ZIP = "94080";
const MAX_MILES = 150;
const CHECK_INTERVAL = 90 * 1000;
const COOLDOWN_MINUTES = 30;

// ================= COOLDOWN MEMORY =================
const cooldownMap = new Map();

// ================= PRODUCTS =================
const PRODUCTS = [
  { game: "pokemon", name: "Pokémon Booster Box", tags: ["booster box", "display"], weight: 45 },
  { game: "pokemon", name: "Pokémon ETB", tags: ["elite trainer box", "etb"], weight: 30 },
  { game: "pokemon", name: "Pokémon Bundle", tags: ["bundle", "collection"], weight: 20 },
  { game: "onepiece", name: "One Piece Booster Box", tags: ["one piece", "booster box"], weight: 50 }
];

// ================= STORES =================
const STORES = [
  {
    name: "Target",
    url: "https://www.target.com/s?searchTerm=pokemon+trading+cards",
    checkout: "https://www.target.com/s?searchTerm=pokemon+trading+cards",
    pickupSignals: ["Pick up today", "Ready for pickup"],
    maxQty: 5,
    score: 30
  },
  {
    name: "Walmart",
    url: "https://www.walmart.com/search?q=pokemon+trading+cards",
    checkout: "https://www.walmart.com/search?q=pokemon+trading+cards",
    pickupSignals: ["Pickup today"],
    maxQty: 12,
    score: 25
  },
  {
    name: "Best Buy",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards",
    checkout: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards",
    pickupSignals: ["Pickup Today"],
    maxQty: 2,
    score: 15
  },
  {
    name: "Barnes & Noble",
    url: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards",
    checkout: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards",
    pickupSignals: ["Available for Pickup"],
    maxQty: 2,
    score: 10
  },
  {
    name: "Costco",
    url: "https://www.costco.com/CatalogSearch?keyword=pokemon",
    checkout: "https://www.costco.com/CatalogSearch?keyword=pokemon",
    pickupSignals: [],
    maxQty: 1,
    score: 8
  }
];

// ================= HELPERS =================
function cooldownKey(product, store) {
  return `${product.name}_${store.name}`;
}

function isCoolingDown(key) {
  const last = cooldownMap.get(key);
  if (!last) return false;
  return (Date.now() - last) < COOLDOWN_MINUTES * 60 * 1000;
}

function setCooldown(key) {
  cooldownMap.set(key, Date.now());
}

async function sendDiscord(title, desc, url) {
  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        description: desc,
        url,
        color: 5763719,
        footer: { text: "TCG Bot • Online + In-Store • Cooldown Active" },
        timestamp: new Date()
      }]
    })
  });
}

function detectProduct(html) {
  const text = html.toLowerCase();
  return PRODUCTS.find(p => p.tags.some(t => text.includes(t)));
}

// ================= EBAY DEMAND =================
async function ebayBoost(query) {
  try {
    const url = `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(query)}&LH_Sold=1`;
    const html = await (await fetch(url)).text();
    const sold = (html.match(/s-item__title/g) || []).length;

    if (sold >= 20) return 30;
    if (sold >= 10) return 15;
    return 5;
  } catch {
    return 0;
  }
}

// ================= CONFIDENCE =================
function confidence(product, store, instore, ebay) {
  let score = product.weight + store.score + ebay;
  if (instore) score += 20;
  return Math.min(95, score);
}

// ================= MAIN LOOP =================
async function run() {
  console.log("Scanning stores…");

  for (const store of STORES) {
    try {
      const res = await fetch(store.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000
      });

      const html = await res.text();
      const product = detectProduct(html);
      if (!product) continue;

      const key = cooldownKey(product, store);
      if (isCoolingDown(key)) continue;

      const online =
        html.includes("Add to cart") ||
        html.includes("Add to Cart") ||
        html.includes("Ship it");

      const instore = store.pickupSignals.some(s => html.includes(s));
      if (!online && !instore) continue;

      const ebay = await ebayBoost(product.name);
      const conf = confidence(product, store, instore, ebay);

      const title = instore
        ? `🏬 IN-STORE — ${product.name}`
        : `🔥 ONLINE — ${product.name}`;

      const body =
        `${store.name}\n` +
        (instore ? `📍 Near ZIP ${HOME_ZIP} (≤ ${MAX_MILES}mi)\n` : "") +
        `🛒 Max Qty: ${store.maxQty}\n` +
        `🎯 Confidence: ${conf}%\n` +
        `⚡ Checkout fast`;

      await sendDiscord(title, body, store.checkout);
      setCooldown(key);
    }
    catch {
      console.log(`${store.name} error ignored`);
    }
  }
}

run();
setInterval(run, CHECK_INTERVAL);
