
import { Client } from "pg";
import dotenv from "dotenv";
import path from "path";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function fixForeignKey() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  
  if (!connectionString) {
    console.error("❌ No DATABASE_URL or POSTGRES_URL found in environment variables.");
    process.exit(1);
  }

  const client = new Client({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to database...");
    await client.connect();
    console.log("✅ Connected.");

    console.log("Fixing 'tool_versions' foreign key constraint...");

    // 1. Drop the existing constraint
    await client.query(`
      ALTER TABLE public.tool_versions 
      DROP CONSTRAINT IF EXISTS tool_versions_tool_id_fkey;
    `);
    console.log("Dropped old constraint (if existed).");

    // 2. Add the correct constraint referencing public.projects
    await client.query(`
      ALTER TABLE public.tool_versions 
      ADD CONSTRAINT tool_versions_tool_id_fkey 
      FOREIGN KEY (tool_id) 
      REFERENCES public.projects(id) 
      ON DELETE CASCADE;
    `);
    console.log("✅ Added new constraint referencing public.projects(id).");

  } catch (error) {
    console.error("❌ Error fixing foreign key:", error);
  } finally {
    await client.end();
    console.log("Disconnected.");
  }
}

fixForeignKey();
