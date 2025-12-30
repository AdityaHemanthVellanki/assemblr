I will finalize the localhost OAuth infrastructure by enforcing environment constraints, implementing the "Chat Resume" flow, and updating the registry with production safeguards.

### 1. Registry Updates (Architecture & Safety)
*   **File**: [`lib/integrations/oauthProviders.ts`](file:///Users/aditya/Desktop/Assemblr.ai/Assemblr/lib/integrations/oauthProviders.ts)
*   **Action**: 
    *   Update `OAuthProvider` interface to include `requiresProdDomain?: boolean`.
    *   Set `requiresProdDomain: true` for **all** providers *except* the localhost-testable ones (GitHub, Google, Slack, Stripe).
    *   This ensures developers don't accidentally try to test complex integrations (like Salesforce) on localhost without proper setup.

### 2. Enforce Localhost Constraints
*   **File**: [`app/api/oauth/start/route.ts`](file:///Users/aditya/Desktop/Assemblr.ai/Assemblr/app/api/oauth/start/route.ts)
*   **Action**: 
    *   Add a check at the start of the flow:
        ```typescript
        if (process.env.NODE_ENV === "development" && provider.requiresProdDomain) {
           return NextResponse.json({ error: "This provider requires a production domain" }, { status: 403 });
        }
        ```
    *   This fulfills the "Disabled provider on localhost → explicit error" requirement.

### 3. Implement "Chat Resume" Logic
*   **File**: [`app/api/oauth/callback/[provider]/route.ts`](file:///Users/aditya/Desktop/Assemblr.ai/Assemblr/app/api/oauth/callback/%5Bprovider%5D/route.ts)
    *   **Action**: Append `?integration_connected=true` to the redirect URL upon success.
*   **File**: [`components/dashboard/chat-panel.tsx`](file:///Users/aditya/Desktop/Assemblr.ai/Assemblr/components/dashboard/chat-panel.tsx)
    *   **Action**: 
        *   Import `useSearchParams` and `useRouter`.
        *   Add a `useEffect` to listen for `integration_connected=true`.
        *   If detected, automatically submit a hidden system message (or a user message like "I connected the integration") to resume the AI flow.
        *   Clean up the URL (remove the query param) to prevent loops.

### 4. Verification
*   I will verify the changes by inspecting the code and ensuring the types align.
*   (Self-Correction): I cannot "run" the full end-to-end test myself as I lack the browser and valid Client IDs, but I will ensure the *code* strictly follows the logic required for the user to pass the "Test Matrix".

### Summary of Changes
1.  **Registry**: Add `requiresProdDomain` flag.
2.  **Start Route**: Block non-local providers in dev.
3.  **Callback Route**: Signal success via URL param.
4.  **Chat UI**: Auto-resume on success signal.
