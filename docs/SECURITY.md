# Security and privacy controls

Employee data is personal and sensitive personal information under **RA 10173 (Data Privacy Act)**. The controls below support the ISO/IEC 27001 ISMS (Annex A references are indicative).

| Control | Implementation | ISO 27001:2022 |
|---|---|---|
| Least privilege | Granular permissions; RLS on every table; employees see only their own records, managers see team leave via functions that expose no personal data | A.5.15, A.8.3 |
| Strong authentication | Supabase Auth; TOTP MFA required (aal2) for HR, payroll, finance, auditor and super admin roles — enforced in the app **and** in RLS for salaries, government IDs, role changes and the audit log | A.5.17, A.8.5 |
| Segregation of duties | Nobody approves their own request, grants their own roles, or adjusts their own leave balance (enforced in SQL) | A.5.3 |
| Session management | Idle sign-out (default 15 min, `app_settings.session_idle_minutes`), refresh-token rotation, POST-only sign-out | A.8.5 |
| Access revocation | Separating an employee deactivates their login immediately (trigger); admins can disable accounts | A.5.18 |
| Encryption in transit | HTTPS only (HSTS preload) | A.8.24 |
| Encryption at rest | Supabase disk encryption + application-level AES-256-GCM for government IDs and bank accounts (`lib/crypto.ts`); only last 4 digits stored in clear | A.8.24 |
| Logging | Append-only `audit_log` (row changes with before/after values, sign-ins, MFA, exports, sensitive views, file access, cron runs). Update/delete/truncate blocked by trigger | A.8.15 |
| Secure development | Zod validation, parameterised queries (PostgREST), CSP and security headers, no secrets in code, `server-only` guards for privileged code | A.8.25–A.8.28 |
| File handling | Private bucket, type/size allow-list, sanitised names, 60-second signed URLs, access logged | A.8.12 |
| Test data | Demo seed uses fake people and refuses to run against non-local projects unless explicitly allowed (staging) | A.8.33 |
| Backup | Supabase daily backups + PITR on production; Vercel instant rollback | A.8.13 |
| Data residency | Supabase and Vercel functions in Singapore — disclose in the privacy notice as a cross-border transfer | DPA §21 |

## Key management — `FIELD_ENCRYPTION_KEY`

- One key per environment, generated with `npm run gen:key`, stored in Vercel as a *Sensitive* variable and in the company password vault.
- **Losing the key makes stored government IDs and bank accounts unreadable.** Back it up before go-live.
- Rotation: add a `v2` key and version prefix in `lib/crypto.ts`, write a one-off script that decrypts with v1 and re-encrypts with v2 for every `*_enc` column, deploy, then remove v1. Record the rotation in the ISMS change log.

## Operational checklist

- [ ] Allowed email domains set; public sign-ups disabled
- [ ] TOTP MFA enabled in Supabase; all privileged users enrolled
- [ ] Supabase Security Advisor clean
- [ ] PITR enabled and a restore tested
- [ ] Encryption key and `CRON_SECRET` stored in the vault
- [ ] Privacy notice updated (purposes, retention, Singapore hosting)
- [ ] Quarterly access review using **Admin → Users & roles** and the audit log

## Known gaps (planned)

- Retention/disposal jobs and data-subject request tooling — Phase 4.
- Nonce-based CSP (currently allows inline scripts required by Next.js).
- Failed sign-in attempts are recorded in Supabase Auth logs, not yet copied into `audit_log`.
