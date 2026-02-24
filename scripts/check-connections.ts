import { getServerEnv } from "@/lib/env/server";

async function main() {
  const env = getServerEnv();
  const apiKey = env.COMPOSIO_API_KEY as string;

  // List only ACTIVE accounts
  const res = await fetch("https://backend.composio.dev/api/v1/connectedAccounts?limit=200&status=ACTIVE", {
    headers: { "x-api-key": apiKey },
  });
  const data = await res.json();
  const items: any[] = data.items || [];
  console.log(`Total ACTIVE accounts: ${items.length}`);

  // Show unique entity IDs
  const entities = new Set<string>();
  for (const item of items) {
    entities.add(item.entityId ?? "(null)");
  }
  console.log(`\nUnique entity IDs: ${Array.from(entities).join(", ")}`);

  // Show each active connection with its entity
  for (const item of items) {
    console.log(`  ${item.appName} | entity=${item.entityId} | id=${item.id}`);
  }
}

main().catch(console.error);
