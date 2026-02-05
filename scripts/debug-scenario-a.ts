import { config } from "dotenv";
config({ path: ".env.local" });

import { ToolCompiler } from "@/lib/toolos/compiler/tool-compiler";
import { bootstrapRealUserSession } from "./auth-bootstrap";

async function debug() {
    const { user, orgId } = await bootstrapRealUserSession();
    const prompt = "Show me recent GitHub PRs and check if any Linear issues are mentioned in them.";

    console.log("Compiling prompt:", prompt);

    // Create a dummy tool ID (UUID)
    const toolId = "00000000-0000-0000-0000-000000000000";

    const result = await ToolCompiler.run({
        toolId,
        orgId,
        userId: user.id,
        prompt,
        sessionId: "debug-session-1",
        connectedIntegrationIds: ["github", "linear", "google"], // Simulating all connected
    });
    console.log("Integrations in Spec:", result.spec.integrations);
    console.log("Actions in Spec:", result.spec.actions.map(a => `${a.name} (${a.integrationId})`));
}

debug().catch(console.error);
