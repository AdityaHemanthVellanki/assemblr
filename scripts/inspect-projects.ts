
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SECRET_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error("Missing env vars:", { supabaseUrl: !!supabaseUrl, supabaseServiceKey: !!supabaseServiceKey });
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function inspectSchema() {
  console.log("Inspecting 'projects' table columns...");
  // We can't query information_schema via the JS client easily unless we have a function for it or use rpc.
  // But we can try to select * from projects limit 1 and see the keys, 
  // OR we can just try to insert a dummy row with owner_id and see if it fails (which we know it does).
  
  // A better way is to use the `pg_meta` if available, or just rely on the error message which is already quite explicit.
  // "Could not find the 'owner_id' column of 'projects' in the schema cache"
  
  // Let's try to fetch one row and print keys.
  const { data: projects, error: projectsError } = await supabase.from('projects').select('*').limit(1);
  if (projectsError) {
    console.error("Error fetching projects:", projectsError);
  } else if (projects && projects.length > 0) {
    console.log("Projects columns:", Object.keys(projects[0]));
  } else {
    console.log("No projects found, trying to infer from error or assuming empty table means columns exist?");
    // If empty, we can't see columns via select *.
  }

  console.log("Inspecting 'tool_versions' table columns...");
  const { data: versions, error: versionsError } = await supabase.from('tool_versions').select('*').limit(1);
  if (versionsError) {
    console.error("Error fetching tool_versions:", versionsError);
  } else if (versions && versions.length > 0) {
    console.log("ToolVersions columns:", Object.keys(versions[0]));
  } else {
    console.log("No versions found.");
  }
}

inspectSchema();
