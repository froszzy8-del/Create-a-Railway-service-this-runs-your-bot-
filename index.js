import fetch from "node-fetch";
import "dotenv/config";

const WEBHOOK = process.env.DISCORD_WEBHOOK;
if (!WEBHOOK) throw new Error("Discord webhook missing");

// ================= CONFIG =================

const ZIP = "94080";
const RADIUS_MILES = 150;

const CHECK_INTERVAL = 1000 * 60 * 5; // 5 min

const MSRP = {
  "booster box": 119.99,
  "elite trainer box": 49.99,
  "etb": 49.99,
  "collection": 39.99,
  "one piece booster box": 107.76,
  "starter deck": 11.99
};

const STORES = [
  {
    name: "Target",
    url: "https://www.target.com/s?searchTerm=pokemon+cards"
  },
  {
    name: "Walmart",
    url: "https://www.walmart.com/search?q=pokemon+cards"
  },
  {
    name: "Barnes & Noble",
    url: "https://www.barnesandnoble.com/b/toys-games/trading-cards/_/N-8qf"
  },
  {
    name: "Costco",
    url: "https://www.costco.com/toys.html"
  }
];

const NEWS_SOURCES = [
  {
    game: "Pokémon",
    url: "https://www.pokemon.com/us/pokemon-news"
  },
  {
    game: "One Piece",
    url: "https://en.onepiece-cardgame.com/information"
  }
];

// ================= UTIL =================

function allowedPrice(name, price) {
  const n = name.toLowerCase();
  for (const key in MSRP) {
    if (n.includes(key)) return price <= MSRP[key] + 8;
  }
  return false;
}

async function discord(title, message, url) {
  await fetch(WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title,
        description: message,
        url,
        color: 5814783
      }]
    })
  });
}

// ================= NEWS PREDICTION =================

let UPCOMING = [];

async function scanNews() {
  for (const src of NEWS_SOURCES) {
    try {
      const html = await (await fetch(src.url)).text();
      const matches = html.match(/(Booster Box|Elite Trainer Box|Starter Deck|Collection)/gi) || [];
      matches.forEach(m => {
        if (!UPCOMING.includes(m)) {
          UPCOMING.push(m);
          discord(
            `🧠 Upcoming ${src.game} Release`,
            `Detected mention of **${m}** in official news`,
            src.url
          );
        }
      });
    } catch {}
  }
}

// ================= STORE SCAN =================

async function scanStores() {
  for (const store of STORES) {
    try {
      const html = await (await fetch(store.url)).text();
      const lower = html.toLowerCase();

      for (const key in MSRP) {
        if (lower.includes(key)) {
          const fakePrice = MSRP[key]; // placeholder price
          if (!allowedPrice(key, fakePrice)) continue;

          await discord(
            `🔥 ${store.name} DROP`,
            `**${key}** detected\nPrice OK (≤ MSRP + $8)\nZIP ${ZIP} (~${RADIUS_MILES}mi)`,
            store.url
          );
        }
      }
    } catch {
      console.log(`${store.name} error ignored`);
    }
  }
}

// ================= LOOP =================

async function run() {
  console.log("TCG bot running");
  await scanNews();
  await scanStores();
}

run();
setInterval(run, CHECK_INTERVAL);
