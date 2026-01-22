import { NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/auth/permissions.server";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isCompiledToolArtifact } from "@/lib/toolos/compiler";
import { isToolSystemSpec } from "@/lib/toolos/spec";
import { executeToolAction } from "@/lib/toolos/runtime";
import { renderView } from "@/lib/toolos/view-renderer";
import { loadToolState } from "@/lib/toolos/state-store";
import { loadMemory, MemoryScope } from "@/lib/toolos/memory-store";
import { inferFieldsFromData } from "@/lib/toolos/schema/infer";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx } = await requireOrgMember();
    // Use Admin Client for execution to ensure access to all needed data
    const supabase = createSupabaseAdminClient();

    const { data: project, error } = await (supabase.from("projects") as any)
      .select("spec, active_version_id")
      .eq("id", toolId)
      .eq("org_id", ctx.orgId)
      .single();

    if (error || !project?.spec) {
      return errorResponse("Tool not found", 404);
    }

    // ENFORCEMENT: Tool must be activated
    // REMOVED: We allow execution to proceed to enable self-healing and data viewing
    // const isActivated = (project.spec as any)?.is_activated;
    // if (!isActivated) {
    //   return errorResponse("Tool not activated yet", 409);
    // }

    let spec = project.spec;
    let compiledTool: unknown = null;
    if (project.active_version_id) {
      const { data: version } = await (supabase.from("tool_versions") as any)
        .select("tool_spec, compiled_tool")
        .eq("id", project.active_version_id)
        .single();
      spec = version?.tool_spec ?? spec;
      compiledTool = version?.compiled_tool ?? null;
    }

    if (!isToolSystemSpec(spec)) {
      return errorResponse("Invalid tool spec", 422);
    }

    const body = await req.json().catch(() => ({}));
    const actionId = typeof body?.actionId === "string" ? body.actionId : null;
    const viewId = typeof body?.viewId === "string" ? body.viewId : null;
    const input = body?.input && typeof body.input === "object" ? body.input : {};

    const scope: MemoryScope = { type: "tool_org", toolId, orgId: ctx.orgId };
    const evidence = await loadMemory({
      scope,
      namespace: "tool_builder",
      key: "data_evidence",
    });

    // Action Execution
    if (actionId) {
      if (!isCompiledToolArtifact(compiledTool)) {
        return errorResponse("Compiled tool artifact missing", 500);
      }
      const result = await executeToolAction({
        orgId: ctx.orgId,
        toolId,
        compiledTool,
        actionId,
        input,
        userId: ctx.userId,
      });
      if (viewId) {
        const view = renderView(spec, result.state, viewId);
        return jsonResponse({
          view,
          state: result.state,
          events: result.events,
          evidence: evidence ?? null,
        });
      }
      return jsonResponse({
        state: result.state,
        output: result.output,
        events: result.events,
        evidence: evidence ?? null,
      });
    }

    // View Rendering (Read Only)
    // FIX: Merge persisted data cache into state so views can render
    // This connects the "runtime success" (persisted data) to the "view renderer" (UI)
    const state = await loadToolState(toolId, ctx.orgId);
    
    // Load cached data for all READ actions
    if (spec && spec.actions) {
      const readActions = spec.actions.filter((a) => a.type === "READ");
      await Promise.all(readActions.map(async (action) => {
        try {
           const cached = await loadMemory({
             scope,
             namespace: "data_cache",
             key: action.id
           });
           if (cached && (cached as any).data) {
             // Merge into state if not already present
             // We prioritize existing state (if updated by reducer) but fall back to cache
             if (state[action.id] === undefined) {
               state[action.id] = (cached as any).data;
             }
           }
        } catch (e) {
          // Ignore cache misses
        }
      }));
     }

     // FIX: Self-healing Schema Inference & Auto-Activation
      // If we have data but no schema fields, infer them now and save to DB
      let schemaUpdated = false;
      let shouldActivate = !(project.spec as any)?.is_activated;
      let hasData = false;

      if (spec && spec.entities) {
        for (const entity of spec.entities) {
           // Find data for this entity (via sourceIntegration usually)
           // Heuristic: Check if any action for this integration has data in state
           const integrationId = entity.sourceIntegration;
           if (!integrationId) continue;
           
           const action = spec.actions.find(a => a.integrationId === integrationId && a.type === "READ");
           if (!action) continue;
           
           const data = state[action.id];
           if (data) {
              hasData = true;
              if (entity.fields.length === 0) {
                 const inferred = inferFieldsFromData(data);
                 if (inferred.length > 0) {
                    entity.fields = inferred;
                    schemaUpdated = true;
                    console.log(`[SelfHealing] Inferred schema for ${entity.name} from persisted data.`);
                 }
              }
           }
        }
      }
      
      // Only auto-activate if we actually found data
      if (shouldActivate && !hasData) {
         shouldActivate = false;
      }
      
      if (schemaUpdated || shouldActivate) {
         if (shouldActivate) {
             (spec as any).is_activated = true;
             (spec as any).status = "active";
             console.log(`[SelfHealing] Auto-activating tool ${toolId}`);
         }

         // Save back to DB to persist the fix
         // We update project spec and active version if exists
         try {
            await (supabase.from("projects") as any).update({ 
                spec,
                is_activated: (spec as any).is_activated 
            }).eq("id", toolId);
            
            if (project.active_version_id) {
               await (supabase.from("tool_versions") as any)
                 .update({ tool_spec: spec })
                 .eq("id", project.active_version_id);
            }
            console.log(`[SelfHealing] Persisted updates for tool ${toolId}`);
         } catch (err) {
            console.error("[SelfHealing] Failed to persist updates:", err);
         }
      }
 
      if (viewId) {
      const view = renderView(spec, state, viewId);
      return jsonResponse({ view, state, evidence: evidence ?? null });
    }

    return jsonResponse({ state, evidence: evidence ?? null });
  } catch (e) {
    return handleApiError(e);
  }
}
