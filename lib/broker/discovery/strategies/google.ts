
import { SchemaDefinition } from "../../types";
import { DiscoveryStrategy, DiscoveryContext } from "../types";
import { decrypt } from "../../security";

export class GoogleDiscoveryStrategy implements DiscoveryStrategy {
    async discover(context: DiscoveryContext): Promise<SchemaDefinition[]> {
        const decryptedToken = decrypt(context.accessToken);

        // 1. Verify Token Validity (Quick call)
        const res = await fetch("https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=" + decryptedToken);
        if (!res.ok) {
            throw new Error("Invalid Google Token during discovery");
        }
        const tokenInfo = await res.json();
        const scopes = (tokenInfo.scope || "").split(" ");

        const schemas: SchemaDefinition[] = [];

        // 2. Drive
        if (scopes.some((s: string) => s.includes("drive"))) {
            schemas.push({
                resourceType: "drive_file",
                fields: [
                    { name: "id", type: "string", required: true },
                    { name: "name", type: "string", required: true },
                    { name: "mimeType", type: "string" },
                    { name: "webViewLink", type: "string" },
                    { name: "owners", type: "array" }
                ]
            });
        }

        // 3. Gmail
        if (scopes.some((s: string) => s.includes("gmail"))) {
            schemas.push({
                resourceType: "gmail_message",
                fields: [
                    { name: "id", type: "string", required: true },
                    { name: "threadId", type: "string" },
                    { name: "snippet", type: "string" },
                    { name: "payload", type: "object" } // headers, body
                ]
            });
        }

        // 4. Calendar
        if (scopes.some((s: string) => s.includes("calendar"))) {
            schemas.push({
                resourceType: "calendar_event",
                fields: [
                    { name: "id", type: "string", required: true },
                    { name: "summary", type: "string" }, // Title
                    { name: "description", type: "string" },
                    { name: "start", type: "object" }, // dateTime
                    { name: "end", type: "object" },
                    { name: "attendees", type: "array" }
                ]
            });
        }

        return schemas;
    }
}
