"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requireOrgMember } from "@/lib/permissions";
import { z } from "zod";

const resumeContextSchema = z.object({
  projectId: z.string().optional(),
  chatId: z.string().optional(),
  toolId: z.string().optional(),
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
      original_prompt: parsed.originalPrompt,
      pending_integrations: parsed.pendingIntegrations,
      blocked_integration: parsed.blockedIntegration,
      orchestration_state: parsed.orchestrationState,
      return_path: parsed.returnPath,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to save resume context", error);
    throw new Error("Failed to save resume context");
  }

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

  return {
    id: data.id,
    projectId: data.project_id,
    chatId: data.chat_id,
    toolId: data.tool_id,
    originalPrompt: data.original_prompt,
    pendingIntegrations: data.pending_integrations,
    blockedIntegration: data.blocked_integration,
    orchestrationState: data.orchestration_state,
    returnPath: data.return_path,
  };
}

export async function startOAuthFlow(payload: {
  providerId: string;
  projectId?: string;
  chatId?: string;
  toolId?: string;
  currentPath: string;
  prompt?: string;
  integrationMode: "auto" | "manual";
  pendingIntegrations?: string[];
  blockedIntegration?: string;
}) {
  const { 
    providerId, 
    projectId, 
    chatId, 
    toolId, 
    currentPath, 
    prompt, 
    integrationMode,
    pendingIntegrations,
    blockedIntegration
  } = payload;

  // 1. Create Resume Context
  const resumeId = await saveResumeContext({
    projectId,
    chatId,
    toolId,
    returnPath: currentPath,
    originalPrompt: prompt,
    pendingIntegrations,
    blockedIntegration,
    orchestrationState: {
      mode: integrationMode,
      timestamp: Date.now()
    }
  });

  // 2. Construct OAuth URL
  // We point to the start endpoint which handles the redirect logic
  // We pass resumeId so it gets embedded in the state
  const params = new URLSearchParams();
  params.set("provider", providerId);
  params.set("redirectPath", currentPath);
  params.set("resumeId", resumeId);

  return `/api/oauth/start?${params.toString()}`;
}
