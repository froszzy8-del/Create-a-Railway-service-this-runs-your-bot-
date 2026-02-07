import fetch from "node-fetch";

// ================= CONFIG =================
const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const HOME_ZIP = "94080";
const MAX_MILES = 150;
const CHECK_INTERVAL = 90 * 1000; // 90 seconds

const PRODUCT_KEYWORDS = [
  "pokemon",
  "one piece",
  "booster",
  "elite trainer",
  "etb",
  "box",
  "bundle",
  "display",
  "collection",
  "tin"
];

// Store search URLs (safe)
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
async function sendDiscord(title, description, url) {
  if (!DISCORD_WEBHOOK) return;

  await fetch(DISCORD_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        description,
        url,
        color: 5793266,
        footer: { text: "TCG Bot • Online + In-Store" },
        timestamp: new Date()
      }]
    })
  });
}

function matchProduct(html) {
  const lower = html.toLowerCase();
  return PRODUCT_KEYWORDS.some(k => lower.includes(k));
}

// ================= ONLINE CHECK =================
async function checkOnline() {
  for (const store of STORES) {
    try {
      const res = await fetch(store.search, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000
      });

      const html = await res.text();

      if (matchProduct(html) && html.includes("Add to cart")) {
        await sendDiscord(
          `🔥 Online Stock — ${store.name}`,
          `Possible Pokémon / One Piece product available.\nManual checkout recommended.`,
          store.search
        );
      }
    } catch {
      console.log(`${store.name} online check failed (ignored)`);
    }
  }
}

// ================= IN-STORE CHECK =================
async function checkInStore() {
  // Lightweight signal — we alert based on availability phrases
  for (const store of STORES) {
    try {
      const res = await fetch(store.search, {
        headers: { "User-Agent": "Mozilla/5.0" },
        timeout: 15000
      });

      const html = await res.text();

      if (
        matchProduct(html) &&
        (html.includes("Pick up today") ||
         html.includes("In stock at") ||
         html.includes("Available nearby"))
      ) {
        await sendDiscord(
          `🏬 In-Store Signal — ${store.name}`,
          `Possible local availability near ZIP ${HOME_ZIP} (≤ ${MAX_MILES}mi).\nTap to check store stock.`,
          store.search
        );
      }
    } catch {
      console.log(`${store.name} in-store check failed (ignored)`);
    }
  }
}

// ================= LOOP =================
async function run() {
  console.log("TCG bot running...");
  await checkOnline();
  await checkInStore();
}

run();
setInterval(run, CHECK_INTERVAL);
