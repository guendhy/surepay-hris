# Surepay HRIS

Human Resource Information System for **Surepay Technologies Inc.** — Next.js (App Router) + Supabase + Vercel.

This repository contains **Phase 1 — Foundation & Leave** of the plan in [docs/HRIS_BUILD_PROMPT.md](docs/HRIS_BUILD_PROMPT.md).

## What's in Phase 1

| Area | Included |
|---|---|
| Sign-in & security | Email/password and optional Google/Microsoft SSO, mandatory authenticator-app MFA for HR, payroll, finance, auditor and admin roles, idle sign-out, security headers/CSP |
| Access control | Roles & permissions in Postgres, Row Level Security on every table, MFA-gated access to salaries, government IDs and the audit log, segregation rules (no self-approval, no self-role-grant, no self-balance-adjustment) |
| Audit | Append-only audit log of every HR data change plus sign-ins, MFA, exports, sensitive-data views and file access |
| Employees (201 file) | Records, auto employee numbers, encrypted government IDs (reveal is logged), compensation with salary history, documents with expiry, automatic movement history, invitations, login deactivated on separation |
| Organisation | Departments (with heads), positions, job levels, locations |
| Calendar | PH holiday calendar (2026 seeded, flagged for verification), work schedules per employee |
| Leave | 12 configurable leave types (statutory + company), ledger-based balances, monthly/upfront/anniversary accruals, live day count and balance preview, eligibility, notice, back-dating, attachment and overlap rules, team-coverage warning, cancellation with reversal, HR adjustments, year-end carry-over / cash conversion / forfeiture |
| Approvals | Shared engine: supervisor → department head by default, configurable flows, delegation, escalation to HR, bulk approve, HR fallback |
| Self-service | Dashboard, my leave, my profile (contact details), delegation, team leave calendar, notifications (live), password change, installable PWA |
| HR tools | HR dashboard, leave requests, balance report with Excel export, announcements, settings, users & roles, audit log |
| Jobs | Daily accruals + escalations + email queue, year-end close (Vercel Cron) |

Not in Phase 1 (see the build prompt): attendance/DTR, payroll, government reports, onboarding/offboarding checklists, recruitment, performance, training, discipline, assets.

## Quick start

Prerequisites: Node.js 20.9+ and a Supabase project (or the Supabase CLI with Docker for a local stack).

```bash
npm install
cp .env.example .env.local        # fill in the values — see docs/SETUP.md
npm run gen:key                   # paste the output into FIELD_ENCRYPTION_KEY
npx supabase link --project-ref YOUR-PROJECT-REF
npm run db:push                   # applies supabase/migrations
npm run dev
```

Then follow **docs/SETUP.md → "First administrator"** to give yourself the Super Admin and HR Manager roles.

For a demo with fake employees: set `DEMO_PASSWORD` in `.env.local` and run `npm run seed:demo` (local or staging only — the script refuses to touch any other project).

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run check` | Type-check, lint and all tests |
| `npm test` | Unit tests + database tests (real migrations in PGlite — no Docker needed) |
| `npm run db:push` | Apply migrations to the linked Supabase project |
| `npm run db:types` | Generate `lib/database.types.ts` from the linked project |
| `npm run seed:demo` | Fake demo data (local/staging only) |
| `npm run gen:key` | Generate a field-encryption key |

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — Supabase, Vercel, email, SSO and first-admin setup
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data model, how leave and approvals work
- [docs/SECURITY.md](docs/SECURITY.md) — controls mapped to ISO 27001 / Data Privacy Act, key rotation
- [docs/HR-GUIDE.md](docs/HR-GUIDE.md) — how HR, managers and employees use the system
- [docs/UAT-PHASE1.md](docs/UAT-PHASE1.md) — user acceptance test checklist for HR
- [docs/HRIS_BUILD_PROMPT.md](docs/HRIS_BUILD_PROMPT.md) — the full requirements and phase plan

## Before go-live

1. Confirm every **leave type** credit and rule with HR/legal (Settings → Leave types).
2. **Verify each holiday** against the official Proclamation and add Eid'l Fitr / Eid'l Adha when announced.
3. Set **allowed email domains** (`app_settings.allowed_email_domains`) to the company domain.
4. Turn on **Point-in-Time Recovery** and confirm a backup restore on the production Supabase project.
5. Load opening leave balances (employee → Leave tab → Adjust balance → Opening balance).
6. Complete the UAT checklist.
