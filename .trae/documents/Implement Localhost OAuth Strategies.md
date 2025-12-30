I will implement the localhost OAuth strategy matrix, enabling all providers on localhost via specific strategies (`loopback`, `tunnel`, etc.) instead of blocking them.

### 1. Registry Updates (`lib/integrations/oauthProviders.ts`)
*   **Action**: Update `OAuthProvider` interface to include `localhostStrategy`.
*   **Action**: Update `OAUTH_PROVIDERS` object.
    *   **Loopback**: Stripe, GitHub, Google, Slack, etc.
    *   **Tunnel**: Meta, LinkedIn, Salesforce, HubSpot, etc.
    *   **Https-Localhost**: Azure AD (optional, can fallback to loopback if supported, but strict providers need it). I'll default to `loopback` where possible for simplicity, `tunnel` where public URL is mandatory.
    *   *Self-Correction*: I will remove `requiresProdDomain` as it's now obsolete.

### 2. OAuth Engine Updates (`app/api/oauth/start/route.ts`)
*   **Action**: Remove the `requiresProdDomain` blocker.
*   **Action**: Implement dynamic `redirectUri` calculation based on `localhostStrategy`.
    *   If `process.env.NODE_ENV === "development"`:
        *   `loopback`: Use `request.nextUrl.origin` (localhost:3000).
        *   `tunnel`: Check `process.env.NEXT_PUBLIC_TUNNEL_URL` (or `TUNNEL_URL`). If missing, throw 500 with instructions. Use tunnel URL.
        *   `https-localhost`: Check protocol.
    *   If `production`: Use `request.nextUrl.origin` (app.assemblr.ai).

### 3. OAuth Engine Callback Updates (`app/api/oauth/callback/[provider]/route.ts`)
*   **Action**: Implement the **exact same** `redirectUri` calculation logic here. The `redirect_uri` sent in the token exchange MUST match the one sent in the authorization request.
*   **Action**: This ensures the code exchange succeeds.

### 4. UI Updates (`components/dashboard/chat-panel.tsx`)
*   **Action**: The current UI just links to `/api/oauth/start`. I will leave this as-is for now because the *API* will handle the error (e.g., missing tunnel) and display a JSON error.
*   *Refinement*: The prompt asks for "Clear messages... Requires tunnel". I can implement this by having the API return a specific error page or JSON that the UI could theoretically handle, but given the constraints, a clear JSON error on the API route is the "loud failure" requested. The user can then set the env var and retry.

### 5. Verification
*   I will verify via code inspection that all providers have a strategy and the logic covers the strategies.

### Detailed Strategy Assignment (Mental Draft)
*   **Stripe**: `loopback`
*   **GitHub**: `loopback`
*   **Salesforce**: `tunnel`
*   **HubSpot**: `tunnel`
*   **Meta**: `tunnel`
*   **Google**: `loopback`
