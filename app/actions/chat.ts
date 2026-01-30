"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processToolChat, resolveIntegrationRequirements, resumeToolExecution, runCompilerPipeline, runToolRuntimePipeline } from "@/lib/ai/tool-chat";
import { isToolSystemSpec, createEmptyToolSpec } from "@/lib/toolos/spec";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { requireOrgMemberOptional } from "@/lib/permissions";
import { resolveBuildContext } from "@/lib/toolos/build-context";
import { PROJECT_STATUSES } from "@/lib/core/constants";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { computePromptHash, createExecution, findExecutionByPromptHash, getExecutionById, updateExecution } from "@/lib/toolos/executions";

export async function sendChatMessage(
  toolId: string | undefined,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }>,
  currentSpec: unknown | null,
  requiredIntegrations?: string[],
  integrationMode?: "auto" | "manual",
  selectedIntegrationIds?: string[],
  options?: { forceRetry?: boolean }
) {
  // 1. Authenticate User
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }
  const userId = user.id;

  let effectiveToolId = toolId;
  let effectiveSpec = currentSpec;
  let orgId: string;

  // 2. Resolve Context & Create Tool (if needed)
  if (!effectiveToolId) {
    // Creation Flow: Use resolveBuildContext to guarantee Org exists
    try {
      // Auto-resolve org (creates one if missing)
      const buildContext = await resolveBuildContext(userId);
      orgId = buildContext.orgId;
      
      console.log("[ToolCreation] Context Resolved:", { orgId, userId });

      // CRITICAL: Use Admin Client for atomic creation
      const adminSupabase = createSupabaseAdminClient();
      
      const payload = {
          org_id: orgId,
          name: "New Tool",
          status: "DRAFT",
          spec: createEmptyToolSpec()
      };
      
      // FAIL-FAST GUARD
      if (!PROJECT_STATUSES.includes(payload.status as any)) {
        throw new Error(`Invalid project status: ${payload.status}`);
      }

      const { data: newProjects, error } = await adminSupabase
        .from("projects")
        .insert(payload)
        .select("id");
      
      // FIX: Safe retrieval of ID
      const newProject = newProjects && newProjects.length > 0 ? newProjects[0] : null;

      if (error || !newProject) {
          console.error("[ToolCreation] DB INSERT FAILED", {
              code: error?.code,
              message: error?.message,
              details: error?.details,
              hint: error?.hint,
              payload
          });
          throw new Error(`Failed to create project: ${error?.message || "Unknown error"} (Code: ${error?.code})`);
      }
      
      effectiveToolId = newProject.id;
      console.log("[ToolCreation] Success:", effectiveToolId);

    } catch (err) {
      console.error("[ToolCreation] Critical Failure", err);
      return { error: err instanceof Error ? err.message : "Failed to create tool" };
    }
  } else {
    // Load Flow: Verify access
    const { ctx, error } = await requireOrgMemberOptional();
    if (!ctx) return { error: error?.message ?? "Unauthorized" };
    
    // Verify tool ownership/access
    const { data: project, error: loadError } = await supabase
        .from("projects")
        .select("org_id, spec")
        .eq("id", effectiveToolId)
        .single();
        
    if (loadError || !project) {
        return { error: "Project not found or access denied" };
    }
    
    orgId = project.org_id;
    if (!effectiveSpec) effectiveSpec = project.spec as any;
  }

  // 3. Load Connections & Process Chat
  const connections = await loadIntegrationConnections({ supabase, orgId });
  const connectedIntegrationIds = connections.map((c) => c.integration_id);
  const integrationSelection = resolveIntegrationRequirements({
    prompt: message,
    integrationMode,
    selectedIntegrationIds,
    requiredIntegrationIds: requiredIntegrations,
  });
  if (integrationSelection.mismatchMessage) {
    await supabase.from("chat_messages").insert({
      org_id: orgId,
      tool_id: effectiveToolId,
      role: "user",
      content: message,
      metadata: null,
    });
    await supabase.from("chat_messages").insert({
      org_id: orgId,
      tool_id: effectiveToolId,
      role: "assistant",
      content: integrationSelection.mismatchMessage,
      metadata: null,
    });
    return {
      integrationMismatch: true,
      message: integrationSelection.mismatchMessage,
      toolId: effectiveToolId,
    };
  }

  let execution = null;
  let existingExecution = null;
  try {
    const promptHash = computePromptHash(effectiveToolId, message);
    existingExecution = await findExecutionByPromptHash({ toolId: effectiveToolId, promptHash });
  } catch (err: any) {
    return { error: err?.message ?? "Execution persistence failed" };
  }
  if (existingExecution) {
    if (options?.forceRetry) {
       console.log(`[Chat] Forcing retry for execution ${existingExecution.id}`);
       
       // 1. Reset Execution State
       await updateExecution(existingExecution.id, {
         status: "created",
         error: null,
         lockToken: null,
         lockAcquiredAt: null,
         toolVersionId: null,
       });
       
       // 2. Reset Tool State (Archive Active Version)
       // This allows the compiler to run again instead of redirecting to runtime
       const adminSupabase = createSupabaseAdminClient();
       
       // Get current active version to archive it? 
       // For now, just unlinking it from the project is enough to trigger recompilation.
       // The compiler will create a NEW version and promote it.
       await (adminSupabase.from("projects") as any).update({ 
            active_version_id: null,
            status: "DRAFT", // Reset to DRAFT to allow compiler to run
            compiled_at: null // Clear legacy flag too
        }).eq("id", effectiveToolId);

       // Update local reference to fall through to "created" handling below
       existingExecution.status = "created"; 
       execution = existingExecution;
    } else if (existingExecution.status === "created") {
      execution = existingExecution;
    } else {
      if (existingExecution.status === "awaiting_integration") {
        return {
          explanation: "Connect the required integrations to continue.",
          message: { type: "text", content: "Connect the required integrations to continue." },
          requiresIntegrations: true,
          missingIntegrations: existingExecution.missingIntegrations,
          requiredIntegrations: existingExecution.requiredIntegrations,
          metadata: {
            requiresIntegrations: true,
            missingIntegrations: existingExecution.missingIntegrations,
            requiredIntegrations: existingExecution.requiredIntegrations,
            executionId: existingExecution.id,
            status: existingExecution.status,
          },
          toolId: effectiveToolId,
        };
      }
      const statusMessage =
        existingExecution.status === "executing" || existingExecution.status === "compiling"
          ? "Execution already running."
          : "Request already completed.";
      return {
        explanation: statusMessage,
        message: { type: "text", content: statusMessage },
        metadata: { executionId: existingExecution.id, status: existingExecution.status },
        toolId: effectiveToolId,
      };
    }
  }

  const { data: msgRow, error: msgError } = await supabase
    .from("chat_messages")
    .insert({
      org_id: orgId,
      tool_id: effectiveToolId,
      role: "user",
      content: message,
      metadata: null,
    })
    .select("id")
    .single();
  if (msgError || !msgRow) {
    return { error: "Failed to save message" };
  }

  try {
    execution = await createExecution({
      orgId,
      toolId: effectiveToolId,
      chatId: effectiveToolId,
      userId,
      promptId: msgRow.id,
      prompt: message,
    });
  } catch (err: any) {
    return { error: err?.message ?? "Execution persistence failed" };
  }

  // 4. Start Tool Logic (Async)
  const input = {
    toolId: effectiveToolId,
    userMessage: message,
    messages: history,
    currentSpec: effectiveSpec as any,
    orgId,
    userId,
    executionId: execution.id,
    connectedIntegrationIds,
    mode: !toolId ? "create" as const : "runtime" as const,
  };

  let result;
  // FIX: Mode-based Routing via Execution Status
  // Instead of relying blindly on "mode", we check the definitive execution status.
  switch (execution.status) {
    case "created":
      // Only "created" executions go to compiler
      try {
        result = await runCompilerPipeline(input);
      } catch (err: any) {
        console.error("[CompilerPipeline] Critical Failure:", err);
        // User-friendly error reporting instead of 500
        return {
            explanation: "Could not generate a runnable tool from this request.",
            message: { 
                type: "text", 
                content: `I encountered a problem while building your tool.\n\n**Error:** ${err.message}\n\nPlease try again with a more specific request.` 
            },
            metadata: { 
                status: "failed",
                error: true,
                originalError: err.message
            },
            toolId: effectiveToolId
        };
      }
      break;
    case "compiled":
    case "executing":
    case "completed":
    case "failed":
    case "awaiting_integration":
      // "compiled", "executing", or "completed" go to runtime
      try {
        result = await runToolRuntimePipeline(input);
      } catch (err: any) {
        console.error("[RuntimePipeline] Critical Failure:", err);
        return {
            explanation: "Runtime execution failed.",
            message: { 
                type: "text", 
                content: `I encountered a problem while running your tool.\n\n**Error:** ${err.message}` 
            },
            metadata: { 
                status: "failed",
                error: true,
                originalError: err.message
            },
            toolId: effectiveToolId
        };
      }
      break;
    default:
      throw new Error(`Invalid execution status: ${execution.status}`);
  }

  return {
    ...result,
    toolId: effectiveToolId,
    metadata: {
      executionId: execution.id,
      status: execution.status,
      ...result.metadata,
    },
  };
}

export async function resetExecution(executionId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }
  
  const execution = await getExecutionById(executionId);
  if (!execution) {
    return { error: "Execution not found" };
  }
  
  if (execution.userId !== user.id) {
    return { error: "Unauthorized access to execution" };
  }
  
  try {
    await updateExecution(executionId, {
      status: "created",
      error: null,
      lockToken: null,
      lockAcquiredAt: null,
      toolVersionId: null,
    });
    return { success: true };
  } catch (err: any) {
    return { error: err?.message || "Failed to reset execution" };
  }
}

export async function resumeChatExecution(toolId: string, resumeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Unauthorized" };
  }

  const adminSupabase = createSupabaseAdminClient();

  const { data: resumeRow, error: resumeError } = await (adminSupabase.from("oauth_resume_contexts") as any)
    .select("*")
    .eq("id", resumeId)
    .single();

  if (resumeError || !resumeRow) {
    return { error: "Resume context not found" };
  }
  if (resumeRow.user_id !== user.id) {
    return { error: "Unauthorized resume context" };
  }
  if (resumeRow.expires_at && new Date(resumeRow.expires_at) < new Date()) {
    return { error: "Resume context expired" };
  }
  const executionId = resumeRow.execution_id as string | null;
  if (!executionId) {
    return { error: "Execution not found for resume" };
  }

  let execution = null;
  try {
    execution = await getExecutionById(executionId);
  } catch (err: any) {
    return { error: err?.message ?? "Execution persistence failed" };
  }

  if (!execution || execution.status !== "awaiting_integration") {
    return { error: "Execution is not awaiting integration" };
  }

  const { data: projectRow, error: projectError } = await (adminSupabase.from("projects") as any)
    .select("spec, active_version_id")
    .eq("id", toolId)
    .single();
  if (projectError || !projectRow) {
    return { error: "Tool not found" };
  }

  let spec = projectRow.spec;
  let compiledTool = null;
  const versionId = execution.toolVersionId ?? projectRow.active_version_id;
  if (versionId) {
    const { data: versionRow } = await (adminSupabase.from("tool_versions") as any)
      .select("tool_spec, compiled_tool")
      .eq("id", versionId)
      .single();
    if (versionRow?.tool_spec) spec = versionRow.tool_spec;
    if (versionRow?.compiled_tool) compiledTool = versionRow.compiled_tool;
  }
  if (!compiledTool) {
    compiledTool = buildCompiledToolArtifact(spec);
  }

  try {
    const result = await resumeToolExecution({
      executionId,
      orgId: execution.orgId,
      toolId,
      userId: user.id,
      prompt: resumeRow.original_prompt ?? "",
      spec,
      compiledTool,
    });

    await (adminSupabase.from("chat_messages") as any).insert({
      org_id: execution.orgId,
      tool_id: toolId,
      role: "assistant",
      content: result.message.content,
      metadata: result.metadata,
    });

    return result;
  } catch (err: any) {
    return { error: err?.message || "Failed to resume execution" };
  }
}
