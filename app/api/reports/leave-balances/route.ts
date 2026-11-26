import { NextResponse, type NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getSession } from "@/lib/auth/session";
import { getBalanceReport } from "@/lib/data/leave-report";
import { createClient } from "@/lib/supabase/server";
import { todayManila } from "@/lib/format";

/** XLSX export of leave balances. Requires reports.export + leave.view_all; logged. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (session.requiresMfa && session.aal !== "aal2") return NextResponse.json({ error: "MFA required" }, { status: 403 });
  if (!session.permissions.includes("reports.export") || !session.permissions.includes("leave.view_all")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const dept = request.nextUrl.searchParams.get("dept") ?? undefined;
  const report = await getBalanceReport(dept && /^[0-9a-f-]{36}$/.test(dept) ? dept : undefined);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Surepay HRIS";
  const ws = wb.addWorksheet("Leave balances", { views: [{ state: "frozen", xSplit: 3, ySplit: 1 }] });
  ws.columns = [
    { header: "Employee no.", key: "no", width: 16 },
    { header: "Name", key: "name", width: 30 },
    { header: "Department", key: "dept", width: 22 },
    ...report.types.flatMap((t) => [
      { header: `${t.name} — available`, key: `${t.id}:a`, width: 14 },
      { header: `${t.name} — pending`, key: `${t.id}:p`, width: 12 },
    ]),
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of report.rows) {
    const row: Record<string, string | number> = { no: r.employeeNo, name: r.name, dept: r.department };
    for (const t of report.types) {
      row[`${t.id}:a`] = r.balances[t.id]?.available ?? 0;
      row[`${t.id}:p`] = r.balances[t.id]?.pending ?? 0;
    }
    ws.addRow(row);
  }

  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "export.leave_balances", p_context: { rows: report.rows.length, dept: dept ?? null } });

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="leave-balances-${todayManila()}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
