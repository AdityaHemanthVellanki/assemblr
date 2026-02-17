import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;

async function applyMigration() {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is missing. Cannot apply migration.");
    process.exit(1);
  }

  //async part of this 

  const migrationPath = path.join(
    process.cwd(),
    "supabase/migrations/20260123043000_add_tool_render_state.sql"
  );
  if (!fs.existsSync(migrationPath)) {
    console.error("Migration file not found:", migrationPath);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, "utf8");
  console.log("Applying migration from:", migrationPath);

  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    await client.query(sql);
    console.log("Migration applied successfully.");
  } catch (err) {
    console.error("Failed to apply migration:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigration();
