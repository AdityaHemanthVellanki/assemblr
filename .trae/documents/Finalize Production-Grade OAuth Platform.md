I will finalize the OAuth platform implementation to meet the "production-grade" requirements, ensuring strict separation between localhost-testable providers and production-only ones, and implementing the critical chat resume flow.

### 1. Registry Configuration (The "Matrix")
*   **File**: `lib/integrations/oauthProviders.ts`
*   **Action**:
    *   Add `requiresProdDomain?: boolean` to the `OAuthProvider` type (if not fully persisted yet).
    *   **Enable Localhost (requiresProdDomain: false/undefined)**:
        *   `stripe`
        *   `github`
        *   `slack`
        *   `google_drive`, `google_sheets`
    *   **Disable Localhost (requiresProdDomain: true)**:
        *   All other providers (Salesforce, HubSpot, Meta Ads, etc.) to ensure no "half-working" states on localhost.

### 2. Environment Hardening
*   **File**: `app/api/oauth/start/route.ts`
*   **Action**:
    *   Implement the strict check: if `NODE_ENV === 'development'` and provider requires prod domain, return a **403 Error** immediately.
    *   Ensure `redirect_uri` matches the environment (`localhost:3000` vs `app.assemblr.ai` via `request.url` origin).

### 3. Chat Resume Logic (The "Loop")
*   **File**: `app/api/oauth/callback/[provider]/route.ts`
*   **Action**:
    *   On success, redirect to `${storedState.redirectPath}?integration_connected=true`.
*   **File**: `components/dashboard/chat-panel.tsx`
*   **Action**:
    *   Add `useEffect` to watch for `integration_connected=true`.
    *   If detected:
        1.  Clean URL (remove param).
        2.  Trigger a simulated user message: "I have connected the integration."
        3.  This forces the AI to re-evaluate the context, see the new connection in the DB, and proceed with the original task.

### 4. Verification
*   I will verify that the code handles the "Test Matrix" logic (success, denied, refresh) by reviewing the flow in the updated files.
