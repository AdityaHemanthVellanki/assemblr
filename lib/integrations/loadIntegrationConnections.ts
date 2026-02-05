type IntegrationConnectionRow = { integration_id: string };

type IntegrationConnectionsQuery = {
  from: (table: "integration_connections") => {
    select: (columns: "integration_id") => {
      eq: (column: string, value: string) => any;
    };
  };
};

export async function loadIntegrationConnections(input: {
  supabase: unknown;
  orgId: string;
}) {
  const supabase = input.supabase as IntegrationConnectionsQuery;

  // First, log all connections for this org to debug status issues
  const { data: allConnections } = await (supabase as any)
    .from("integration_connections")
    .select("integration_id, status")
    .eq("org_id", input.orgId);
  console.log(`[loadIntegrationConnections] All connections for org ${input.orgId}:`,
    allConnections?.map((c: any) => `${c.integration_id}:${c.status}`).join(', ') || 'NONE');

  // Query connections that are usable for tool execution
  // 'schema_failed' connections still have valid tokens and can be used
  const { data, error } = await (supabase as any)
    .from("integration_connections")
    .select("integration_id")
    .eq("org_id", input.orgId)
    .in("status", ["active", "schema_failed"]);

  if (error) {
    console.error("Failed to load integration connections", error);
    throw error;
  }

  if (!data) {
    throw new Error("integration_connections returned null data");
  }

  if (!Array.isArray(data)) {
    throw new Error("integration_connections returned invalid data");
  }

  const out: IntegrationConnectionRow[] = [];
  for (const row of data) {
    const r = row as Record<string, unknown>;
    const integrationId = r.integration_id;
    if (typeof integrationId !== "string") {
      throw new Error("integration_connections returned invalid data");
    }
    out.push({ integration_id: integrationId });
  }

  return out;
}
