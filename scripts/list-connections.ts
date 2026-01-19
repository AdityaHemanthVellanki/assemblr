
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

async function listConnections() {
  const admin = createSupabaseAdminClient();
  const orgId = "0a71e770-05f1-46de-8696-8b3e786129ca"; 

  const { data: connections } = await admin
    .from("integration_connections")
    .select("integration_id")
    .eq("org_id", orgId);

  console.log("Connections:", connections);
}

listConnections().catch(console.error);
