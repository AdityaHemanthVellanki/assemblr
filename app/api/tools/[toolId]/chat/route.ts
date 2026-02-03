import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { processToolChat, resumeToolExecution, maybeAutoRenameChat } from "@/lib/ai/tool-chat";
import { loadIntegrationConnections } from "@/lib/integrations/loadIntegrationConnections";
import { requireOrgMemberOptional, requireProjectOrgAccess } from "@/lib/permissions";
import { buildCompiledToolArtifact } from "@/lib/toolos/compiler";
import { computePromptHash, createExecution, findExecutionByPromptHash, getExecutionById, updateExecution } from "@/lib/toolos/executions";
// import { createSupabaseServerClient } from "@/lib/supabase/server";
import { jsonResponse, errorResponse, handleApiError } from "@/lib/api/response";
import { isIntegrationNotConnectedError } from "@/lib/errors/integration-errors";

export const dynamic = "force-dynamic";

const chatSchema = z.object({
  message: z.string().optional(),
  resumeId: z.string().optional(),
  mode: z.enum(["create", "modify", "chat"]).default("chat"),
  integrationMode: z.enum(["auto", "manual"]).optional(),
  selectedIntegrationIds: z.array(z.string()).optional(),
}).refine((data) => Boolean(data.message || data.resumeId), {
  message: "Message or resumeId is required",
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ toolId: string }> },
) {
  try {
    const { toolId } = await params;
    const { ctx, requiresAuth, error } = await requireOrgMemberOptional();
    if (requiresAuth) {
      return errorResponse("Session expired — reauth required", 401, { requiresAuth: true });
    }
    if (!ctx) {
      return errorResponse(error?.message ?? "Unauthorized", error?.status ?? 401);
    }
    await requireProjectOrgAccess(ctx, toolId);

    const json = await req.json().catch(() => ({}));
    const parsed = chatSchema.safeParse(json);
    if (!parsed.success) {
      return errorResponse("Invalid body", 400);
    }
    const { message: userMessage, mode, integrationMode, selectedIntegrationIds, resumeId } = parsed.data;

    // Use Admin Client to ensure robust tool execution/updates without cookie/RLS issues
    const supabase = createSupabaseAdminClient();

    if (resumeId) {
      const { data: resumeRow, error: resumeError } = await (supabase.from("oauth_resume_contexts") as any)
        .select("*")
        .eq("id", resumeId)
        .single();
      if (resumeError || !resumeRow) {
        return errorResponse("Resume context not found", 404);
      }
      if (resumeRow.user_id !== ctx.userId) {
        return errorResponse("Unauthorized resume context", 403);
      }
      if (resumeRow.expires_at && new Date(resumeRow.expires_at) < new Date()) {
        return errorResponse("Resume context expired", 410);
      }
      const executionId = resumeRow.execution_id as string | null;
      if (!executionId) {
        return errorResponse("Execution not found for resume", 404);
      }
      let execution = null;
      try {
        execution = await getExecutionById(executionId);
      } catch (err: any) {
        const message = err?.message ?? "Execution persistence failed";
        return jsonResponse({
          explanation: message,
          message: { type: "text", content: message },
          metadata: { stage: "execution_persistence", error: message },
        });
      }
      if (!execution || execution.status !== "awaiting_integration") {
        return errorResponse("Execution is not awaiting integration", 409);
      }

      const { data: projectRow, error: projectError } = await (supabase.from("projects") as any)
        .select("spec, active_version_id")
        .eq("id", toolId)
        .single();
      if (projectError || !projectRow) {
        return errorResponse("Tool not found", 404);
      }

      let spec = projectRow.spec;
      let compiledTool = null;
      const versionId = execution.toolVersionId ?? projectRow.active_version_id;
      if (versionId) {
        const { data: versionRow } = await (supabase.from("tool_versions") as any)
          .select("tool_spec, compiled_tool")
          .eq("id", versionId)
          .single();
        if (versionRow?.tool_spec) spec = versionRow.tool_spec;
        if (versionRow?.compiled_tool) compiledTool = versionRow.compiled_tool;
      }
      if (!compiledTool) {
        compiledTool = buildCompiledToolArtifact(spec);
      }

      let result;
      try {
        result = await resumeToolExecution({
          executionId,
          orgId: ctx.orgId,
          toolId,
          userId: ctx.userId,
          prompt: resumeRow.original_prompt ?? "",
          spec,
          compiledTool,
        });
      } catch (err: any) {
        if (isIntegrationNotConnectedError(err)) {
          const missingIntegrations = err.integrationIds;
          const requiredIntegrations = missingIntegrations;

          // Mark execution as waiting, NOT failed
          await updateExecution(executionId, {
            status: "awaiting_integration",
            requiredIntegrations,
            missingIntegrations,
          });

          return jsonResponse({
            message: { type: "text", content: `Please connect the following integrations to continue: ${missingIntegrations.join(", ")}.` },
            metadata: {
              requiresIntegrations: true,
              missingIntegrations,
              requiredIntegrations,
              executionId: execution.id,
              status: "awaiting_integration",
              integration_error: {
                  type: "INTEGRATION_NOT_CONNECTED",
                  integrationIds: err.integrationIds,
                  requiredBy: err.requiredBy,
                  blockingActions: err.blockingActions
              },
              prompt: resumeRow.original_prompt
            },
            toolId,
          });
        }
        throw err;
      }

      await (supabase.from("chat_messages") as any).insert({
        org_id: ctx.orgId,
        tool_id: toolId,
        role: "assistant",
        content: result.message.content,
        metadata: result.metadata,
      });

      return jsonResponse(result);
    }

    if (!userMessage) {
      return errorResponse("Message is required", 400);
    }

    let execution: any = null;
    let existingExecution = null;
    try {
      const promptHash = computePromptHash(toolId, userMessage);
      existingExecution = await findExecutionByPromptHash({ toolId, promptHash });
    } catch (err: any) {
      const message = err?.message ?? "Execution persistence failed";
      return jsonResponse({
        explanation: message,
        message: { type: "text", content: message },
        metadata: { stage: "execution_persistence", error: message },
      });
    }
    if (existingExecution) {
      if (existingExecution.status === "created") {
        execution = existingExecution;
      } else {
        if (existingExecution.status === "awaiting_integration") {
          return jsonResponse({
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
          });
        }
        const statusMessage =
          existingExecution.status === "executing" || existingExecution.status === "compiling"
            ? "Execution already running."
            : "Request already completed.";
        return jsonResponse({
          explanation: statusMessage,
          message: { type: "text", content: statusMessage },
          metadata: { executionId: existingExecution.id, status: existingExecution.status },
        });
      }
    }

    let chatTitle: string | null = null;
    if (!execution) {
      const { data: msgRow, error: msgError } = await (supabase.from("chat_messages") as any)
        .insert({
          org_id: ctx.orgId,
          tool_id: toolId,
          role: "user",
          content: userMessage,
        })
        .select("id")
        .single();
      if (msgError || !msgRow) {
        console.error("Failed to save message", msgError);
        return errorResponse("Failed to save message", 500);
      }
      try {
        chatTitle = await maybeAutoRenameChat({
          supabase,
          toolId,
          orgId: ctx.orgId,
          firstUserMessage: userMessage,
        });
      } catch {}

      try {
        execution = await createExecution({
          orgId: ctx.orgId,
          toolId,
          chatId: toolId,
          userId: ctx.userId,
          promptId: msgRow.id,
          prompt: userMessage,
        });
      } catch (err: any) {
        const message = err?.message ?? "Execution persistence failed";
        return jsonResponse({
          explanation: message,
          message: { type: "text", content: message },
          metadata: { stage: "execution_persistence", error: message },
        });
      }
    }

    const [toolRes, historyRes, connections] = await Promise.all([
      supabase.from("projects").select("spec").eq("id", toolId).single(),
      supabase
        .from("chat_messages")
        .select("role, content, metadata")
        .eq("tool_id", toolId)
        .order("created_at", { ascending: false })
        .limit(20),
      loadIntegrationConnections({ supabase, orgId: ctx.orgId }),
    ]);

    if (toolRes.error || !toolRes.data) {
      throw new Error("Failed to load tool spec");
    }
    if (historyRes.error) {
      console.error("Failed to load chat history", historyRes.error);
      return errorResponse("Failed to load chat history", 500);
    }

    const currentSpec = toolRes.data.spec ?? {};
    if (!historyRes.data) {
      throw new Error("chat_messages returned null data");
    }

    const history = historyRes.data
      .reverse()
      .map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const connectedIntegrationIds = connections.map((c: { integration_id: string }) => c.integration_id);

    const result = await processToolChat({
      orgId: ctx.orgId,
      toolId,
      userId: ctx.userId,
      currentSpec,
      messages: history,
      userMessage,
      connectedIntegrationIds,
      mode,
      integrationMode,
      selectedIntegrationIds,
      executionId: execution.id,
    });

    if (chatTitle) {
      result.metadata = { ...(result.metadata ?? {}), chatTitle };
    }

    if (mode === "create" && (result.metadata as any)?.persist === true) {
      const { error: updateError } = await supabase
        .from("projects")
        .update({ spec: result.spec as any, active_version_id: (result.metadata as any)?.active_version_id ?? null })
        .eq("id", toolId);
      if (updateError) {
        console.error("Failed to update tool spec", updateError);
        return errorResponse("Failed to save tool updates", 500);
      }
    }

    // Save Assistant Message
    await (supabase.from("chat_messages") as any).insert({
      org_id: ctx.orgId,
      tool_id: toolId,
      role: "assistant",
      content: result.message.content,
      metadata: result.metadata,
    });

    return jsonResponse(result);
  } catch (e) {
    return handleApiError(e);
  }
}
