
export interface ComposioIntegrationConfig {
    appName: string;
    useComposioAuth: boolean;
    requiredParams?: string[];
    scopes?: string[];
    notes?: string;
    /** When useComposioAuth is false, provide env var names for custom OAuth credentials */
    customAuth?: {
        clientIdEnv: string;
        clientSecretEnv: string;
    };
}

// Registry of supported integrations and their specific Composio configuration
// Keys are Assemblr's internal integration IDs (lowercase)
export const INTEGRATION_AUTH_CONFIG: Record<string, ComposioIntegrationConfig> = {
    // OAUTH2 / Composio Managed Auth Group
    // These require useComposioAuth: true to let Composio handle the complex OAuth dance (refresh, scopes, instance selection)

    // Jira requires subdomain -> DISABLED (Zero-Friction Audit)
    // Jira
    jira: {
        appName: "jira",
        useComposioAuth: true,
        requiredParams: ["your-domain"],
        notes: "Requires site selection (your-domain)"
    },

    // Salesforce
    salesforce: {
        appName: "salesforce",
        useComposioAuth: true,
        requiredParams: ["subdomain", "instanceEndpoint"],
        notes: "Requires subdomain and instanceEndpoint"
    },

    hubspot: { appName: "hubspot", useComposioAuth: true }, // Verified Zero-Config
    zendesk: { appName: "zendesk", useComposioAuth: true, requiredParams: ["subdomain"] },
    // pipedrive: { appName: "pipedrive", useComposioAuth: true, requiredParams: ["COMPANYDOMAIN"] }, // DISABLED
    intercom: { appName: "intercom", useComposioAuth: true },
    linear: { appName: "linear", useComposioAuth: true },
    // Composio's "slack" app has a legacy "bot" scope that breaks modern OAuth v2.
    // Use "slackbot" instead — same actions, proper modern scopes, no invalid_scope errors.
    slack: { appName: "slackbot", useComposioAuth: true },
    slackbot: { appName: "slackbot", useComposioAuth: true },

    // Standard OAuth Group
    github: { appName: "github", useComposioAuth: true },
    notion: { appName: "notion", useComposioAuth: true },
    google: { appName: "googlesheets", useComposioAuth: true }, // Using googlesheets as base for all G-Suite scopes

    // Productivity
    asana: { appName: "asana", useComposioAuth: true },
    trello: { appName: "trello", useComposioAuth: true },
    airtable: { appName: "airtable", useComposioAuth: true },
    clickup: { appName: "clickup", useComposioAuth: true },
    // monday: { appName: "monday", useComposioAuth: true, requiredParams: ["subdomain"] }, // DISABLED

    // Communication
    discord: { appName: "discord", useComposioAuth: true },
    zoom: { appName: "zoom", useComposioAuth: true },

    // E-commerce / Payments
    // shopify: { appName: "shopify", useComposioAuth: true, requiredParams: ["shop"] }, // DISABLED
    stripe: { appName: "stripe", useComposioAuth: true },

    // Analytics
    // mixpanel: { appName: "mixpanel", useComposioAuth: true }, // DISABLED
    google_analytics: { appName: "google_analytics", useComposioAuth: true },
    // amplitude: { appName: "amplitude", useComposioAuth: true }, // DISABLED
    quickbooks: { appName: "quickbooks", useComposioAuth: true },

    // Marketing
    // mailchimp: { ... }, // DISABLED (Requires DC)
    // metaads: { appName: "metaads", useComposioAuth: true }, // DISABLED

    // Dev
    gitlab: { appName: "gitlab", useComposioAuth: true },
    bitbucket: { appName: "bitbucket", useComposioAuth: true },

    // Producivity & Others
    microsoft_teams: { appName: "microsoft_teams", useComposioAuth: true },
    outlook: { appName: "outlook", useComposioAuth: true },
    // zoho: { appName: "zoho", useComposioAuth: true, requiredParams: ["dc"] }, // DISABLED
    // freshdesk: { appName: "freshdesk", useComposioAuth: true }, // DISABLED (Often requires domain)
};

export function getIntegrationConfig(assemblrId: string): ComposioIntegrationConfig {
    const normalizedId = assemblrId.toLowerCase();
    const config = INTEGRATION_AUTH_CONFIG[normalizedId];

    if (!config) {
        console.warn(`[Composio Config] No specific config found for '${assemblrId}'. Falling back to default.`);
        return {
            appName: normalizedId, // Best guess fallback
            useComposioAuth: true, // Default to true as it's the safest bet for v2 managed integrations
            notes: "Fallback config"
        };
    }

    return config;
}

/**
 * Reverse-map a Composio app name back to Assemblr's internal integration ID.
 *
 * Composio returns `appName` values like "googlesheets" which may differ from
 * Assemblr's internal IDs (e.g., "google"). This function resolves the mismatch.
 */
let _reverseMap: Map<string, string> | null = null;

function getReverseAppNameMap(): Map<string, string> {
    if (_reverseMap) return _reverseMap;
    _reverseMap = new Map<string, string>();
    for (const [assemblrId, config] of Object.entries(INTEGRATION_AUTH_CONFIG)) {
        const appName = config.appName.toLowerCase();
        // Only store the first match (Assemblr ID takes priority)
        if (!_reverseMap.has(appName)) {
            _reverseMap.set(appName, assemblrId);
        }
    }
    return _reverseMap;
}

export function resolveAssemblrId(composioAppName: string): string {
    const normalized = composioAppName.toLowerCase();
    const reverseMap = getReverseAppNameMap();
    return reverseMap.get(normalized) ?? normalized;
}
