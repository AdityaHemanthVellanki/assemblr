type IntegrationConnectionRow = { integration_id: string };

type IntegrationConnectionsQuery = {
  from: (table: "integration_connections") => {
    select: (columns: "integration_id") => {
      eq: (
        column: "org_id",
        value: string,
      ) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

export async function loadIntegrationConnections(input: {
  supabase: unknown;
  orgId: string;
}) {
  const supabase = input.supabase as IntegrationConnectionsQuery;
  const { data, error } = await supabase
    .from("integration_connections")
    .select("integration_id")
    .eq("org_id", input.orgId);

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
