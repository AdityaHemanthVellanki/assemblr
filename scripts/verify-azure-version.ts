
import fs from 'fs';
import path from 'path';

// Load .env.local manually since we are running as a script
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    console.log("Loading environment from .env.local");
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach((line) => {
      // Simple parsing: KEY=VALUE, ignoring comments #
      const commentIndex = line.indexOf('#');
      if (commentIndex !== -1) {
          line = line.substring(0, commentIndex);
      }
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim();
        // Remove surrounding quotes if present
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        if (!process.env[key]) {
            process.env[key] = value;
        }
      }
    });
  } else {
      console.warn("No .env.local file found!");
  }
}

async function main() {
  loadEnv();
  
  const { getAzureOpenAIClient, validateAzureDeployment } = await import("../lib/ai/azureOpenAI");

  console.log("🔍 Verifying Azure OpenAI Configuration...");
  
  try {
    // 1. Run the strict validation from the library
    // This validates Endpoint format, API Version match, and Deployment existence
    // Pass strict=true to ensure script fails if validation fails
    await validateAzureDeployment(true);

    console.log("✅ Configuration Validated.");
    console.log(`   API Version: ${process.env.AZURE_OPENAI_API_VERSION}`);
    console.log(`   Endpoint: ${process.env.AZURE_OPENAI_ENDPOINT}`);
    console.log(`   Deployment: ${process.env.AZURE_OPENAI_DEPLOYMENT_NAME}`);

    // 2. Runtime Client Instantiation
    const azureOpenAIClient = getAzureOpenAIClient();
    // Introspection of _client is removed as it causes build errors.
    // Version is enforced via environment variables in step 1.

    // 3. Live Request
    console.log("🚀 Sending live chat completion request...");
    
    const response = await azureOpenAIClient.chat.completions.create({
      model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
      messages: [{ role: "user", content: "Hello, are you running on 2024-08-01-preview?" }],
      max_tokens: 50,
    });
    
    console.log("✅ Response Received:");
    console.log("   " + response.choices[0].message.content);
    console.log("🎉 SUCCESS: Azure OpenAI is correctly configured with 2024-08-01-preview.");
  } catch (err: any) {
    console.error("❌ Request Failed!");
    console.error(`   Status: ${err.status}`);
    console.error(`   Message: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
    console.error("Unhandled error:", err);
    process.exit(1);
});
