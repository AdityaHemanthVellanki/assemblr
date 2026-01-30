// // import "server-only";
import { AzureOpenAI } from "openai";

// --------------------------------------------------------------------------
// CRITICAL CONFIGURATION: AZURE OPENAI API VERSION
// --------------------------------------------------------------------------
// The Azure OpenAI resource for Assemblr
// REQUIRED the API version to be exactly "2024-08-01-preview".
// --------------------------------------------------------------------------
const REQUIRED_API_VERSION = "2024-08-01-preview";

let cachedClient: AzureOpenAI | null = null;

export function getAzureOpenAIClient() {
  if (cachedClient) return cachedClient;

  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;

  // 1. Strict Runtime Assertion (Fail Fast)
  if (apiVersion !== REQUIRED_API_VERSION) {
    const msg = `
  ❌ FATAL ERROR: Invalid Azure OpenAI API Version.
     Current: "${apiVersion}"
     Required: "${REQUIRED_API_VERSION}"
  
     The Azure OpenAI resource requires exactly "${REQUIRED_API_VERSION}".
     Please update your environment variables (e.g. .env).
  `;
    console.error(msg);
    // In Development, we allow the app to start but log the error.
    // In Production, we crash immediately.
    if (process.env.NODE_ENV === "production") {
      throw new Error(msg);
    }
  }

  cachedClient = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT!,
    apiVersion: apiVersion!, // Use the validated env var
    // NOTE: Azure OpenAI deployment name MUST exactly match 
    // the name shown in Azure Portal (case-sensitive).
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
  });

  return cachedClient;
}

/**
 * Diagnoses a 404 error from Azure OpenAI to distinguish between:
 * 1. Deployment does not exist
 * 2. Model does not support chat completions
 * 3. API Version / Endpoint issues
 */
async function diagnose404Error(deploymentName: string) {
    console.log("🔍 Diagnosing 404 Error...");
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/+$/, "");
    let resourceName = "unknown";
    try {
        const u = new URL(endpoint || "");
        resourceName = u.hostname.split(".")[0];
    } catch {
        // ignore
    }

    // IMPORTANT: Azure OpenAI deployments are scoped to a specific resource.
    // A valid deployment name in one resource will NOT exist in another,
    // even if the names are identical.

    // 1. Try to list ALL deployments to help the user find the right one
    // GET /openai/deployments?api-version={api-version}
    const listUrl = `${endpoint}/openai/deployments?api-version=${REQUIRED_API_VERSION}`;
    let availableDeployments: string[] = [];
    
    try {
        const listRes = await fetch(listUrl, {
             headers: { "api-key": process.env.AZURE_OPENAI_API_KEY! }
        });
        if (listRes.ok) {
            const data: any = await listRes.json();
            if (Array.isArray(data.data)) {
                availableDeployments = data.data.map((d: any) => d.id);
            }
        }
    } catch {
        // ignore list failure
    }

    // 2. Check specific deployment
    // GET /openai/deployments/{deployment-id}?api-version={api-version}
    const checkUrl = `${endpoint}/openai/deployments/${deploymentName}?api-version=${REQUIRED_API_VERSION}`;
    
    try {
        // Use global fetch which is available in Node 18+ and Next.js
        const res = await fetch(checkUrl, {
            headers: { "api-key": process.env.AZURE_OPENAI_API_KEY! }
        });

        if (res.status === 404) {
            let msg = `Deployment "${deploymentName}" not found in Azure OpenAI resource "${resourceName}".`;
            if (availableDeployments.length > 0) {
                msg += `\n   👉 Available deployments in this resource: ${availableDeployments.join(", ")}`;
            } else {
                msg += `\n   👉 Could not list available deployments (check permissions or API version).`;
            }
            return msg;
        } else if (res.status === 200) {
            const data: any = await res.json();
            const model = data.model || "unknown";
            // Check capabilities if available, otherwise infer
            return `Deployment model (${model}) does not support chat completions`;
        } else {
             return `Unknown 404 cause. Deployment check returned ${res.status}`;
        }
    } catch (e: any) {
        return `Failed to diagnose: ${e.message}`;
    }
}

export async function validateAzureDeployment(strict: boolean = true) {
  const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME;
  const currentApiVersion = process.env.AZURE_OPENAI_API_VERSION;

  if (!deploymentName) {
    console.error("❌ AZURE_OPENAI_DEPLOYMENT_NAME is missing.");
    process.exit(1);
  }

  // Redundant check, but good for explicit startup logs
  if (currentApiVersion !== REQUIRED_API_VERSION) {
     console.error(`❌ AZURE_OPENAI_API_VERSION mismatch. Got: ${currentApiVersion}, Expected: ${REQUIRED_API_VERSION}`);
     // Fatal in all environments
     process.exit(1);
  }

  // Strict Endpoint Validation
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!endpoint) {
    console.error("❌ AZURE_OPENAI_ENDPOINT is missing.");
    process.exit(1);
  }
  try {
    const u = new URL(endpoint);
    if (u.pathname !== "/" && u.pathname !== "") {
       console.error(`❌ Invalid AZURE_OPENAI_ENDPOINT: Path must be empty, found '${u.pathname}'`);
       console.error("   Endpoint must be: https://<resource>.openai.azure.com");
       process.exit(1);
    }
    if (u.pathname.includes("/openai") || u.pathname.includes("/v1")) {
        console.error("❌ Invalid AZURE_OPENAI_ENDPOINT: Path contains /openai or /v1");
        process.exit(1);
    }
  } catch (e) {
    console.error("❌ Invalid AZURE_OPENAI_ENDPOINT URL");
    process.exit(1);
  }

  // NOTE: Azure OpenAI deployment name MUST exactly match
  // the name shown in Azure Portal (case-sensitive).
  console.log("Azure OpenAI configured:", {
    endpoint,
    deployment: deploymentName,
    apiVersion: currentApiVersion,
  });

  console.log(`🔍 Validating Azure OpenAI Deployment: ${deploymentName} (API Version: ${currentApiVersion})`);

  try {
    // Lightweight test request to verify deployment existence and chat capability
    await getAzureOpenAIClient().chat.completions.create({
      model: deploymentName,
      messages: [{ role: "user", content: "Test" }],
      max_tokens: 1,
    });
    console.log("✅ Azure OpenAI deployment verified successfully.");
  } catch (error: any) {
    console.error("❌ Azure OpenAI validation failed!");
    console.error(`   Deployment: ${deploymentName}`);
    console.error(`   Endpoint: ${endpoint}`);
    console.error(`   API Version: ${REQUIRED_API_VERSION}`);
    
    // Azure returns 404 for chat.completions if:
    // - deployment name is wrong
    // - OR model does not support chat
    if (error.status === 404) {
        const diagnosis = await diagnose404Error(deploymentName);
        console.error(`   👉 DIAGNOSIS: ${diagnosis}`);
        
        // Enhance the error object for callers
        error.message = `${error.message} - ${diagnosis}`;
    } else {
        console.error(`   - Error: ${error.message}`);
    }
    
    // Crash fast as requested
    throw error;
  }
}
