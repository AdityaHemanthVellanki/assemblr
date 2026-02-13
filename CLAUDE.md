# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Assemblr is an AI-powered SaaS platform that transforms natural language into internal dashboards and tools. Users describe what they need in chat, and the system generates executable tool specifications backed by third-party integrations (GitHub, Slack, Notion, Linear, Google, HubSpot, Stripe, etc.).

## Commands

```bash
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript type checking (tsc --noEmit)
npm run format       # Check formatting with Prettier
npm run format:write # Auto-fix formatting
npm run ai:test      # Smoke tests for AI/planner features
npm run test:e2e:real # E2E tests with real credentials (requires setup-env.cjs)
```

## Tech Stack

- **Framework:** Next.js 16.1.1 (App Router) with React 19.2.3 and React Compiler
- **Language:** TypeScript (strict mode), path alias `@/*` maps to project root
- **AI:** Azure OpenAI (via `openai` SDK), locked to API version `2024-08-01-preview`
- **Database:** Supabase (PostgreSQL) with Prisma 6.x for schema definition
- **Auth:** Supabase Auth with SSR cookie-based sessions
- **UI:** Tailwind CSS 4, shadcn/ui-style Radix primitives, Framer Motion
- **Integrations:** Composio SDK as the universal integration runtime
- **Validation:** Zod 4.x for all runtime schema validation
- **Styling convention:** `class-variance-authority` + `clsx` + `tailwind-merge`

## Architecture

### Request Flow: Natural Language to Tool

1. User sends a message in chat → `POST /api/tools/[toolId]/chat`
2. **Chat planner** (`lib/ai/chat-planner.ts`) detects intent (integration request vs tool generation)
3. **Tool chat** (`lib/ai/tool-chat.ts`) orchestrates: spec generation → compilation → execution
4. Azure OpenAI generates a **tool spec** validated against `ToolSystemSpec` (Zod schemas in `lib/toolos/spec.ts`)
5. **Materialization** (`lib/toolos/materialization.ts`) assembles data snapshots and views
6. **Lifecycle** (`lib/toolos/lifecycle.ts`) finalizes via state machine: `INIT → GENERATING → READY → MATERIALIZED`
7. UI polls `/api/tools/[toolId]/result` at 1.5s intervals for async completion

### Key Modules

| Directory | Purpose |
|---|---|
| `lib/ai/` | Azure OpenAI client, chat planner, spec generation prompts, tool-chat orchestrator |
| `lib/toolos/` | **Tool OS** — spec schemas, runtime execution, lifecycle state machine, materialization, memory/state stores |
| `lib/integrations/` | Integration registry, Composio adapter, OAuth config, capability discovery |
| `lib/supabase/` | Supabase clients (server, client, admin, middleware) |
| `lib/core/` | Runtime interfaces, security guards, permission system, error types |
| `lib/env/` | Zod-validated environment configuration (server.ts, client.ts) |
| `lib/security/` | Rate limiting (per-user-per-tool), credential encryption |
| `components/ui/` | Reusable Radix-based primitives (shadcn pattern) |
| `components/dashboard/` | Chat panel, tool renderer, sidebar, workspace, component registry |

### Integration Architecture

All external integrations route through Composio as the universal runtime:
- `lib/integrations/composio/config.ts` — maps Assemblr integration IDs to Composio app names
- `lib/integrations/composio/execution.ts` — executes actions via Composio entity API
- `lib/integrations/composio/connection.ts` — manages OAuth connections
- OAuth tokens are encrypted at rest in `BrokerConnection` table using `DATA_ENCRYPTION_KEY`

### Database

- Schema defined in `prisma/schema.prisma`, migrations managed via Supabase
- Key models: `Organization`, `User`, `Project` (holds tool spec as JSON), `BrokerConnection` (encrypted integration tokens), `ToolVersion`
- Multi-tenancy enforced via org-scoped queries and Supabase RLS
- IDs use CUID format

### Auth & Middleware

- `middleware.ts` refreshes Supabase sessions on every request
- Protected routes: `/app/*`, `/dashboard/*` redirect to login if unauthenticated
- Org-level roles: `OWNER`, `EDITOR`, `VIEWER` (checked via `lib/permissions.ts`)

## Environment Setup

`RUNTIME_ENV` must be explicitly set — there is no auto-detection. For local development, set `RUNTIME_ENV=DEV_WITH_REAL_CREDS` in `.env.local`.

Required env vars: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT_NAME`.

The env system also accepts Supabase aliases (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) and maps them automatically in `lib/env/server.ts`.

## Conventions

- **Files:** kebab-case (`chat-planner.ts`). **Exports:** PascalCase for components, camelCase for functions, UPPER_SNAKE_CASE for constants.
- **API responses:** Use `jsonResponse()` / `errorResponse()` helpers from `lib/api/response.ts`.
- **Singletons:** Azure OpenAI client and Supabase clients use cached singleton patterns — never instantiate new clients directly.
- **Tool finalization:** Always goes through `finalizeToolExecution()` in `lib/toolos/lifecycle.ts` — this is the single point of state transition.
- **Concurrent execution:** `requestCoordinator.run(key, fn)` mutex pattern serializes per-user-per-tool actions in `lib/toolos/runtime.ts`.
- **Formatting:** Semicolons, double quotes, trailing commas (Prettier config).
- **ESLint:** TypeScript `any` and `@ts-` comments are allowed in current config.
