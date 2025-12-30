I will implement the "Verification and Hardening Mode" by creating a comprehensive integration testing harness, adding persistent health tracking, and validating reachability for all integrations.

### 1. Schema Updates
*   **Migration**: Create a new Supabase migration `20251230140000_add_integration_health.sql`.
*   **Table**: Create `integration_health` table (linked to `integration_connections`) or add columns to `integration_connections`:
    *   `status`: 'ok' | 'error'
    *   `last_checked_at`: timestamp
    *   `error_message`: text
    *   `error_code`: text
    *   `latency_ms`: integer

### 2. Integration Test Harness
*   **File**: `lib/integrations/testIntegration.ts`
*   **Logic**:
    *   `testIntegrationConnection({ orgId, integrationId })`:
    *   Loads credentials via `getValidAccessToken`.
    *   Switches on `integrationId` to perform a **specific, minimal API call** (e.g., `stripe.account.retrieve`, `github.users.getAuthenticated`).
    *   Validates response status (2xx).
    *   Updates `integration_health` table with result.

### 3. API Endpoints
*   **Single Test**: `POST /api/integrations/[id]/test` -> triggers `testIntegrationConnection`.
*   **Bulk Test**: `POST /api/integrations/test-all` -> iterates all connections for the org and tests them concurrently.

### 4. Implementation Details (The "Matrix")
I will implement specific test logic for:
*   **Stripe**: `GET https://api.stripe.com/v1/account`
*   **GitHub**: `GET https://api.github.com/user`
*   **Google**: `GET https://www.googleapis.com/oauth2/v3/userinfo`
*   **Slack**: `POST https://slack.com/api/auth.test`
*   **Salesforce**: `GET {instance_url}/services/data/v59.0/limits`
*   (And generic fallbacks for others: `GET /` or specific known metadata endpoints).

### 5. Verification
*   I will run the bulk test API locally to verify that my configured integrations (GitHub, Stripe) pass and unconfigured/broken ones fail loudly.
