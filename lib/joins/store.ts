// import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export type JoinDefinition = {
  id: string;
  orgId: string;
  name: string;
  leftIntegrationId: string;
  leftResource: string;
  leftField: string;
  rightIntegrationId: string;
  rightResource: string;
  rightField: string;
  joinType: "inner" | "left" | "right";
  confidence: "explicit" | "inferred" | "user_confirmed";
};

export async function createJoinDefinition(input: Omit<JoinDefinition, "id">): Promise<JoinDefinition> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("join_definitions") as any)
    .insert({
      org_id: input.orgId,
      name: input.name,
      left_integration_id: input.leftIntegrationId,
      left_resource: input.leftResource,
      left_field: input.leftField,
      right_integration_id: input.rightIntegrationId,
      right_resource: input.rightResource,
      right_field: input.rightField,
      join_type: input.joinType,
      confidence: input.confidence,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create join definition: ${error.message}`);
  return mapRowToJoin(data);
}

export async function getJoinDefinition(id: string): Promise<JoinDefinition | null> {
  const supabase = await createSupabaseServerClient();
  
  // @ts-ignore
  const { data, error } = await (supabase.from("join_definitions") as any)
    .select()
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return mapRowToJoin(data);
}

function mapRowToJoin(row: any): JoinDefinition {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    leftIntegrationId: row.left_integration_id,
    leftResource: row.left_resource,
    leftField: row.left_field,
    rightIntegrationId: row.right_integration_id,
    rightResource: row.right_resource,
    rightField: row.right_field,
    joinType: row.join_type,
    confidence: row.confidence,
  };
}
