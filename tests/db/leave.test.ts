import { beforeAll, describe, expect, it } from "vitest";
import {
  addDays,
  balance,
  createDb,
  createDepartment,
  createPerson,
  futureMonday,
  grantLeave,
  leaveTypeId,
  type Db,
} from "./harness";

type Person = { employeeId: string; userId: string };

let db: Db;
let dana: Person; // head of ENG
let sam: Person; // supervisor, reports to Dana
let emma: Person; // employee, reports to Sam
let ed: Person; // male, married, reports to Sam
let hana: Person; // HR manager
let eng: string;

const monday = futureMonday(21);

async function preview(user: Person, code: string, start: string, end: string, portion = "full") {
  const id = await leaveTypeId(db, code);
  return db.as(user.userId, async () => {
    const { rows } = await db.query<{ r: Record<string, unknown> }>(
      "select public.preview_leave_request($1, $2::date, $3::date, $4::public.day_portion) as r",
      [id, start, end, portion],
    );
    return rows[0].r as {
      days: number;
      errors: string[];
      warnings: string[];
      available: number;
      attachment_required: boolean;
    };
  });
}

async function submit(user: Person, code: string, start: string, end: string, portion = "full", attachment: string | null = null) {
  const id = await leaveTypeId(db, code);
  return db.as(user.userId, async () => {
    const { rows } = await db.query<{ id: string }>(
      "select public.submit_leave_request($1, $2::date, $3::date, $4::public.day_portion, 'test', $5) as id",
      [id, start, end, portion, attachment],
    );
    return rows[0].id;
  });
}

async function pendingTasks(leaveId: string) {
  const { rows } = await db.query<{ id: string; approver_user_id: string; step_order: number; delegated_from_user_id: string | null }>(
    `select t.id, t.approver_user_id, t.step_order, t.delegated_from_user_id
     from public.approval_tasks t
     join public.leave_requests l on l.approval_request_id = t.approval_request_id
     where l.id = $1 and t.status = 'pending' order by t.step_order`,
    [leaveId],
  );
  return rows;
}

async function act(user: Person, taskId: string, decision: string, comment: string | null = null) {
  return db.as(user.userId, () =>
    db.query("select public.act_on_approval_task($1, $2, $3)", [taskId, decision, comment]),
  );
}

async function leaveStatus(leaveId: string) {
  const { rows } = await db.query<{ status: string }>("select status from public.leave_requests where id = $1", [leaveId]);
  return rows[0].status;
}

beforeAll(async () => {
  db = await createDb();
  // Seeded holidays would make day counts depend on when the suite runs.
  await db.query("delete from public.holidays");
  dana = await createPerson(db, { firstName: "Dana", email: "dana@x.test", roles: ["department_head"] });
  eng = await createDepartment(db, "ENG", dana.employeeId);
  await db.query("update public.employees set department_id = $1 where id = $2", [eng, dana.employeeId]);
  sam = await createPerson(db, { firstName: "Sam", email: "sam@x.test", departmentId: eng, supervisorId: dana.employeeId, sex: "male", roles: ["supervisor"] });
  emma = await createPerson(db, { firstName: "Emma", email: "emma@x.test", departmentId: eng, supervisorId: sam.employeeId });
  ed = await createPerson(db, { firstName: "Ed", email: "ed@x.test", departmentId: eng, supervisorId: sam.employeeId, sex: "male", civilStatus: "married" });
  hana = await createPerson(db, { firstName: "Hana", email: "hana@x.test", roles: ["hr_manager"] });
  await grantLeave(db, emma.employeeId, "VL", 10);
  await grantLeave(db, dana.employeeId, "VL", 10);
});

describe("day counting", () => {
  it("counts Monday–Friday and skips the weekend", async () => {
    const r = await preview(emma, "VL", monday, addDays(monday, 6));
    expect(Number(r.days)).toBe(5);
    expect(r.errors).toEqual([]);
  });

  it("skips non-working holidays", async () => {
    const wed = addDays(monday, 9);
    await db.query(
      "insert into public.holidays (holiday_date, name, holiday_type) values ($1, 'Test Holiday', 'regular')",
      [wed],
    );
    const r = await preview(emma, "VL", addDays(monday, 7), addDays(monday, 11));
    expect(Number(r.days)).toBe(4);
  });

  it("counts a half day as 0.5", async () => {
    const r = await preview(emma, "VL", monday, monday, "am");
    expect(Number(r.days)).toBe(0.5);
  });

  it("rejects a range that is only rest days", async () => {
    const r = await preview(emma, "VL", addDays(monday, 5), addDays(monday, 6));
    expect(r.errors.join(" ")).toMatch(/rest days or holidays/);
  });

  it("counts calendar days for maternity leave", async () => {
    const r = await preview(emma, "ML", monday, addDays(monday, 6));
    expect(Number(r.days)).toBe(7);
  });
});

describe("filing rules", () => {
  it("blocks requests above the available balance", async () => {
    await expect(submit(emma, "VL", monday, addDays(monday, 18))).rejects.toThrow(/Insufficient Vacation Leave balance/);
  });

  it("enforces eligibility (paternity leave)", async () => {
    const r1 = await preview(emma, "PL", monday, monday);
    expect(r1.errors.join(" ")).toMatch(/only available to male/);
    const r2 = await preview(ed, "PL", monday, monday);
    expect(r2.errors).toEqual([]);
  });

  it("requires a Solo Parent ID for solo parent leave", async () => {
    const r = await preview(emma, "SPL", monday, monday);
    expect(r.errors.join(" ")).toMatch(/Solo Parent ID/);
  });

  it("flags when a supporting document is required", async () => {
    const r = await preview(emma, "SL", addDays(monday, 14), addDays(monday, 16));
    expect(r.attachment_required).toBe(true);
    await expect(submit(emma, "SL", addDays(monday, 14), addDays(monday, 16))).rejects.toThrow(/supporting document/);
  });

  it("rejects attachments outside the employee's own folder", async () => {
    await expect(
      submit(emma, "SL", addDays(monday, 14), addDays(monday, 16), "full", `${ed.employeeId}/leave/x.pdf`),
    ).rejects.toThrow(/Invalid attachment/);
  });
});

describe("approval chain", () => {
  let leaveId: string;

  it("routes a new request to the immediate supervisor", async () => {
    leaveId = await submit(emma, "VL", monday, addDays(monday, 4));
    const tasks = await pendingTasks(leaveId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].approver_user_id).toBe(sam.userId);
    expect(tasks[0].step_order).toBe(1);
  });

  it("counts pending days against the available balance", async () => {
    const r = await preview(emma, "VL", addDays(monday, 14), addDays(monday, 14));
    expect(Number(r.available)).toBe(5);
  });

  it("blocks overlapping requests", async () => {
    await expect(submit(emma, "VL", addDays(monday, 2), addDays(monday, 2))).rejects.toThrow(/already have a leave request/);
  });

  it("never lets the requester act on their own request", async () => {
    const [task] = await pendingTasks(leaveId);
    await expect(act(emma, task.id, "approved")).rejects.toThrow(/own request/);
  });

  it("rejects decisions from people who are not approvers", async () => {
    const [task] = await pendingTasks(leaveId);
    await expect(act(ed, task.id, "approved")).rejects.toThrow(/not an approver/);
  });

  it("moves to the department head after the supervisor approves", async () => {
    const [task] = await pendingTasks(leaveId);
    await act(sam, task.id, "approved");
    const tasks = await pendingTasks(leaveId);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].approver_user_id).toBe(dana.userId);
    expect(await leaveStatus(leaveId)).toBe("pending");
  });

  it("approves after the last step and deducts the balance", async () => {
    const [task] = await pendingTasks(leaveId);
    await act(dana, task.id, "approved");
    expect(await leaveStatus(leaveId)).toBe("approved");
    expect(await balance(db, emma.employeeId, "VL")).toBe(5);
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int as n from public.notifications where user_id = $1 and title = 'Leave approved'",
      [emma.userId],
    );
    expect(rows[0].n).toBe(1);
  });

  it("restores the balance when approved future leave is cancelled", async () => {
    await db.as(emma.userId, () => db.query("select public.cancel_leave_request($1, 'plans changed')", [leaveId]));
    expect(await leaveStatus(leaveId)).toBe("cancelled");
    expect(await balance(db, emma.employeeId, "VL")).toBe(10);
  });

  it("requires a reason to reject, and rejection does not touch the balance", async () => {
    const id = await submit(emma, "VL", addDays(monday, 21), addDays(monday, 21));
    const [task] = await pendingTasks(id);
    await expect(act(sam, task.id, "rejected")).rejects.toThrow(/give a reason/);
    await act(sam, task.id, "rejected", "Release week");
    expect(await leaveStatus(id)).toBe("rejected");
    expect(await balance(db, emma.employeeId, "VL")).toBe(10);
  });

  it("sends tasks to the delegate while the approver is away", async () => {
    await db.query(
      `insert into public.approval_delegations (delegator_user_id, delegate_user_id, starts_on, ends_on)
       values ($1, $2, current_date - 1, current_date + 30)`,
      [sam.userId, hana.userId],
    );
    const id = await submit(emma, "VL", addDays(monday, 28), addDays(monday, 28));
    const [task] = await pendingTasks(id);
    expect(task.approver_user_id).toBe(hana.userId);
    expect(task.delegated_from_user_id).toBe(sam.userId);
    await db.query("update public.approval_delegations set is_active = false");
  });

  it("skips steps that resolve to the requester and falls back to HR", async () => {
    // Dana has no supervisor and heads her own department: both steps resolve to nobody.
    const id = await submit(dana, "VL", addDays(monday, 35), addDays(monday, 35));
    const tasks = await pendingTasks(id);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].approver_user_id).toBe(hana.userId);
    expect(tasks[0].step_order).toBe(99);
    await act(hana, tasks[0].id, "approved");
    expect(await leaveStatus(id)).toBe("approved");
  });

  it("does not ask the same person twice when supervisor and department head are the same", async () => {
    const ops = await createDepartment(db, "OPS", sam.employeeId);
    const zed = await createPerson(db, { firstName: "Zed", email: "zed@x.test", departmentId: ops, supervisorId: sam.employeeId });
    await grantLeave(db, zed.employeeId, "VL", 5);
    const id = await submit(zed, "VL", addDays(monday, 42), addDays(monday, 42));
    const [task] = await pendingTasks(id);
    await act(sam, task.id, "approved");
    expect(await leaveStatus(id)).toBe("approved");
  });

  it("escalates overdue tasks to HR", async () => {
    const id = await submit(ed, "LWOP", addDays(monday, 49), addDays(monday, 49));
    await db.query(
      `update public.approval_tasks set due_at = now() - interval '1 hour'
       where approval_request_id = (select approval_request_id from public.leave_requests where id = $1)`,
      [id],
    );
    const { rows } = await db.asService(() => db.query<{ n: number }>("select public.escalate_overdue_approvals() as n"));
    expect(rows[0].n).toBe(1);
    const tasks = await pendingTasks(id);
    expect(tasks.map((t) => t.approver_user_id).sort()).toEqual([sam.userId, hana.userId].sort());
    // HR acting on the escalated task closes the original one too.
    const hrTask = tasks.find((t) => t.approver_user_id === hana.userId)!;
    await act(hana, hrTask.id, "approved");
    expect(await pendingTasks(id)).toHaveLength(1); // now at the department head step
  });
});

describe("accruals and year-end", () => {
  let fresh: Db;

  beforeAll(async () => {
    fresh = await createDb();
  });

  it("accrues monthly, pro-rates upfront grants for new hires, and is idempotent", async () => {
    const veteran = await createPerson(fresh, { firstName: "Vic", email: "vic@x.test", dateHired: "2020-02-01" });
    const newbie = await createPerson(fresh, { firstName: "Nia", email: "nia@x.test", dateHired: "2026-04-20" });

    const first = await fresh.asService(() =>
      fresh.query<{ n: number }>("select public.run_leave_accruals('2026-06-15') as n"),
    );
    expect(first.rows[0].n).toBeGreaterThan(0);
    const again = await fresh.asService(() =>
      fresh.query<{ n: number }>("select public.run_leave_accruals('2026-06-15') as n"),
    );
    expect(again.rows[0].n).toBe(0);

    expect(await balance(fresh, veteran.employeeId, "VL")).toBe(7.5); // Jan–Jun × 1.25
    expect(await balance(fresh, veteran.employeeId, "EL")).toBe(3);
    expect(await balance(fresh, newbie.employeeId, "VL")).toBe(2.5); // May, Jun (hired after the 15th)
    expect(await balance(fresh, newbie.employeeId, "EL")).toBe(2.5); // 3 × 9/12 = 2.25 → nearest half day
    expect(await balance(fresh, veteran.employeeId, "SIL")).toBe(0); // inactive by default
    expect(await balance(fresh, newbie.employeeId, "SPL")).toBe(0); // not a solo parent
  });

  it("only HR with leave.configure or the service role can run accruals", async () => {
    const someone = await createPerson(fresh, { firstName: "Sol", email: "sol@x.test" });
    await expect(
      fresh.as(someone.userId, () => fresh.query("select public.run_leave_accruals('2026-06-15')")),
    ).rejects.toThrow(/Not allowed/);
  });

  it("carries over, converts, then forfeits at year-end", async () => {
    const yen = await createPerson(fresh, { firstName: "Yen", email: "yen@x.test", dateHired: "2019-01-01" });
    await fresh.query(
      `insert into public.leave_ledger_entries (employee_id, leave_type_id, entry_type, days, effective_date, reason)
       select $1, id, 'opening_balance', 12, '2025-01-01', 'test' from public.leave_types where code = 'VL'`,
      [yen.employeeId],
    );
    await fresh.asService(() => fresh.query("select public.run_leave_year_end(2025)"));
    const { rows } = await fresh.query<{ entry_type: string; days: string }>(
      `select l.entry_type, l.days::text from public.leave_ledger_entries l
       join public.leave_types t on t.id = l.leave_type_id
       where l.employee_id = $1 and t.code = 'VL' and l.period_key = 'Y2025' order by l.entry_type::text`,
      [yen.employeeId],
    );
    // 12 days: 5 carried over (cap), 5 converted to cash (cap), 2 forfeited.
    expect(rows.map((r) => [r.entry_type, Number(r.days)])).toEqual([
      ["conversion", -5],
      ["forfeiture", -2],
    ]);
    // Re-running is a no-op.
    const rerun = await fresh.asService(() => fresh.query<{ n: number }>("select public.run_leave_year_end(2025) as n"));
    expect(rerun.rows[0].n).toBe(0);
  });
});
