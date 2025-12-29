# Implementation Plan - Integration Runtime

I will implement the secure, deterministic integration runtime for Assemblr, following the architecture: `Selection -> Connector -> Auth -> Fetch -> Normalization`.

## 1. Dependencies
- Install `stripe` (Official SDK)
- Install `@hubspot/api-client` (Official SDK)
- Install `csv-parse` (Robust CSV handling)

## 2. Database Schema (Supabase)
- Create migration `supabase/migrations/20251230090000_integration_connections.sql`:
  - Table: `integration_connections`
  - Columns: `id`, `org_id`, `integration_id`, `encrypted_credentials` (text), timestamps.
  - RLS Policies:
    - `select`: Users can read connections for their org.
    - `insert/update/delete`: Owners/Editors can manage connections.
  - **Security**: Credentials stored as encrypted strings (never plain JSON).

## 3. Core Types & Interfaces
- Create `lib/integrations/types.ts`:
  - Define `IntegrationConnector` interface (connect, fetch, act).
  - Define `NormalizedData` types (Table vs Events).
  - Define Input types (ConnectInput, FetchInput).

## 4. Concrete Connectors
I will implement 4 connectors in `lib/integrations/connectors/`:
- **Postgres (`postgres.ts`)**:
  - Uses `pg` pool.
  - Validates connection string (SSL required).
  - Fetches tabular data with limits (10k rows).
- **Stripe (`stripe.ts`)**:
  - Uses `stripe` SDK.
  - Fetches `charges` or `subscriptions` based on capability.
  - Normalizes to `NormalizedEvents`.
- **HubSpot (`hubspot.ts`)**:
  - Uses `@hubspot/api-client`.
  - Fetches `contacts` or `deals`.
  - Normalizes to `NormalizedTable`.
- **CSV (`csv.ts`)**:
  - Parses raw string content.
  - Infers columns/types automatically.
  - Returns `NormalizedTable`.

## 5. Connector Registry
- Create `lib/integrations/registry.ts`:
  - Static map of `integration_id` → `ConnectorInstance`.
  - Single source of truth for runtime resolution.

## 6. Execution Engine
- Create `lib/integrations/executeIntegration.ts`:
  - Function `executeIntegrationFetch`.
  - **Flow**:
    1.  Fetch encrypted credentials from Supabase (`integration_connections`).
    2.  Decrypt using `lib/security/encryption.ts`.
    3.  Resolve connector from Registry.
    4.  Validate capability is supported by connector.
    5.  Execute `connector.fetch()`.
    6.  Log attempt/result (without leaking secrets).

## 7. Verification
- Create `scripts/integration-runtime-smoke-tests.ts`:
  - Test harness mocking the database/credential layer.
  - Verify each connector's `fetch` logic (using mocked external calls where appropriate).
  - Verify error handling and capability validation.
