"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrgMember } from "@/lib/permissions";
import { z } from "zod";

const resumeContextSchema = z.object({
  projectId: z.string().optional(),
  chatId: z.string().optional(),
  toolId: z.string().optional(),
  executionId: z.string().optional(),
  originalPrompt: z.string().optional(),
  pendingIntegrations: z.array(z.string()).optional(),
  blockedIntegration: z.string().optional(),
  orchestrationState: z.any().optional(),
  returnPath: z.string(),
});

export type ResumeContextData = z.infer<typeof resumeContextSchema>;

export async function saveResumeContext(data: ResumeContextData) {
  const { ctx } = await requireOrgMember();
  const supabase = await createSupabaseServerClient();

  // Validate input
  const parsed = resumeContextSchema.parse(data);

  const { data: inserted, error } = await supabase
    .from("oauth_resume_contexts")
    .insert({
      user_id: ctx.userId,
      org_id: ctx.orgId,
      project_id: parsed.projectId,
      chat_id: parsed.chatId,
      tool_id: parsed.toolId,
      execution_id: parsed.executionId,
      original_prompt: parsed.originalPrompt,
      pending_integrations: parsed.pendingIntegrations,
      blocked_integration: parsed.blockedIntegration,
      orchestration_state: parsed.orchestrationState,
      return_path: parsed.returnPath,
    })
    .select("id")
    .single();

  if (error) {
    console.error(`[OAuth Error] Failed to save resume context: ${error.message}`, error);
    throw new Error(`Failed to save resume context: ${error.message}`);
  }

  if (!inserted?.id) {
    console.error("[OAuth Error] Resume context saved but no ID returned.");
    throw new Error("Failed to retrieve resume context ID.");
  }

  console.log(`[OAuth Persistence] Resume Context Saved. ID: ${inserted.id} Path: ${parsed.returnPath}`);
  return inserted.id;
}

export async function getResumeContext(id: string) {
  const { ctx } = await requireOrgMember();
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase
    .from("oauth_resume_contexts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return null;
  }

  // Verify ownership
  if (data.user_id !== ctx.userId) {
    console.error("Resume context ownership mismatch");
    return null;
  }

  // Verify expiration
  if (new Date(data.expires_at) < new Date()) {
    console.warn("Resume context expired");
    return null;
  }

  const row = data as any;
  return {
    id: row.id,
    orgId: row.org_id,
    userId: row.user_id,
    projectId: row.project_id,
    chatId: row.chat_id,
    toolId: row.tool_id,
    executionId: row.execution_id,
    originalPrompt: row.original_prompt,
    pendingIntegrations: row.pending_integrations,
    blockedIntegration: row.blocked_integration,
    orchestrationState: row.orchestration_state,
    returnPath: row.return_path,
  };
}

export async function startOAuthFlow(payload: {
  providerId: string;
  projectId?: string;
  chatId?: string;
  toolId?: string;
  executionId?: string;
  currentPath: string;
  prompt?: string;
  integrationMode: "auto" | "manual";
  pendingIntegrations?: string[];
  blockedIntegration?: string;
  connectionParams?: Record<string, any>;
  forceNew?: boolean;
  label?: string;
}) {
  const {
    providerId,
    projectId,
    chatId,
    toolId,
    executionId,
    currentPath,
    prompt,
    integrationMode,
    pendingIntegrations,
    blockedIntegration,
    connectionParams,
    forceNew,
    label
  } = payload;

  // 1. Create Resume Context
  console.log(`[OAuth Start] Saving resume context for provider ${providerId} (Tool: ${toolId}, Path: ${currentPath})`);
  const resumeId = await saveResumeContext({
    projectId,
    chatId,
    toolId,
    executionId,
    returnPath: currentPath,
    originalPrompt: prompt,
    pendingIntegrations,
    blockedIntegration,
    orchestrationState: {
      mode: integrationMode,
      timestamp: Date.now()
    }
  });

  console.log(`[OAuth Start] Resume Context Saved. ID: ${resumeId}`);

  // 2. Construct OAuth URL
  // We point to the start endpoint which handles the redirect logic
  // We pass resumeId so it gets embedded in the state
  const params = new URLSearchParams();
  params.set("provider", providerId);
  params.set("redirectPath", currentPath);
  params.set("resumeId", resumeId);

  if (forceNew) {
    params.set("forceNew", "true");
  }
  if (label) {
    params.set("label", label);
  }

  const startUrl = `/api/oauth/start?${params.toString()}`;
  console.log(`[OAuth Start] Generated Start URL: ${startUrl}`);

  return startUrl;
}
