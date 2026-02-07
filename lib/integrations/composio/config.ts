
export interface ComposioIntegrationConfig {
    appName: string;
    useComposioAuth: boolean;
    requiredParams?: string[];
    notes?: string;
}

// Registry of supported integrations and their specific Composio configuration
// Keys are Assemblr's internal integration IDs (lowercase)
export const INTEGRATION_AUTH_CONFIG: Record<string, ComposioIntegrationConfig> = {
    // OAUTH2 / Composio Managed Auth Group
    // These require useComposioAuth: true to let Composio handle the complex OAuth dance (refresh, scopes, instance selection)

    // Jira requires subdomain -> DISABLED (Zero-Friction Audit)
    // jira: {
    //     appName: "jira",
    //     useComposioAuth: true,
    //     requiredParams: ["your-domain"],
    //     notes: "Requires site selection (your-domain)"
    // },

    // Salesforce requires instance endpoint -> DISABLED (Zero-Friction Audit)
    // salesforce: {
    //     appName: "salesforce",
    //     useComposioAuth: true,
    //     requiredParams: ["subdomain", "instanceEndpoint"],
    //     notes: "Requires subdomain and instanceEndpoint"
    // },

    hubspot: { appName: "hubspot", useComposioAuth: true }, // Verified Zero-Config
    // zendesk: { appName: "zendesk", useComposioAuth: true, requiredParams: ["subdomain"] }, // DISABLED
    // pipedrive: { appName: "pipedrive", useComposioAuth: true, requiredParams: ["COMPANYDOMAIN"] }, // DISABLED
    intercom: { appName: "intercom", useComposioAuth: true },
    linear: { appName: "linear", useComposioAuth: true },
    slack: { appName: "slack", useComposioAuth: true },
    slackbot: { appName: "slackbot", useComposioAuth: true },

    // Standard OAuth Group
    github: { appName: "github", useComposioAuth: true },
    notion: { appName: "notion", useComposioAuth: true },
    google: { appName: "google", useComposioAuth: true },

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
    // mixpanel: { appName: "mixpanel", useComposioAuth: false }, // DISABLED
    google_analytics: { appName: "google_analytics", useComposioAuth: true },
    // amplitude: { appName: "amplitude", useComposioAuth: false }, // DISABLED
    quickbooks: { appName: "quickbooks", useComposioAuth: true },

    // Marketing
    // mailchimp: { ... }, // DISABLED (Requires DC)
    // metaads: { appName: "metaads", useComposioAuth: false }, // DISABLED

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
