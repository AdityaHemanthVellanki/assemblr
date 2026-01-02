# Introduce Schema & Capability Layer

I will implement a comprehensive schema discovery and validation system to ensure Assemblr relies on real, authoritative data structures.

## Implementation Steps

### 1. Define Canonical Schema Model
**File:** `lib/schema/types.ts`
- Define `DiscoveredSchema`:
  - `integrationId`: string
  - `resource`: string (e.g., "issues", "messages")
  - `fields`: Array<{ name, type, nullable, description }>
  - `lastDiscoveredAt`: string
- Ensure schemas are serializable and persistent.

### 2. Implement Schema Discovery
**Files:** `lib/integrations/schema-discovery/*`
- Create `SchemaDiscoverer` interface.
- Implement for each integration:
  - **GitHub:** `discoverSchemas()` -> returns schema for issues, repos.
  - **Linear:** `discoverSchemas()` -> returns schema for issues, teams.
  - **Slack:** `discoverSchemas()` -> returns schema for channels, messages.
  - **Notion:** `discoverSchemas()` -> returns schema for pages/databases.
  - **Google:** `discoverSchemas()` -> returns schema for drive, gmail.
- Logic: Fetch real metadata from APIs (e.g., GitHub issue fields, Linear GraphQL schema introspection or hardcoded known fields if API is limited).

### 3. Persist Schemas
**File:** `lib/schema/store.ts`
- Since we don't have a dedicated DB table for schemas in the prompt requirements (implied "Stores schemas"), I will create a new Supabase table `integration_schemas` via migration or store in `integration_connections` metadata if simpler.
- **Decision:** Store in a new table `integration_schemas` for cleaner separation.
- **Migration:** Create SQL migration for `integration_schemas` table.

### 4. Integrate with AI Planner
**File:** `lib/ai/tool-chat.ts`
- Update `SYSTEM_PROMPT` to include "Available Schemas".
- Inject discovered schemas into the prompt context.
- **Strict Rule:** "You must ONLY use fields defined in the 'Available Schemas' section."

### 5. Trigger Discovery
**File:** `app/actions/schema.ts`
- Create `refreshSchemas(orgId)` action.
- Call this action:
  - After OAuth callback success.
  - When user manually clicks "Refresh Data" (UI).

### 6. Validation
**File:** `lib/execution/validation.ts`
- Create `validateSpecAgainstSchema(spec, schemas)`.
- Check if `table` and `field` exist in discovered schemas.
- Block execution if validation fails.

## Verification Plan
1.  **Discovery:** Run `refreshSchemas` for a connected integration (e.g., GitHub) and verify `integration_schemas` is populated.
2.  **AI Generation:** Chat "Show me issues" and verify the generated spec uses correct fields from the discovered schema.
3.  **Validation:** Manually create an invalid spec (referencing "fake_field") and verify execution is blocked.
