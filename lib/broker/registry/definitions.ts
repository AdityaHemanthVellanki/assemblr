
export type ProviderConfig = {
    id: string;
    name: string;
    auth: {
        type: "oauth2";
        authorizationUrl: string;
        tokenUrl: string;
        scopes: string[];
        scopeSeparator: " " | ",";
        supportsRefreshToken: boolean;
        usePkce: boolean;
        additionalParams?: Record<string, string>;
    };
    api: {
        baseUrl: string;
        paginationLocation: "cursor" | "page" | "link_header";
        rateLimitHeader?: string;
    };
    discovery: {
        strategy: "openapi" | "graphql" | "rest_heuristics" | "manual";
        specUrl?: string; // For OpenAPI
        allowedResources: string[]; // Whitelist for discovery
    };
};

export const PROVIDER_REGISTRY: Record<string, ProviderConfig> = {
    github: {
        id: "github",
        name: "GitHub",
        auth: {
            type: "oauth2",
            authorizationUrl: "https://github.com/login/oauth/authorize",
            tokenUrl: "https://github.com/login/oauth/access_token",
            scopes: ["repo", "read:org", "user"],
            scopeSeparator: " ",
            supportsRefreshToken: false, // GitHub web flow (apps use refresh, but OAuth app is simple)
            usePkce: false, // GitHub doesn't strictly enforce PKCE but we should try? No, Standard flow for web apps.
        },
        api: {
            baseUrl: "https://api.github.com",
            paginationLocation: "link_header",
            rateLimitHeader: "x-ratelimit-remaining",
        },
        discovery: {
            strategy: "rest_heuristics", // We'll use octokit + known endpoints
            allowedResources: ["repos", "issues", "pulls"],
        },
    },
    slack: {
        id: "slack",
        name: "Slack",
        auth: {
            type: "oauth2",
            authorizationUrl: "https://slack.com/oauth/v2/authorize",
            tokenUrl: "https://slack.com/api/oauth.v2.access",
            scopes: [
                "channels:read", "channels:history", "groups:read", "im:read", "mpim:read",
                "chat:write", "files:read", "users:read"
            ],
            scopeSeparator: ",",
            supportsRefreshToken: true, // Slack v2 uses rotation
            usePkce: false,
        },
        api: {
            baseUrl: "https://slack.com/api",
            paginationLocation: "cursor",
        },
        discovery: {
            strategy: "manual", // Slack 'capabilities' are complex (channels, users are main ones)
            allowedResources: ["channels", "users", "messages"],
        },
    },
    linear: {
        id: "linear",
        name: "Linear",
        auth: {
            type: "oauth2",
            authorizationUrl: "https://linear.app/oauth/authorize",
            tokenUrl: "https://api.linear.app/oauth/token",
            scopes: ["read", "write"],
            scopeSeparator: " ",
            supportsRefreshToken: false, // Linear has long-lived tokens unless configured? Specs say simple steps.
            usePkce: true, // Recommended
        },
        api: {
            baseUrl: "https://api.linear.app/graphql",
            paginationLocation: "cursor", // GraphQL
        },
        discovery: {
            strategy: "graphql",
            allowedResources: ["issues", "projects", "teams"],
        },
    },
    google: {
        id: "google",
        name: "Google Workspace",
        auth: {
            type: "oauth2",
            authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
            tokenUrl: "https://oauth2.googleapis.com/token",
            scopes: [
                "https://www.googleapis.com/auth/userinfo.email",
                "https://www.googleapis.com/auth/userinfo.profile",
                "https://www.googleapis.com/auth/drive.readonly",
                "https://www.googleapis.com/auth/documents.readonly",
                "https://www.googleapis.com/auth/spreadsheets.readonly",
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/calendar.readonly"
            ],
            scopeSeparator: " ",
            supportsRefreshToken: true,
            usePkce: true,
            additionalParams: { access_type: "offline", prompt: "consent" },
        },
        api: {
            baseUrl: "https://www.googleapis.com", // varies per service
            paginationLocation: "page",
        },
        discovery: {
            strategy: "rest_heuristics", // Discovery docs exist but are huge. manual probing is better.
            allowedResources: ["drive_files", "gmail_messages", "calendar_events"],
        },
    },
    notion: {
        id: "notion",
        name: "Notion",
        auth: {
            type: "oauth2",
            authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
            tokenUrl: "https://api.notion.com/v1/oauth/token",
            scopes: [], // Notion uses internal granular permissions managed by user at connect time
            scopeSeparator: " ",
            supportsRefreshToken: false,
            usePkce: false,
        },
        api: {
            baseUrl: "https://api.notion.com/v1",
            paginationLocation: "cursor",
        },
        discovery: {
            strategy: "rest_heuristics",
            allowedResources: ["pages", "databases"],
        },
    }
};
