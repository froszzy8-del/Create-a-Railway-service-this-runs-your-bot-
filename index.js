import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const WEBHOOK = process.env.DISCORD_WEBHOOK;

if (!WEBHOOK) {
  console.error("DISCORD_WEBHOOK missing");
  process.exit(1);
}

async function sendDiscord(message) {
  try {
    await fetch(WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: message })
    });
    console.log("Sent:", message);
  } catch (err) {
    console.error("Discord error:", err.message);
  }
}

// Startup confirmation
sendDiscord("🟢 Pokémon TCG bot online (Railway ready)");

// Keep alive loop (Railway requires this)
setInterval(() => {
  console.log("Bot heartbeat");
}, 60000);
