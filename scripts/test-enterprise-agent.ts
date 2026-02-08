
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { AzureOpenAI } from "openai";
import { OpenAIToolSet } from "composio-core";

const openai = new AzureOpenAI({
    apiKey: process.env.AZURE_OPENAI_API_KEY,
    endpoint: process.env.AZURE_OPENAI_ENDPOINT,
    apiVersion: process.env.AZURE_OPENAI_API_VERSION,
    deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
});

const toolset = new OpenAIToolSet({
    apiKey: process.env.COMPOSIO_API_KEY,
    entityId: "assemblr_org_test-org-123"
});

async function main() {
    console.log("🤖 Starting Enterprise Agent (Active Apps Target)...");

    const ACTIONS = [
        // GitHub
        "GITHUB_CREATE_ISSUE", "GITHUB_GET_REPO",
        // Slack
        "SLACK_CHAT_POST_MESSAGE", "SLACK_USERS_LIST",
        // Linear
        "LINEAR_CREATE_LINEAR_ISSUE", "LINEAR_LIST_LINEAR_TEAMS", "LINEAR_CREATE_LINEAR_COMMENT",
        // HubSpot
        "HUBSPOT_CREATE_CONTACT", "HUBSPOT_GET_CONTACT"
    ];

    // Get tools for these specific actions
    const tools = await toolset.getTools({ actions: ACTIONS });
    console.log(`Loading ${tools.length} tools...`);

    const instruction = `
    You are an Enterprise Integration Assistant.
    Your goal is to validate the ACTIVE connections by creating Seed Data.
    
    1. **GitHub**: Create an issue in "assemblr-seed" (or any available repo) titled "Agentic Verification".
    2. **Slack**: Send a message to "general" (or any channel) saying "Agentic Verification Successful".
    3. **Linear**: Create an issue titled "Verify Agent Capabilities" in the first team you encounter.
    4. **HubSpot**: Create a contact "Agentic User" (email: agent@assemblr.ai).

    If any action fails (e.g. NO_CONNECTED_ACCOUNT), LOG IT and SKIP IT.
    Do NOT retry failed connections.
    Log your progress clearly.
    `;

    console.log("SENDING INSTRUCTION TO AGENT:\n" + instruction);

    const messages: any[] = [{ role: "user", content: instruction }];

    // Agent Loop
    let turn = 0;
    while (turn < 15) {
        turn++;
        console.log(`\n--- Turn ${turn} ---`);

        try {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: messages,
                tools: tools,
                tool_choice: "auto",
            });

            const msg = response.choices[0].message;
            messages.push(msg);

            // Check tool calls
            if (msg.tool_calls) {
                console.log(`Agent wants to call ${msg.tool_calls.length} tools:`);
                for (const tc of msg.tool_calls) {
                    if ((tc as any).function) {
                        console.log(`  - ${(tc as any).function.name}: ${(tc as any).function.arguments}`);
                    }
                }

                let toolOutputs;
                try {
                    toolOutputs = await toolset.handleToolCall(response);
                    console.log("Tool IDs executed.");
                    messages.push(...toolOutputs);
                } catch (error: any) {
                    console.error("Tool execution failed (caught):", error.message);
                    const outputs = msg.tool_calls.map((tc: any) => ({
                        role: "tool",
                        tool_call_id: tc.id,
                        content: `Error executing tool: ${error.message}. If this is a connection error, please SKIP this step.`
                    }));
                    messages.push(...outputs);
                }
            } else {
                console.log("Agent Response:", msg.content);
                if (msg.content?.toLowerCase().includes("completed") || msg.content?.toLowerCase().includes("skipped") || turn > 10) {
                    break;
                }
            }
        } catch (e: any) {
            console.error("Critical Agent Error:", e);
            break;
        }
    }
}

main();
