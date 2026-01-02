import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MetricDefinition = {
  type: "count" | "sum";
  field?: string;
  groupBy?: "day";
  filters?: Record<string, unknown>;
};

export type Metric = {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  integrationId: string;
  capabilityId: string;
  resource: string;
  definition: MetricDefinition;
  version: number;
};

export async function createMetric(
  orgId: string,
  input: Omit<Metric, "id" | "orgId" | "version">
): Promise<Metric> {
  const supabase = await createSupabaseServerClient();

  // @ts-ignore: Supabase types not yet updated
  const { data, error } = await (supabase
    .from("metrics") as any)
    .insert({
      org_id: orgId,
      name: input.name,
      description: input.description,
      integration_id: input.integrationId,
      capability_id: input.capabilityId,
      resource: input.resource,
      definition: JSON.stringify(input.definition),
      version: 1,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create metric: ${error.message}`);
  }

  return mapRowToMetric(data);
}

export async function getMetric(id: string): Promise<Metric | null> {
  const supabase = await createSupabaseServerClient();
  // @ts-ignore
  const { data, error } = await (supabase.from("metrics") as any)
    .select()
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapRowToMetric(data);
}

export async function findMetrics(orgId: string): Promise<Metric[]> {
  const supabase = await createSupabaseServerClient();
  // @ts-ignore
  const { data, error } = await (supabase.from("metrics") as any)
    .select()
    .eq("org_id", orgId)
    .order("name");

  if (error || !data) return [];
  return data.map(mapRowToMetric);
}

function mapRowToMetric(row: any): Metric {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    integrationId: row.integration_id,
    capabilityId: row.capability_id,
    resource: row.resource,
    definition: typeof row.definition === "string" ? JSON.parse(row.definition) : row.definition,
    version: row.version,
  };
}
