# Phase 1: Hard Reset & Scope Reduction Plan

This plan executes a strict reduction of the codebase to support **only** the 6 Phase 1 integrations (Stripe, GitHub, Slack, Notion, Linear, Google) using **hosted OAuth only**.

## 1. Registry & Types Refactor

* **Modify** **`lib/integrations/registry.ts`**:

  * Define strict `Phase1IntegrationId`.

  * Reduce `INTEGRATIONS_UI` to exactly 6 entries.

  * Consolidate all Google services (Sheets, Docs, Gmail, Meet) into a single `google` integration.

  * Hardcode `connectionMode: "hosted_oauth"` and `auth: { type: "oauth", scopes: [...] }` for all entries.

  * Remove `CONNECTORS` entries for unsupported providers (Postgres, HubSpot, CSV, etc.).

* **Modify** **`lib/integrations/types.ts`**:

  * Restrict `ConnectionMode` to `"hosted_oauth"`.

  * Remove unused auth types if applicable.

## 2. OAuth Configuration

* **Modify** **`lib/integrations/oauthProviders.ts`**:

  * Replace the extensive `OAUTH_PROVIDERS` object with a strict list of the 6 allowed providers.

  * **Google**: Create a single `google` entry with combined scopes:

    * `https://www.googleapis.com/auth/spreadsheets`

    * `https://www.googleapis.com/auth/documents`

    * `https://www.googleapis.com/auth/gmail.readonly` (or appropriate)

    * `https://www.googleapis.com/auth/meetings.space.readonly`

  * Ensure `connectionMode` is `hosted_oauth` for all.

  * Verify `localhostStrategy` matches requirements (usually loopback).

## 3. Connector Cleanup

* **Delete Unused Connectors**:

  * `lib/integrations/connectors/csv.ts`

  * `lib/integrations/connectors/hubspot.ts`

  * `lib/integrations/connectors/postgres.ts`

  * `lib/integrations/connectors/generic-api.ts`

* **Retain**: `lib/integrations/connectors/stripe.ts` (as it is Phase 1).

* **Note**: Other Phase 1 integrations (GitHub, Slack, etc.) will be registered but may not have data-fetching connector classes yet (which is acceptable for Phase 1 connectivity focus).

## 4. Chat Orchestration & Planning

* **Modify** **`lib/ai/chat-planner.ts`**:

  * Update `VALID_INTEGRATION_IDS` to `stripe, github, slack, notion, linear, google`.

  * Update `SYSTEM_PROMPT` to explicitly list *only* these 6 and forbid others.

* **Modify** **`lib/ai/tool-chat.ts`**:

  * Verify `processToolChat` logic correctly handles the consolidated `google` ID.

  * Ensure strict "Connect" button rendering (already implemented, but verifying scope).

## 5. Backend Logic (OAuth Flow)

* **Modify** **`app/api/oauth/start/route.ts`**:

  * Remove all `byo_oauth_app` logic.

  * Remove API key logic.

  * Simplify to: `Integration ID` -> `Env Vars (CLIENT_ID/SECRET)` -> `Redirect`.

  * Fail loudly if env vars are missing.

## 6. UI Cleanup

* **Modify** **`components/dashboard/chat-panel.tsx`**:

  * Remove "Inline Credential Modal" state and logic (`modalOpen`, `handleModalSubmit`, etc.).

  * Remove "BYO OAuth" redirect logic.

  * Simplify `handleConnectClick` to a pure redirect to `/api/oauth/start`.

## 7. Verification

* Run `npm run typecheck` to catch any dangling references to removed integrations.

* Run `npm run lint`.

* Verify "Connect" button behavior for Phase 1 integrations.

