# Automate Schema Discovery on Integration Connect (Phase 14)

I will implement the automated schema discovery pipeline that runs immediately upon successful integration connection.

## Implementation Steps

### 1. Define Schema Discovery Interface
**File:** `lib/schema/discovery.ts`
- Create `SchemaDiscoverer` interface.
- Implement `discoverSchemas(orgId, integrationId, credentials)` function that delegates to specific providers.

### 2. Implement Provider Discoverers
**Directory:** `lib/integrations/discovery/`
- `github.ts`: Fetch Repos, Issues, PRs, Users.
- `slack.ts`: Fetch Channels, Users.
- `notion.ts`: Fetch Databases, Pages.
- `linear.ts`: Fetch Issues, Projects, Cycles.
- `google.ts`: Fetch Sheets (headers), Calendar Events.

### 3. Update OAuth Callback
**File:** `app/api/oauth/callback/[provider]/route.ts`
- Call `discoverAndPersistSchemas` immediately after token storage.
- If discovery fails:
  - Mark integration as `error`.
  - Redirect with error parameter.
- If success:
  - Persist schemas.
  - Redirect to success page.

### 4. Implement Persistence Logic
**File:** `lib/schema/store.ts` (Enhance)
- `persistDiscoveredSchemas(orgId, integrationId, schemas)`:
  - Insert into `integration_schema_versions` (new table for versioning).
  - Update `integration_schemas` (current active view).
  - Use transaction/batch insert.

### 5. UI Feedback
**File:** `app/(dashboard)/integrations/page.tsx`
- Show "Discovering Schema..." state if integration is connected but no schema yet.
- Show "Schema Error" if discovery failed.

## Verification Plan
1.  **Mock Integration:** Create a mock "Test" integration.
2.  **Connect:** Trigger the connect flow.
3.  **Discovery:** Verify `discoverSchemas` is called.
4.  **Persistence:** Check `integration_schemas` table for populated rows.
5.  **Planner:** Verify planner can now "see" the new resources.
