
import crypto from 'crypto';
import { getServerEnv } from '@/lib/env';
import { PROVIDER_REGISTRY } from './registry/definitions';

// Helper to get client credentials dynamically
function getClientForProvider(providerId: string) {
    const env = getServerEnv();
    const idKey = `${providerId.toUpperCase()}_CLIENT_ID` as keyof typeof env;
    const secretKey = `${providerId.toUpperCase()}_CLIENT_SECRET` as keyof typeof env;
    const clientId = env[idKey];
    const clientSecret = env[secretKey];

    if (!clientId || !clientSecret) {
        throw new Error(`Missing OAuth credentials for ${providerId} (Expected ${idKey}, ${secretKey})`);
    }

    return { clientId, clientSecret };
}

// Configured redirect URI
function getRedirectUri(providerId: string) {
    const env = getServerEnv();
    // Ensure no trailing slash on SITE_URL
    const baseUrl = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
    return `${baseUrl}/api/oauth/callback/${providerId}`;
}

// PKCE Helpers
function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier: string) {
    return crypto
        .createHash('sha256')
        .update(verifier)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

export class OAuthLogic {

    static generateAuthUrl(providerId: string, state: string, forcePrompt = true) {
        const config = PROVIDER_REGISTRY[providerId];
        if (!config) throw new Error(`Unknown provider: ${providerId}`);

        const { clientId } = getClientForProvider(providerId);
        const redirectUri = getRedirectUri(providerId);

        let codeVerifier: string | undefined;
        let codeChallenge: string | undefined;

        if (config.auth.usePkce) {
            codeVerifier = generateCodeVerifier();
            codeChallenge = generateCodeChallenge(codeVerifier);
        }

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: "code",
            scope: config.auth.scopes.join(config.auth.scopeSeparator || " "),
            state: state,
            ...(config.auth.additionalParams || {})
        });

        if (config.auth.usePkce && codeChallenge) {
            params.append("code_challenge", codeChallenge);
            params.append("code_challenge_method", "S256");
        }

        // Some providers need explicit prompt=consent for refresh tokens (Google)
        // already handled in additionalParams for Google. 

        return {
            url: `${config.auth.authorizationUrl}?${params.toString()}`,
            codeVerifier
        };
    }

    static async exchangeCode(providerId: string, code: string, codeVerifier?: string) {
        const config = PROVIDER_REGISTRY[providerId];
        if (!config) throw new Error(`Unknown provider: ${providerId}`);

        const { clientId, clientSecret } = getClientForProvider(providerId);
        const redirectUri = getRedirectUri(providerId);

        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "authorization_code",
            code: code,
            redirect_uri: redirectUri
        });

        if (config.auth.usePkce && codeVerifier) {
            params.append("code_verifier", codeVerifier);
        }

        const response = await fetch(config.auth.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: params.toString()
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`OAuth Exchange Failed (${response.status}): ${text}`);
        }

        const data = await response.json();

        // Calculate expires_at
        const expiresAt = data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null;

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null,
            expiresAt: expiresAt,
            tokenType: data.token_type || "Bearer",
            scope: data.scope, // Provider returned version
            raw: data
        };
    }
    static async refreshTokens(providerId: string, refreshToken: string) {
        const config = PROVIDER_REGISTRY[providerId];
        if (!config) throw new Error(`Unknown provider: ${providerId}`);

        const { clientId, clientSecret } = getClientForProvider(providerId);

        const params = new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: refreshToken
        });

        const response = await fetch(config.auth.tokenUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json"
            },
            body: params.toString()
        });

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Token Refresh Failed (${response.status}): ${text}`);
        }

        const data = await response.json();

        const expiresAt = data.expires_in
            ? new Date(Date.now() + data.expires_in * 1000)
            : null;

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token || null, // Some rotate it
            expiresAt: expiresAt,
            tokenType: data.token_type || "Bearer",
            scope: data.scope,
            raw: data
        };
    }
}
