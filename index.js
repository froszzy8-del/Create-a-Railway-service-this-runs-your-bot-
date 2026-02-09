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

/* ================= MSRP (FALLBACK) ================= */
const MSRP = {
  "Pokémon Booster Box": 161.64,
  "Pokémon ETB": 49.99,
  "Pokémon Collection": 29.99,
  "One Piece Booster Box": 107.76
};

/* ================= AUTO-LEARNED MSRP ================= */
const learnedMSRP = {};
const POKEMON_CENTER_SEARCH = "https://www.pokemoncenter.com/search/";

/* ================= STORES ================= */
const STORES = [
  { name: "Target", url: "https://www.target.com/s?searchTerm=pokemon+trading+cards", pickupSignals: ["Pick up today", "Ready for pickup"], score: 30, maxQty: 5 },
  { name: "Walmart", url: "https://www.walmart.com/search?q=pokemon+trading+cards", pickupSignals: ["Pickup today"], score: 25, maxQty: 12 },
  { name: "Best Buy", url: "https://www.bestbuy.com/site/searchpage.jsp?st=pokemon+trading+cards", pickupSignals: ["Pickup Today"], score: 15, maxQty: 2 },
  { name: "Barnes & Noble", url: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards", pickupSignals: ["Available for Pickup"], score: 10, maxQty: 2 },
  { name: "Costco", url: "https://www.costco.com/CatalogSearch?keyword=pokemon", pickupSignals: [], score: 8, maxQty: 1 }
];

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

/* ================= MSRP AUTO-LEARNING ================= */
async function learnPokemonCenterMSRP(productName) {
  try {
    if (learnedMSRP[productName]) return;

    const html = await (await fetch(
      `${POKEMON_CENTER_SEARCH}${encodeURIComponent(productName)}`
    )).text();

    const priceMatch = html.match(/\$([0-9]+\.[0-9]{2})/);
    if (!priceMatch) return;

    learnedMSRP[productName] = parseFloat(priceMatch[1]);

    await sendDiscord(
      "🧠 Pokémon Center MSRP Learned",
      `**${productName}**
MSRP: $${learnedMSRP[productName]}
Source: Pokémon Center`,
      `https://www.pokemoncenter.com/search/${encodeURIComponent(productName)}`
    );
  } catch {}
}

/* ================= PRICE EXTRACTION ================= */
function extractPrice(html) {
  const match = html.match(/\$([0-9]+(?:\.[0-9]{2})?)/);
  return match ? parseFloat(match[1]) : null;
}

/* ================= MSRP VERDICT ================= */
function priceVerdict(msrp, price) {
  if (!msrp || !price) return { label: "UNKNOWN", score: 0 };

  const ratio = price / msrp;

  if (ratio <= 1.05) return { label: "MSRP", score: 25 };
  if (ratio <= 1.20) return { label: "MARKUP", score: 5 };
  return { label: "SCALPER", score: -40 };
}

/* ================= SKU SNIFFING ================= */
function extractTargetTCIN(html) {
  const match = html.match(/"tcin":"(\d{8})"/);
  return match ? match[1] : null;
}

function extractWalmartOfferId(html) {
  const match = html.match(/"offerId":"([a-zA-Z0-9]+)"/);
  return match ? match[1] : null;
}

/* ================= STORE LINKS ================= */
function buildTargetLinks(tcin, qty) {
  return {
    cart: `https://www.target.com/co-cart?preselect=${tcin}&quantity=${qty}`
  };
}

function buildWalmartLinks(offerId, qty) {
  return {
    cart: `https://www.walmart.com/cart?items=${offerId}:${qty}`
  };
}

/* ================= BEST BUY ================= */
function bestBuyInStoreAccurate(html) {
  return /ready for pickup/i.test(html) && /store pickup/i.test(html);
}

/* ================= CONFIDENCE ================= */
function leakConfidence({ ebay, instore, weight, storeScore, priceScore }) {
  let score = weight + storeScore + ebay + priceScore;
  if (instore) score += 25;
  return Math.max(0, Math.min(95, score));
}

/* ================= CART INTENT ================= */
function cartIntentLink(store, productName, html, maxQty) {
  if (store === "Target") {
    const tcin = extractTargetTCIN(html);
    if (tcin) return buildTargetLinks(tcin, maxQty).cart;
  }

  if (store === "Walmart") {
    const offerId = extractWalmartOfferId(html);
    if (offerId) return buildWalmartLinks(offerId, maxQty).cart;
  }

  if (store === "Best Buy") {
    return `https://www.bestbuy.com/site/searchpage.jsp?st=${encodeURIComponent(productName)}&pickupStoreShippingZip=${HOME_ZIP}`;
  }

  return STORES.find(s => s.name === store)?.url || null;
}

/* ================= DISCORD ================= */
async function sendDiscord(title, desc, buttons = []) {
  const payload = {
    embeds: [{
      title,
      description: desc,
      color: 5793266,
      footer: { text: "TCG Bot • MSRP Guard • Railway" },
      timestamp: new Date()
    }],
    components: buttons.length ? [{ type: 1, components: buttons }] : []
  };

  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

/* ================= EBAY ================= */
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

  for (const p of PRODUCTS) {
    await learnPokemonCenterMSRP(p.name);
  }

  for (const store of STORES) {
    try {
      const html = await (await fetch(store.url)).text();
      const product = detectProduct(html);
      if (!product) continue;

      const key = `${product.name}-${store.name}`;
      if (isCooling(key)) continue;

      const online = /add to cart|ship it/i.test(html);
      const instore = store.name === "Best Buy"
        ? bestBuyInStoreAccurate(html)
        : store.pickupSignals.some(s => html.includes(s));

      if (!online && !instore) continue;

      const price = extractPrice(html);
      const trueMSRP = learnedMSRP[product.name] || MSRP[product.name];
      const verdict = priceVerdict(trueMSRP, price);

      if (verdict.label === "SCALPER") continue;

      const ebay = await ebayBoost(product.name);
      const confidence = leakConfidence({
        ebay,
        instore,
        weight: product.weight,
        storeScore: store.score,
        priceScore: verdict.score
      });

      await sendDiscord(
        instore ? `🏬 IN-STORE — ${product.name}` : `🔥 ONLINE — ${product.name}`,
        `**Store:** ${store.name}
**Price:** $${price ?? "?"}
**MSRP:** $${trueMSRP ?? "?"}
**Verdict:** ${verdict.label}
**Confidence:** ${confidence}%`,
        [{
          type: 2,
          style: 5,
          label: `🛒 Checkout (x${store.maxQty})`,
          url: cartIntentLink(store.name, product.name, html, store.maxQty)
        }].filter(b => b.url)
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
