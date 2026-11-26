# Setup — Supabase, Vercel, email and first administrator

You create the accounts and keys yourself; nothing in this repository contains secrets. Use **separate Supabase projects** for staging and production.

## 1. Supabase project

1. Create a project at supabase.com. **Region: Southeast Asia (Singapore)**. Plan: Pro or higher for production (needed for Point-in-Time Recovery).
2. **Project Settings → API Keys**: copy the project URL, the *publishable* key and the *secret* key into `.env.local` (and later into Vercel).
3. Apply the schema:
   ```bash
   npx supabase login
   npx supabase link --project-ref YOUR-PROJECT-REF
   npm run db:push
   ```
4. **Authentication → Sign In / Providers**
   - Email: enabled. **Allow new users to sign up: OFF** (employees are invited by HR).
   - Minimum password length 12; require letters and digits.
5. **Authentication → Multi-Factor**: enable **TOTP (App Authenticator)**.
6. **Authentication → URL Configuration**
   - Site URL: your production URL, e.g. `https://hris.your-domain`
   - Redirect URLs: `https://hris.your-domain/auth/callback`, `https://hris.your-domain/auth/confirm`, and for previews `https://*-your-team.vercel.app/auth/callback`
7. **Authentication → Email Templates** — point links at the app (recommended):
   - *Invite user*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/me/password`
   - *Reset password*: `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/me/password`
8. **Authentication → SMTP**: use your company mail provider for auth emails (the built-in sender is rate-limited).
9. **Database → Backups**: enable **Point-in-Time Recovery** on production and test a restore into a scratch project.
10. **Advisors**: run the Security and Performance advisors and resolve any findings before go-live.
11. Restrict sign-ins to the company domain (SQL editor):
    ```sql
    update public.app_settings set value = '["your-company-domain.com"]' where key = 'allowed_email_domains';
    ```

## 2. First administrator

1. In the SQL editor, create your own 201 record (use your real work email):
   ```sql
   insert into public.employees (first_name, last_name, work_email, date_hired, employment_type)
   values ('First', 'Last', 'you@your-company-domain.com', '2020-01-01', 'regular');
   ```
2. **Authentication → Users → Invite user** with the same email. Accept the invite and set a password. The database links the login to your record and gives you the Employee role.
3. Grant yourself the admin roles (SQL editor runs as the database owner, so the self-grant rule does not apply here):
   ```sql
   insert into public.user_roles (user_id, role_id)
   select p.id, r.id from public.profiles p, public.roles r
   where p.email = 'you@your-company-domain.com' and r.code in ('super_admin', 'hr_manager');
   ```
4. Sign in again — you'll be asked to enrol an authenticator app. From then on, grant roles from **Admin → Users & roles**.

> Segregation of duties: give Super Admin to IT, HR Manager to HR. One person holding both is fine for setup, but split them before go-live.

## 3. Vercel

1. Push this repository to GitHub and import it in Vercel. Framework: Next.js. Region is set to `sin1` in `vercel.json`.
2. **Settings → Environment Variables** — set for **Production** and **Preview** separately (Preview points at the *staging* Supabase project):

   | Variable | Notes |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | project URL |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | publishable key |
   | `SUPABASE_SECRET_KEY` | secret key — mark **Sensitive** |
   | `NEXT_PUBLIC_APP_URL` | e.g. `https://hris.your-domain` |
   | `FIELD_ENCRYPTION_KEY` | `npm run gen:key`; different per environment; store a copy in the company vault — **Sensitive** |
   | `CRON_SECRET` | long random string — **Sensitive** |
   | `RESEND_API_KEY`, `EMAIL_FROM` | optional, for notification emails |
   | `NEXT_PUBLIC_SSO_PROVIDER` | `google`, `azure` or `none` |

3. Cron jobs (`vercel.json`) run `/api/cron/daily` at 00:05 Manila and `/api/cron/year-end` on 1 January. Vercel sends the `CRON_SECRET` automatically.
4. Add your domain and confirm HTTPS.

## 4. Email notifications (optional)

Create a Resend account, verify your sending domain (SPF/DKIM), then set `RESEND_API_KEY` and `EMAIL_FROM`. Without them, notifications still appear in the app; queued emails are marked *skipped*.

## 5. Single sign-on (optional)

- **Google Workspace**: Supabase → Authentication → Providers → Google; create an OAuth client in Google Cloud restricted to your Workspace. Set `NEXT_PUBLIC_SSO_PROVIDER=google`.
- **Microsoft 365**: Providers → Azure; register an app in Entra ID (single tenant). Set `NEXT_PUBLIC_SSO_PROVIDER=azure`.

Invite the employee first (or keep sign-ups off and enable *Manual linking*), so SSO logins link to existing 201 records.

## 6. Local development without a hosted project

Install Docker and run `npx supabase start` — it uses `supabase/config.toml` and applies the migrations. Copy the printed API URL and keys into `.env.local`. Emails sent by Supabase Auth appear in Inbucket at http://localhost:54324.
