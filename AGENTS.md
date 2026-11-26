<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Project conventions (Surepay HRIS)

- Requirements and phase plan: `docs/HRIS_BUILD_PROMPT.md`. Architecture: `docs/ARCHITECTURE.md`.
- Business rules that must not be bypassed live in Postgres (`supabase/migrations`), with RLS on every table. Add a new migration file; never edit an applied one.
- Server Actions: `authorizeAction()` → Zod validation → Supabase call → `revalidatePath`. Return `ActionState` (`lib/action.ts`).
- Never import `lib/supabase/admin.ts` outside cron/invite code; it bypasses RLS.
- Money is `numeric` in Postgres and strings in TypeScript — no float arithmetic.
- Dates use Asia/Manila (`private.today()` in SQL, `todayManila()` in TS).
- Run `npm run check` before committing; database tests run the real migrations in PGlite.
