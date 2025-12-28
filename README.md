# Assemblr

Assemblr is an AI SaaS that turns natural language into internal dashboards and tools.

Stage 0 ships a secure foundation only: auth, org-aware users, repo structure, and deployment-ready configuration.

## Quickstart (local)

1. Install dependencies

```bash
npm install
```

2. Create your env file

```bash
cp .env.example .env
```

3. Start Postgres, run migrations + seed, and boot the app

```bash
npm run dx
```

Open http://localhost:3000

## Auth

Assemblr uses NextAuth with:

- Email magic links (in dev, links are printed to the server console)
- GitHub OAuth (optional)

To enable GitHub OAuth, set `GITHUB_ID` and `GITHUB_SECRET` in `.env`.

## Folder structure

- `app/`: Next.js App Router routes, layouts, and API route handlers
- `components/`: UI and app components (shadcn-style primitives included)
- `lib/auth/`: NextAuth configuration and helpers
- `lib/db/`: Prisma client setup
- `lib/env/`: runtime env validation (Zod)
- `lib/ui/`: shared UI utilities
- `prisma/`: Prisma schema, migrations, and seed script
- `styles/`: global styles and theme tokens

## Useful commands

- `npm run dev`: start Next.js dev server
- `npm run dx`: start DB + migrate + seed + start dev server
- `npm run lint`: lint
- `npm run typecheck`: TypeScript typecheck
- `npm run format`: check formatting
- `npm run db:studio`: open Prisma Studio
