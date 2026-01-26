import "server-only";

import { z } from "zod";

import { getAzureOpenAIClient } from "@/lib/ai/azureOpenAI";
import { getServerEnv } from "@/lib/env";
import { INTEGRATIONS, type Capability } from "@/lib/integrations/capabilities";
import { getExtractCapabilitiesPrompt } from "@/lib/ai/prompts";

export type CapabilityExtraction = {
  required_capabilities: Capability[];
  optional_capabilities?: Capability[];
  needs_real_time: boolean;
  ambiguity_questions?: string[];
};

const capabilityEnum = z.enum([
  "tabular_data",
  "time_series",
  "payment_transactions",
  "subscription_events",
  "user_identity",
  "crm_leads",
  "event_tracking",
  "file_ingest",
  "api_fetch",
  "messaging",
  "workflow_action",
]);

const extractionSchema = z.object({
  required_capabilities: z.array(capabilityEnum),
  optional_capabilities: z.array(capabilityEnum).optional(),
  needs_real_time: z.boolean(),
  ambiguity_questions: z.array(z.string().min(1)).optional(),
});

function containsVendorReference(text: string) {
  const lower = text.toLowerCase();
  for (const integration of INTEGRATIONS) {
    if (lower.includes(integration.id.toLowerCase())) return true;
    if (lower.includes(integration.name.toLowerCase())) return true;
  }
  return false;
}

function validateNoVendors(extraction: CapabilityExtraction) {
  const questions = extraction.ambiguity_questions;
  if (!questions) return;
  for (const q of questions) {
    if (containsVendorReference(q)) {
      throw new Error("AI returned invalid output");
    }
  }
}

export async function extractCapabilities(prompt: string): Promise<CapabilityExtraction> {
  getServerEnv();

  let response;
  try {
    response = await getAzureOpenAIClient().chat.completions.create({
      model: getServerEnv().AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [
        { role: "system", content: getExtractCapabilitiesPrompt(capabilityEnum.options).trim() },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      max_tokens: 1200,
      response_format: { type: "json_object" },
    });
  } catch (err) {
    console.error("Azure OpenAI error", err);
    throw new Error("AI service unavailable");
  }

  const content = response.choices[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error("AI service unavailable");
  }

  // Strict JSON validation
  if (!content.trim().startsWith("{")) {
    console.error("AI returned non-JSON response (parsed)", { content });
    throw new Error("AI returned non-JSON response");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    console.error("AI returned invalid response", { content, err });
    throw new Error("AI returned invalid JSON");
  }

  const extraction = extractionSchema.parse(parsed) as CapabilityExtraction;
  validateNoVendors(extraction);
  return extraction;
}
