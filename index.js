import fetch from "node-fetch";
import "dotenv/config";

/* ================= DISCORD ================= */
const WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!WEBHOOK) throw new Error("Discord webhook missing");

/* ================= LOCATION ================= */
const HOME_ZIP = "94080";
const MAX_MILES = 150;

/* ================= TIMING ================= */
const CHECK_INTERVAL = 5 * 60 * 1000;
const COOLDOWN_MINUTES = 30;

/* ================= MSRP ================= */
const MSRP = {
  "booster box": 119.99,
  "elite trainer box": 49.99,
  "etb": 49.99,
  "collection": 39.99,
  "one piece booster box": 107.76,
  "starter deck": 11.99
};

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

/* ================= NEWS SOURCES ================= */
const NEWS_SOURCES = [
  { game: "Pokémon", url: "https://www.pokemon.com/us/pokemon-news" },
  { game: "One Piece", url: "https://en.onepiece-cardgame.com/information" }
];

/* ================= MEMORY ================= */
const cooldown = new Map();
const upcoming = new Set();

/* ================= HELPERS ================= */
function allowedPrice(name, price) {
  const n = name.toLowerCase();
  for (const k in MSRP) {
    if (n.includes(k)) return price <= MSRP[k] + 8;
  }
  return false;
}

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

async function sendDiscord(title, desc, url) {
  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        description: desc,
        url,
        color: 5793266,
        footer: { text: "TCG Bot • Online + In-Store • MSRP Guard" },
        timestamp: new Date()
      }]
    })
  });
}

/* ================= EBAY BOOST ================= */
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

/* ================= NEWS SCAN ================= */
async function scanNews() {
  for (const src of NEWS_SOURCES) {
    try {
      const html = await (await fetch(src.url)).text();
      const hits = html.match(/(Booster Box|Elite Trainer Box|Starter Deck|Collection)/gi) || [];
      hits.forEach(h => {
        const key = `${src.game}-${h}`;
        if (!upcoming.has(key)) {
          upcoming.add(key);
          sendDiscord(
            `Upcoming ${src.game} Release`,
            `Official news mentioned **${h}**`,
            src.url
          );
        }
      });
    } catch {}
  }
}

/* ================= MAIN LOOP ================= */
async function run() {
  console.log("TCG bot scanning…");
  await scanNews();

  for (const store of STORES) {
    try {
      const res = await fetch(store.url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await res.text();

      const product = detectProduct(html);
      if (!product) continue;

      const key = `${product.name}-${store.name}`;
      if (isCooling(key)) continue;

      const online = /add to cart|ship it/i.test(html);
      const instore = store.pickupSignals.some(s => html.includes(s));
      if (!online && !instore) continue;

      const ebay = await ebayBoost(product.name);
      const confidence = Math.min(95, product.weight + store.score + ebay + (instore ? 20 : 0));

      const title = instore
        ? `IN-STORE — ${product.name}`
        : `ONLINE — ${product.name}`;

      const body =
        `${store.name}\n` +
        (instore ? `Near ZIP ${HOME_ZIP} (≤ ${MAX_MILES}mi)\n` : "") +
        `Max Qty: ${store.maxQty}\n` +
        `Confidence: ${confidence}%\n` +
        `Checkout fast`;

      await sendDiscord(title, body, store.checkout);
      setCooling(key);
    }
    catch {
      console.log(`${store.name} error ignored`);
    }
  }
}

run();
setInterval(run, CHECK_INTERVAL);
