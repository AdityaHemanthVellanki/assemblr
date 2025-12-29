import "server-only";

import { AzureOpenAI } from "openai";

import { getServerEnv } from "@/lib/env";

export function createAzureOpenAIClient() {
  const env = getServerEnv();

  if (!env.AZURE_OPENAI_ENDPOINT) {
    throw new Error("Missing AZURE_OPENAI_ENDPOINT");
  }
  if (!env.AZURE_OPENAI_API_KEY) {
    throw new Error("Missing AZURE_OPENAI_API_KEY");
  }
  if (!env.AZURE_OPENAI_DEPLOYMENT_NAME) {
    throw new Error("Missing AZURE_OPENAI_DEPLOYMENT_NAME");
  }

  const endpoint = env.AZURE_OPENAI_ENDPOINT.replace(/\/+$/, "");
  const deployment = env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const apiVersion = env.AZURE_OPENAI_API_VERSION;

  return new AzureOpenAI({
    apiKey: env.AZURE_OPENAI_API_KEY,
    apiVersion,
    baseURL: `${endpoint}/openai/deployments/${deployment}`,
    maxRetries: 0,
    timeout: 20_000,
  });
}
