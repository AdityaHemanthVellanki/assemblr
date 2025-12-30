# Architectural Shift: BYOC/BYOO for Integrations

## 1. Database Schema Update
- Create a migration to add `status` column to `integration_connections` table.
- Default `status` to `'active'` for backward compatibility (though we assume fresh start).
- Allowed values: `'pending_setup'`, `'active'`, `'error'`.

## 2. Registry & Configuration Refactor
- **`lib/integrations/oauthProviders.ts`**:
  - Remove `clientIdEnv` and `clientSecretEnv` properties from `OAuthProvider` type and all provider entries.
  - This ensures no reliance on global environment variables.
- **`lib/integrations/registry.ts`**:
  - Update `INTEGRATIONS_UI` to include `fields` for `oauth` providers.
  - Add `Client ID` and `Client Secret` (and potentially `Domain` for some) as required fields.

## 3. Backend API Refactor
- **`app/api/integrations/route.ts`**:
  - **POST**: Update `buildConnectorCredentials` to accept and validate `oauth` credentials (Client ID/Secret).
  - **POST**: When saving `oauth` credentials, upsert `integration_connections` with `status = 'pending_setup'` and the credentials in `encrypted_credentials`.
  - **GET**: Update to derive `connected` state from `status === 'active'`.
- **`app/api/oauth/start/route.ts`**:
  - Remove env var lookups.
  - Fetch `integration_connections` record for the given `orgId` and `providerId`.
  - Decrypt `encrypted_credentials` to retrieve `clientId` (and `clientSecret`).
  - Throw explicit error if no connection record is found (enforcing "User must configure first").
- **`app/api/oauth/callback/[provider]/route.ts`**:
  - Remove env var lookups.
  - Fetch `integration_connections` record.
  - Decrypt to get `clientSecret` for token exchange.
  - On success, merge new tokens with existing credentials (preserving ID/Secret) and update `status = 'active'`.

## 4. Frontend UI Updates
- **`app/(dashboard)/dashboard/integrations/page.tsx`**:
  - Update `IntegrationAuthSchema` to support `fields` for `oauth`.
  - Update `submit` function:
    - For `oauth`: Call `POST /api/integrations` to save credentials first.
    - On success, redirect browser to `/api/oauth/start`.
  - Ensure the modal renders input fields for OAuth providers.

## 5. Cleanup
- Update `.env.example` to remove all provider-specific keys.
