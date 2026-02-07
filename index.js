import fetch from "node-fetch";

// ================= CONFIG =================
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const HOME_ZIP = "94080";
const MAX_MILES = 150;
const CHECK_INTERVAL = 90 * 1000;

// Product definitions
const PRODUCTS = [
  { name: "Pokémon Booster Box", tags: ["booster box", "display"] },
  { name: "Pokémon ETB", tags: ["elite trainer box", "etb"] },
  { name: "Pokémon Bundle", tags: ["bundle", "collection"] },
  { name: "One Piece Booster Box", tags: ["one piece", "booster box"] }
];

// Retail search targets
const STORES = [
  {
    name: "Target",
    search: "https://www.target.com/s?searchTerm=pokemon+trading+cards"
  },
  {
    name: "Walmart",
    search: "https://www.walmart.com/search?q=pokemon+trading+cards"
  },
  {
    name: "Barnes & Noble",
    search: "https://www.barnesandnoble.com/s/pokemon%20trading%20cards"
  },
  {
    name: "Costco",
    search: "https://www.costco.com/CatalogSearch?keyword=pokemon"
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
        color: 3447003,
        footer: { text: "TCG Bot • Online + In-Store" },
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

    if (sold >= 20) return "\n📈 **High resale demand**";
    if (sold >= 10) return "\n📊 Moderate resale demand";
    return "";
  } catch {
    return "";
  }
}

// ================= CHECKS =================
async function run() {
  console.log("TCG scan running...");

  for (const store of STORES) {
    try {
      const res = await fetch(store.search, {
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

      const instore =
        html.includes("Pick up today") ||
        html.includes("Available nearby") ||
        html.includes("In stock at");

      if (!online && !instore) continue;

      const boost = await ebayBoost(product.name);

      const title = instore
        ? `🏬 In-Store — ${product.name}`
        : `🔥 Online — ${product.name}`;

      const body =
        `${store.name}\n` +
        (instore ? `📍 Near ZIP ${HOME_ZIP} (≤ ${MAX_MILES}mi)\n` : "") +
        `🛒 Checkout link below\n` +
        boost;

      await sendDiscord(title, body, store.search);
    }
    catch {
      console.log(`${store.name} error ignored`);
    }
  }
}

run();
setInterval(run, CHECK_INTERVAL);
