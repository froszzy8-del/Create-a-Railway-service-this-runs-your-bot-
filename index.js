import fetch from "node-fetch";

// ================= CONFIG =================
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const HOME_ZIP = "94080";
const MAX_MILES = 150;
const CHECK_INTERVAL = 90 * 1000;

// ================= PRODUCTS =================
const PRODUCTS = [
  { game: "pokemon", name: "Pokémon Booster Box", tags: ["booster box", "display"], weight: 40 },
  { game: "pokemon", name: "Pokémon ETB", tags: ["elite trainer box", "etb"], weight: 25 },
  { game: "pokemon", name: "Pokémon Bundle", tags: ["bundle", "collection"], weight: 20 },
  { game: "onepiece", name: "One Piece Booster Box", tags: ["one piece", "booster box"], weight: 45 }
];

// ================= STORES =================
const STORES = [
  {
    name: "Target",
    url: "https://www.target.com/s?searchTerm=pokemon+trading+cards",
    pickupSignals: ["Pick up today", "Ready for pickup", "Available nearby"],
    score: 25
  },
  {
    name: "Walmart",
    url: "https://www.walmart.com/search?q=pokemon+trading+cards",
    pickupSignals: ["Pickup today", "Available for pickup"],
    score: 20
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

// ================= HELPERS =================
async function sendDiscord(title, desc, url) {
  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        description: desc,
        url,
        color: 5793266,
        footer: { text: "TCG Bot • Online + In-Store • ZIP 94080" },
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

// ================= CONFIDENCE ENGINE =================
function confidenceScore(product, store, instore, ebayScore) {
  let score = product.weight;
  score += store.score;
  score += ebayScore;
  if (instore) score += 20;
  return Math.min(95, score);
}

// ================= MAIN LOOP =================
async function run() {
  console.log("Scanning retailers...");

  for (const store of STORES) {
    try {
      const res = await fetch(store.url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000
      });

      const html = await res.text();
      const product = detectProduct(html);
      if (!product) continue;

      const online =
        html.includes("Add to cart") ||
        html.includes("Add to Cart") ||
        html.includes("Ship it");

      const instore = store.pickupSignals.some(s => html.includes(s));

      if (!online && !instore) continue;

      const ebayScore = await ebayBoost(product.name);
      const confidence = confidenceScore(product, store, instore, ebayScore);

      const title = instore
        ? `🏬 IN-STORE — ${product.name}`
        : `🔥 ONLINE — ${product.name}`;

      const body =
        `${store.name}\n` +
        (instore ? `📍 Near ZIP ${HOME_ZIP} (≤ ${MAX_MILES}mi)\n` : "") +
        `🎯 Confidence: ${confidence}%\n` +
        `🛒 Tap to checkout`;

      await sendDiscord(title, body, store.url);
    }
    catch {
      console.log(`${store.name} error ignored`);
    }
  }
}

run();
setInterval(run, CHECK_INTERVAL);
