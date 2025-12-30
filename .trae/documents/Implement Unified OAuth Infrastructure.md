I will implement the complete OAuth infrastructure for Assemblr, ensuring a unified, production-ready platform that supports all requested integrations without mocks or fallbacks.

### 1. OAuth Provider Registry
I will create `lib/integrations/oauthProviders.ts` to define the `OAuthProvider` schema and the `OAUTH_PROVIDERS` registry containing configuration for all requested integrations (Payment, Analytics, CRM, Marketing, Dev, Cloud, Files, HR, Messaging, AI).
- **Structure**: Map of `providerId` -> `OAuthProvider` config.
- **Config**: Auth/Token URLs, scopes, environment variable keys for Client ID/Secret.

### 2. OAuth API Routes
I will implement the Authorization Code Flow with two new endpoints:
- **`GET /api/oauth/start`**:
    - Validates the requested provider.
    - Generates a cryptographically secure `state` parameter.
    - Stores pending state (orgId, provider, redirectPath) in a secure, signed HTTP-only cookie.
    - Redirects the user to the provider's authorization URL.
- **`GET /api/oauth/callback/[provider]`**:
    - Validates `state` against the cookie to prevent CSRF.
    - Exchanges the authorization `code` for access/refresh tokens via the provider's token endpoint.
    - Validates the token response structure.
    - Encrypts the tokens using `lib/security/encryption.ts`.
    - Stores them in the `integration_connections` table (upsert).
    - Redirects the user back to the original context (e.g., the chat interface).

### 3. Token Storage & Refresh System
I will implement a robust token management system in `lib/integrations/tokenRefresh.ts`:
- **Storage**: Tokens are already stored in `integration_connections.encrypted_credentials`. I will enforce a strict JSON schema for this field: `{ access_token, refresh_token, expires_at, scope }`.
- **Refresh Logic**: I will create a `getValidAccessToken(orgId, integrationId)` function that:
    1.  Loads and decrypts credentials.
    2.  Checks `expires_at`.
    3.  If expired (or nearing expiry), calls the provider's refresh endpoint.
    4.  Updates the DB with new tokens *before* returning.
    5.  Throws a hard error if refresh fails (no silent failures).
- **Integration**: I will update `lib/integrations/executeIntegration.ts` to use this new helper, ensuring automatic refresh on every fetch.

### 4. UI Integration & Chat Resume
I will update `components/dashboard/chat-panel.tsx` to support the "Connect" flow:
- **Connect Button**: Instead of linking to the generic settings page, the "Connect Integration" button will link directly to `/api/oauth/start?provider={missing_integration_id}&redirectPath={current_url}`.
- **Resume**: After the OAuth callback redirects back to the chat, the existing chat history loading mechanism will restore the conversation context. The user (or the system) can then proceed with the originally requested action.

### 5. Verification
I will create a smoke test script `scripts/oauth-smoke-tests.ts` to verify:
- Registry integrity (all providers have config).
- Token refresh logic (mocking expiration and verifying refresh flow).
- Encryption/Decryption round-trip for tokens.
