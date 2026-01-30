
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_SECRET_KEY)) {
  console.error("Missing Supabase env vars:", {
    url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    key: !!process.env.SUPABASE_SERVICE_ROLE_KEY || !!process.env.SUPABASE_SECRET_KEY
  });
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!
);

async function run() {
  console.log("Searching for invalid tools (Status != DRAFT but active_version_id IS NULL)...");

  const { data: tools, error } = await supabase
    .from("projects")
    .select("id, name, status")
    .neq("status", "DRAFT")
    .is("active_version_id", null);

  if (error) {
    console.error("Error fetching tools:", error);
    process.exit(1);
  }

  console.log(`Found ${tools.length} invalid tools.`);

  for (const tool of tools) {
    console.log(`Fixing tool ${tool.id} (${tool.name}) - Status: ${tool.status}`);
    
    const { error: updateError } = await supabase
      .from("projects")
      .update({
        status: "DRAFT",
        compiled_at: null,
      })
      .eq("id", tool.id);

    if (updateError) {
      console.error(`Failed to fix tool ${tool.id}:`, updateError);
    } else {
      console.log(`Tool ${tool.id} reset to DRAFT.`);
    }
  }
  
  console.log("Done.");
}

run();
