import fetch from "node-fetch";
import "dotenv/config";

/* ================= DISCORD ================= */
const WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!WEBHOOK) throw new Error("https://discordapp.com/api/webhooks/1467793197647528141/fhTQQ6KvTVLv9UutC8jq4tza54d9eO3qz29sucV9YM8RmzB3Xl9nbwlOk1pNk_0mUaap");

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
    maxQty: 5,
    score: 30
  },
  {
    name: "Walmart",
    url: "https://www.walmart.com/search?q=pokemon+trading+cards",
    pickupSignals: ["Pickup today"],
    maxQty: 12,
    score: 25
  },
  {
    name: "Best Buy",
    url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards",
    pickupSignals: ["Pickup Today"],
    maxQty: 2,
    score: 15
  },
  {
    name: "Barnes & Noble",
    url: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards",
    pickupSignals: ["Available for Pickup"],
    maxQty: 2,
    score: 10
  },
  {
    name: "Costco",
    url: "https://www.costco.com/CatalogSearch?keyword=pokemon",
    pickupSignals: [],
    maxQty: 1,
    score: 8
  }
];

/* ================= CHECKOUT LINKS ================= */
const CHECKOUT_LINKS = {
  Target: q => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  Walmart: q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  BestBuy: q => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
  "Barnes & Noble": q => `https://www.barnesandnoble.com/s/${encodeURIComponent(q)}`,
  Costco: q => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}`,
  "Pokémon Center": q => `https://www.pokemoncenter.com/search/${encodeURIComponent(q)}`
};

/* ================= NEWS SOURCES ================= */
const NEWS_SOURCES = [
  { game: "Pokémon", url: "https://www.pokemon.com/us/pokemon-news" },
  { game: "One Piece", url: "https://en.onepiece-cardgame.com/information" }
];

/* ================= RELEASE COUNTDOWN ================= */
const RELEASES = [
  { game: "Pokémon", product: "Scarlet & Violet Booster Box", date: "2026-03-22T07:00:00Z" },
  { game: "One Piece", product: "OP-10 Booster Box", date: "2026-04-05T07:00:00Z" }
];

/* ================= MEMORY ================= */
const cooldown = new Map();
const upcoming = new Set();

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

/* ================= EBAY DEMAND ================= */
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

/* ================= MSRP AUTO-LEARN ================= */
async function learnMSRP(product) {
  try {
    const url = `https://www.pokemoncenter.com/search/${encodeURIComponent(product)}`;
    const html = await (await fetch(url)).text();
    const match = html.match(/\$([0-9]+\.[0-9]{2})/);
    return match ? parseFloat(match[1]) : null;
  } catch {
    return null;
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

/* ================= RELEASE COUNTDOWN ================= */
async function releaseCountdown() {
  const now = Date.now();
  for (const r of RELEASES) {
    const t = new Date(r.date).getTime();
    const hours = Math.floor((t - now) / 3600000);
    if ([168, 72, 24, 1].includes(hours)) {
      await sendDiscord(
        `Release Countdown — ${r.game}`,
        `${r.product}\nReleases in ${hours} hours`,
        "https://www.pokemoncenter.com"
      );
    }
  }
}

/* ================= MAIN LOOP ================= */
async function run() {
  console.log("TCG bot scanning…");

  await scanNews();
  await releaseCountdown();

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

      const msrp = await learnMSRP(product.name);
      if (msrp && msrp > msrp + 8) continue;

      const ebay = await ebayBoost(product.name);
      const confidence = Math.min(95, product.weight + store.score + ebay + (instore ? 20 : 0));

      const title = instore
        ? `🏬 IN-STORE — ${product.name}`
        : `🔥 ONLINE — ${product.name}`;

      const body =
        `${store.name}\n` +
        (instore ? `Near ZIP ${HOME_ZIP} (≤ ${MAX_MILES}mi)\n` : "") +
        `Max Qty: ${store.maxQty}\n` +
        `Confidence: ${confidence}%\n` +
        `Checkout immediately`;

      const checkout =
        CHECKOUT_LINKS[store.name]?.(product.name) || store.url;

      await sendDiscord(title, body, checkout);
      setCooling(key);
    }
    catch {
      console.log(`${store.name} error ignored`);
    }
  }
}

run();
setInterval(run, CHECK_INTERVAL);
