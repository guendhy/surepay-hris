/**
 * Database test harness.
 *
 * Runs the real Supabase migrations inside PGlite (Postgres compiled to WASM),
 * so leave rules, the approval engine and RLS policies can be tested without
 * Docker or a Supabase project. A small shim recreates the parts of Supabase
 * the migrations depend on: the auth schema (users, uid(), jwt()), the API
 * roles (anon / authenticated / service_role) and the storage schema.
 */
import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SUPABASE_SHIM = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`;

export type Db = PGlite & {
  /** Run `fn` as a signed-in user (RLS applies). */
  as<T>(userId: string | null, fn: () => Promise<T>, opts?: { aal?: "aal1" | "aal2" }): Promise<T>;
  /** Run `fn` with the service role (bypasses RLS, like cron jobs). */
  asService<T>(fn: () => Promise<T>): Promise<T>;
};

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

export async function createDb(): Promise<Db> {
  const pg = (await PGlite.create()) as unknown as Db;
  await pg.exec(SUPABASE_SHIM);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await pg.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }

  pg.as = async (userId, fn, opts) => {
    const claims = JSON.stringify(
      userId ? { sub: userId, role: "authenticated", aal: opts?.aal ?? "aal1" } : { role: "anon" },
    );
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    await pg.exec(userId ? "set role authenticated" : "set role anon");
    try {
      return await fn();
    } finally {
      await pg.exec("reset role");
      await pg.query(`select set_config('request.jwt.claims', '', false)`);
    }
  };

  pg.asService = async (fn) => {
    await pg.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ role: "service_role" }),
    ]);
    await pg.exec("set role service_role");
    try {
      return await fn();
    } finally {
      await pg.exec("reset role");
      await pg.query(`select set_config('request.jwt.claims', '', false)`);
    }
  };

  return pg;
}

// ---------------------------------------------------------------------------
// Fixture helpers (run as the superuser, outside RLS)
// ---------------------------------------------------------------------------

export async function createUser(db: Db, email: string, roles: string[] = []): Promise<string> {
  const id = randomUUID();
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, email.toLowerCase()]);
  for (const role of roles) {
    await db.query(
      `insert into public.user_roles (user_id, role_id) select $1, id from public.roles where code = $2`,
      [id, role],
    );
  }
  return id;
}

type EmployeeInput = {
  firstName: string;
  lastName?: string;
  email: string;
  dateHired?: string;
  departmentId?: string | null;
  supervisorId?: string | null;
  sex?: "male" | "female";
  civilStatus?: string;
  employmentType?: string;
  isSoloParent?: boolean;
};

export async function createEmployee(db: Db, input: EmployeeInput): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.employees
       (first_name, last_name, work_email, date_hired, department_id, supervisor_id, sex,
        civil_status, employment_type, is_solo_parent)
     values ($1, $2, $3, $4, $5, $6, $7, $8::public.civil_status, $9::public.employment_type, $10)
     returning id`,
    [
      input.firstName,
      input.lastName ?? "Test",
      input.email.toLowerCase(),
      input.dateHired ?? "2024-01-15",
      input.departmentId ?? null,
      input.supervisorId ?? null,
      input.sex ?? "female",
      input.civilStatus ?? "single",
      input.employmentType ?? "regular",
      input.isSoloParent ?? false,
    ],
  );
  return rows[0].id;
}

/** Creates an employee and a linked login in one go. */
export async function createPerson(
  db: Db,
  input: EmployeeInput & { roles?: string[] },
): Promise<{ employeeId: string; userId: string }> {
  const employeeId = await createEmployee(db, input);
  const userId = await createUser(db, input.email, input.roles ?? []);
  return { employeeId, userId };
}

export async function createDepartment(db: Db, code: string, headEmployeeId?: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.departments (code, name, head_employee_id) values ($1, $1, $2) returning id`,
    [code, headEmployeeId ?? null],
  );
  return rows[0].id;
}

export async function leaveTypeId(db: Db, code: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`select id from public.leave_types where code = $1`, [code]);
  return rows[0].id;
}

export async function grantLeave(db: Db, employeeId: string, code: string, days: number): Promise<void> {
  await db.query(
    `insert into public.leave_ledger_entries (employee_id, leave_type_id, entry_type, days, effective_date, reason)
     select $1, id, 'opening_balance', $3, '2026-01-01', 'test' from public.leave_types where code = $2`,
    [employeeId, code, days],
  );
}

export async function balance(db: Db, employeeId: string, code: string): Promise<number> {
  const { rows } = await db.query<{ b: string }>(
    `select coalesce(sum(l.days), 0)::text as b
     from public.leave_ledger_entries l join public.leave_types t on t.id = l.leave_type_id
     where l.employee_id = $1 and t.code = $2`,
    [employeeId, code],
  );
  return Number(rows[0].b);
}

/** Next Monday on or after the given number of days from today (Manila date). */
export function futureMonday(minDaysAhead = 14): string {
  const d = new Date(Date.now() + 8 * 3600_000); // shift to Manila
  d.setUTCDate(d.getUTCDate() + minDaysAhead);
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
