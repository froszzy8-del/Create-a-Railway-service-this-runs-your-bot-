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

/* ================= LINKS ================= */
const CHECKOUT_LINKS = {
  Target: q => `https://www.target.com/s?searchTerm=${encodeURIComponent(q)}`,
  Walmart: q => `https://www.walmart.com/search?q=${encodeURIComponent(q)}`,
  BestBuy: q => `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(q)}`,
  "Barnes & Noble": q => `https://www.barnesandnoble.com/s/${encodeURIComponent(q)}`,
  Costco: q => `https://www.costco.com/CatalogSearch?keyword=${encodeURIComponent(q)}`,
  "Pokémon Center": q => `https://www.pokemoncenter.com/search/${encodeURIComponent(q)}`
};

/* ================= NEWS ================= */
const NEWS_SOURCES = [
  { game: "Pokémon", url: "https://www.pokemon.com/us/pokemon-news" },
  { game: "One Piece", url: "https://en.onepiece-cardgame.com/information" }
];

/* ================= RELEASES ================= */
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

/* ================= DISCORD SENDER ================= */
async function sendDiscord(titleOrMessage, desc, url) {
  const payload = desc
    ? {
        embeds: [{
          title: titleOrMessage,
          description: desc,
          url,
          color: 5793266,
          footer: { text: "TCG Bot • MSRP Guard • Railway" },
          timestamp: new Date()
        }]
      }
    : { content: titleOrMessage };

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

/* ================= MSRP LEARN ================= */
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

/* ================= NEWS ================= */
async function scanNews() {
  for (const src of NEWS_SOURCES) {
    try {
      const html = await (await fetch(src.url)).text();
      const hits = html.match(/(Booster Box|Elite Trainer Box|Starter Deck|Collection)/gi) || [];
      hits.forEach(h => {
        const key = `${src.game}-${h}`;
        if (!upcoming.has(key)) {
          upcoming.add(key);
          sendDiscord(`Upcoming ${src.game} Release`, `Mentioned: **${h}**`, src.url);
        }
      });
    } catch {}
  }
}

/* ================= COUNTDOWN ================= */
async function releaseCountdown() {
  const now = Date.now();
  for (const r of RELEASES) {
    const hours = Math.floor((new Date(r.date) - now) / 3600000);
    if ([168, 72, 24, 1].includes(hours)) {
      sendDiscord(
        `Release Countdown — ${r.game}`,
        `${r.product}\nReleases in ${hours} hours`,
        "https://www.pokemoncenter.com"
      );
    }
  }
}

/* ================= MAIN ================= */
async function run() {
  console.log("TCG bot scanning…");

  await scanNews();
  await releaseCountdown();

  for (const store of STORES) {
    try {
      const html = await (await fetch(store.url)).text();
      const product = detectProduct(html);
      if (!product) continue;

      const key = `${product.name}-${store.name}`;
      if (isCooling(key)) continue;

      const online = /add to cart|ship it/i.test(html);
      const instore = store.pickupSignals.some(s => html.includes(s));
      if (!online && !instore) continue;

      const ebay = await ebayBoost(product.name);
      const confidence = Math.min(95, product.weight + store.score + ebay + (instore ? 20 : 0));

      await sendDiscord(
        instore ? `🏬 IN-STORE — ${product.name}` : `🔥 ONLINE — ${product.name}`,
        `${store.name}\nConfidence: ${confidence}%\nCheckout immediately`,
        CHECKOUT_LINKS[store.name]?.(product.name) || store.url
      );

      setCooling(key);
    } catch {
      console.log(`${store.name} skipped`);
    }
  }
}

/* ================= STARTUP ================= */
sendDiscord("🟢 Pokémon TCG bot online (Railway ready)");
run();
setInterval(run, CHECK_INTERVAL);
setInterval(() => console.log("Bot heartbeat"), 60000);
