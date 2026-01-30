
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const supabase = createSupabaseAdminClient();
  
  console.log("Probing 'tools' table...");
  const { data: toolsData, error: toolsError } = await supabase.from("tools").select("*").limit(1);
  
  if (toolsError) {
    console.log("Error querying 'tools':", toolsError);
  } else {
    console.log("Found 'tools' table. Rows:", toolsData?.length);
    if (toolsData && toolsData.length > 0) {
      console.log("Sample row:", toolsData[0]);
    } else {
      console.log("Table 'tools' is empty but exists.");
    }
  }

  console.log("Probing 'projects' table...");
  const { data: projectsData, error: projectsError } = await supabase.from("projects").select("*").limit(1);
  
  if (projectsError) {
    console.log("Error querying 'projects':", projectsError);
  } else {
    console.log("Found 'projects' table. Rows:", projectsData?.length);
    if (projectsData && projectsData.length > 0) {
      console.log("Sample row:", projectsData[0]);
    }
  }
}

run();
