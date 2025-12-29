import "server-only";

import OpenAI from "openai";

export const azureOpenAIClient = new OpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  baseURL: `${process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/+$/, "")}/openai/deployments/${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`,
  defaultQuery: {
    "api-version": process.env.AZURE_OPENAI_API_VERSION!,
  },
  defaultHeaders: {
    "api-key": process.env.AZURE_OPENAI_API_KEY!,
  },
});
