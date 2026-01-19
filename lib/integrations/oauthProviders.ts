export type OAuthProvider = {
  id: string;
  name: string;

  authUrl: string;
  tokenUrl: string;

  scopes: string[];
  scopeSeparator?: " " | ",";

  supportsRefreshToken: boolean;

  extraAuthParams?: Record<string, string>;

  requiresHttps?: boolean;
  connectionMode: "hosted_oauth";
};

export const OAUTH_PROVIDERS: Record<string, OAuthProvider> = {
  github: {
    id: "github",
    name: "GitHub",
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:org", "user"],
    supportsRefreshToken: false,
    connectionMode: "hosted_oauth",
  },
  slack: {
    id: "slack",
    name: "Slack",
    authUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: ["channels:read", "channels:history", "groups:read", "im:read", "mpim:read", "chat:write", "files:read", "users:read"],
    supportsRefreshToken: false,
    connectionMode: "hosted_oauth",
  },
  notion: {
    id: "notion",
    name: "Notion",
    authUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    supportsRefreshToken: false,
    connectionMode: "hosted_oauth",
  },
  linear: {
    id: "linear",
    name: "Linear",
    authUrl: "https://linear.app/oauth/authorize",
    tokenUrl: "https://api.linear.app/oauth/token",
    scopes: ["read", "write"],
    supportsRefreshToken: true,
    connectionMode: "hosted_oauth",
  },
  google: {
    id: "google",
    name: "Google",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar",
    ],
    supportsRefreshToken: true,
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    connectionMode: "hosted_oauth",
  },
};
