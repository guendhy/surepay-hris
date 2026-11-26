import { beforeAll, describe, expect, it } from "vitest";
import { createDb, createDepartment, createPerson, futureMonday, grantLeave, leaveTypeId, type Db } from "./harness";

type Person = { employeeId: string; userId: string };

let db: Db;
let sam: Person; // supervisor of Emma
let emma: Person;
let ed: Person; // other department
let hana: Person; // HR manager
let ada: Person; // super admin
let aud: Person; // auditor
let emmaLeave: string;

async function count(user: Person | null, sql: string, params: unknown[] = [], aal: "aal1" | "aal2" = "aal1") {
  return db.as(user?.userId ?? null, async () => {
    const { rows } = await db.query(sql, params);
    return rows.length;
  }, { aal });
}

beforeAll(async () => {
  db = await createDb();
  await db.query("delete from public.holidays");
  const eng = await createDepartment(db, "ENG");
  const fin = await createDepartment(db, "FIN");
  sam = await createPerson(db, { firstName: "Sam", email: "sam@x.test", departmentId: eng, roles: ["supervisor"] });
  emma = await createPerson(db, { firstName: "Emma", email: "emma@x.test", departmentId: eng, supervisorId: sam.employeeId });
  ed = await createPerson(db, { firstName: "Ed", email: "ed@x.test", departmentId: fin });
  hana = await createPerson(db, { firstName: "Hana", email: "hana@x.test", roles: ["hr_manager"] });
  ada = await createPerson(db, { firstName: "Ada", email: "ada@x.test", roles: ["super_admin"] });
  aud = await createPerson(db, { firstName: "Aud", email: "aud@x.test", roles: ["auditor"] });

  for (const p of [emma, ed]) {
    await db.query(
      "insert into public.employee_compensation (employee_id, basic_salary, effective_date) values ($1, 50000, '2026-01-01')",
      [p.employeeId],
    );
  }
  await grantLeave(db, emma.employeeId, "VL", 10);
  const vl = await leaveTypeId(db, "VL");
  const monday = futureMonday(21);
  emmaLeave = await db.as(emma.userId, async () => {
    const { rows } = await db.query<{ id: string }>(
      "select public.submit_leave_request($1, $2::date, $2::date, 'full', 'test') as id",
      [vl, monday],
    );
    return rows[0].id;
  });
});

describe("employee records", () => {
  it("employees see only their own full record", async () => {
    expect(await count(emma, "select 1 from public.employees where id = $1", [emma.employeeId])).toBe(1);
    expect(await count(emma, "select 1 from public.employees where id = $1", [ed.employeeId])).toBe(0);
  });

  it("supervisors use the directory, not full records, for their team", async () => {
    expect(await count(sam, "select 1 from public.employees where id = $1", [emma.employeeId])).toBe(0);
    expect(await count(sam, "select 1 from public.get_employee_directory() where id = $1", [emma.employeeId])).toBe(1);
  });

  it("HR sees every record", async () => {
    expect(await count(hana, "select 1 from public.employees")).toBeGreaterThanOrEqual(6);
  });

  it("employees cannot edit their own record directly", async () => {
    const changed = await db.as(emma.userId, async () => {
      const r = await db.query("update public.employees set last_name = 'Hacked' where id = $1", [emma.employeeId]);
      return r.affectedRows;
    });
    expect(changed).toBe(0);
  });

  it("anonymous users get nothing", async () => {
    await expect(count(null, "select 1 from public.employees")).rejects.toThrow(/permission denied/);
  });
});

describe("compensation (MFA-gated)", () => {
  it("an employee sees their own salary but not a colleague's", async () => {
    expect(await count(emma, "select 1 from public.employee_compensation where employee_id = $1", [emma.employeeId])).toBe(1);
    expect(await count(emma, "select 1 from public.employee_compensation where employee_id = $1", [ed.employeeId])).toBe(0);
  });

  it("HR needs an MFA (aal2) session to see salaries", async () => {
    expect(await count(hana, "select 1 from public.employee_compensation", [], "aal1")).toBe(0);
    expect(await count(hana, "select 1 from public.employee_compensation", [], "aal2")).toBe(2);
  });

  it("super admins have no salary access by default", async () => {
    expect(await count(ada, "select 1 from public.employee_compensation", [], "aal2")).toBe(0);
  });
});

describe("leave data", () => {
  it("cannot be written directly, only through the functions", async () => {
    const vl = await leaveTypeId(db, "VL");
    await expect(
      db.as(emma.userId, () =>
        db.query(
          `insert into public.leave_ledger_entries (employee_id, leave_type_id, entry_type, days, effective_date)
           values ($1, $2, 'adjustment', 100, '2026-01-01')`,
          [emma.employeeId, vl],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      db.as(emma.userId, () =>
        db.query(
          `insert into public.leave_requests (request_no, employee_id, leave_type_id, start_date, end_date, days)
           values ('X', $1, $2, '2030-01-01', '2030-01-01', 1)`,
          [emma.employeeId, vl],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("supervisors see their team's requests but not other departments'", async () => {
    expect(await count(sam, "select 1 from public.leave_requests where id = $1", [emmaLeave])).toBe(1);
    expect(await count(ed, "select 1 from public.leave_requests where id = $1", [emmaLeave])).toBe(0);
  });

  it("HR cannot adjust their own balance", async () => {
    const vl = await leaveTypeId(db, "VL");
    await expect(
      db.as(hana.userId, () =>
        db.query("select public.adjust_leave_balance($1, $2, 5, 'bonus')", [hana.employeeId, vl]),
      ),
    ).rejects.toThrow(/own leave balance/);
  });
});

describe("roles and audit", () => {
  it("only super admins with MFA can grant roles, and never to themselves", async () => {
    const grant = (who: Person, target: string, aal: "aal1" | "aal2") =>
      db.as(who.userId, () =>
        db.query(
          "insert into public.user_roles (user_id, role_id) select $1, id from public.roles where code = 'hr_staff'",
          [target],
        ), { aal });
    await expect(grant(hana, emma.userId, "aal2")).rejects.toThrow(/row-level security/);
    await expect(grant(ada, emma.userId, "aal1")).rejects.toThrow(/row-level security/);
    await expect(grant(ada, ada.userId, "aal2")).rejects.toThrow(/row-level security/);
    const newHire = await createPerson(db, { firstName: "Nia", email: "nia@x.test" });
    await grant(ada, newHire.userId, "aal2");
  });

  it("records changes in the audit log, readable only by auditors/admins with MFA", async () => {
    expect(await count(aud, "select 1 from public.audit_log where table_name = 'leave_requests'", [], "aal2")).toBeGreaterThan(0);
    expect(await count(aud, "select 1 from public.audit_log", [], "aal1")).toBe(0);
    expect(await count(hana, "select 1 from public.audit_log", [], "aal2")).toBe(0);
  });

  it("the audit log is append-only, even for the database owner", async () => {
    await expect(db.query("update public.audit_log set action = 'x'")).rejects.toThrow(/append-only/);
    await expect(db.query("delete from public.audit_log")).rejects.toThrow(/append-only/);
  });

  it("deactivates the login when an employee is separated", async () => {
    await db.as(hana.userId, () =>
      db.query("update public.employees set employment_status = 'separated', separation_date = '2026-11-30' where id = $1", [ed.employeeId]),
    );
    const { rows } = await db.query<{ is_active: boolean }>("select is_active from public.profiles where id = $1", [ed.userId]);
    expect(rows[0].is_active).toBe(false);
  });
});

describe("file storage", () => {
  const insertFile = (who: Person, path: string) =>
    db.as(who.userId, () =>
      db.query("insert into storage.objects (bucket_id, name) values ('employee-files', $1)", [path]),
    );

  it("employees upload only into their own folder", async () => {
    await insertFile(emma, `${emma.employeeId}/leave/med.pdf`);
    await insertFile(emma, `${emma.employeeId}/documents/nbi.pdf`);
    await expect(insertFile(emma, `${sam.employeeId}/leave/x.pdf`)).rejects.toThrow(/row-level security/);
  });

  it("supervisors can open team leave attachments but not personal documents", async () => {
    expect(await count(sam, "select 1 from storage.objects where name = $1", [`${emma.employeeId}/leave/med.pdf`])).toBe(1);
    expect(await count(sam, "select 1 from storage.objects where name = $1", [`${emma.employeeId}/documents/nbi.pdf`])).toBe(0);
    expect(await count(hana, "select 1 from storage.objects where bucket_id = 'employee-files'")).toBe(2);
  });
});
