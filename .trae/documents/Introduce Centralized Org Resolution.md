# Introduce Centralized Org Resolution (Phase 13)

I will implement a robust, server-side organization resolution system that guarantees every user has a valid organization context.

## Implementation Steps

### 1. Database Schema Update
**File:** `supabase/migrations/20251230260000_auth_triggers.sql`
- Enhance the existing `handle_new_user` trigger:
  - Ensure it runs for **both** email/password and OAuth signups.
  - Make it idempotent (don't create dupes if retried).
  - Explicitly insert into `public.memberships` immediately.

### 2. Update Permissions Logic (Central Resolution)
**File:** `lib/auth/permissions.ts`
- Enhance `getSessionContext` to robustly resolve `orgId`:
  - 1. Check existing session cache.
  - 2. Query `memberships` table (single source of truth).
  - 3. If no membership found, **attempt auto-provisioning** (fail-safe for legacy/broken users).
  - 4. Throw clear error if resolution fails.
- Remove any reliance on JWT `app_metadata`.

### 3. Middleware Update (Route Protection)
**File:** `middleware.ts` (if exists) or create one.
- Ensure all `/dashboard/*` and `/api/*` routes check for authentication.
- (Optional) We can preload org context here, but usually doing it in `lib/auth` is safer/cleaner for Next.js App Router.

### 4. Integration Verification
**File:** `app/auth/callback/route.ts`
- Ensure OAuth callback handles the "first login" race condition by waiting for the trigger or manually provisioning if needed.

## Verification Plan
1.  **Signup:** Create a new user via Email/Password. Verify `org_id` is resolved in Dashboard.
2.  **OAuth:** Mock an OAuth login. Verify org creation.
3.  **RLS:** Run a query against `metrics` table. Verify it succeeds (implies Org ID was correctly passed to RLS policy via `auth.uid()` + membership check).
4.  **No-Org:** Manually delete a user's membership. Try to load dashboard. Verify it errors or (better) auto-reprovisions.
