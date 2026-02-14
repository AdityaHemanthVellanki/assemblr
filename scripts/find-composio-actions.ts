import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

import { Composio } from "composio-core";

async function main() {
  const apiKey = process.env.COMPOSIO_API_KEY;
  if (!apiKey) {
    console.error("COMPOSIO_API_KEY not found in env");
    return;
  }
  const client = new Composio({ apiKey });

  // Query all integrations we need
  const apps = ["github", "slack", "notion", "linear", "googlesheets"];

  for (const app of apps) {
    console.log(`\n========== ${app.toUpperCase()} ==========`);
    try {
      const response = await client.actions.list({ apps: app });
      const items = response.items;

      // Show all action names for mapping
      for (const a of items) {
        console.log(a.name);
      }
      console.log(`--- Total ${app} actions: ${items.length} ---`);
    } catch (e: any) {
      console.error(`Failed to fetch ${app}: ${e.message}`);
    }
  }
}
main().catch(console.error);
