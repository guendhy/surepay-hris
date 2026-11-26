import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Example mobile/integration endpoint (API v1).
 * Auth: `Authorization: Bearer <Supabase access token>` (mobile apps) or the
 * browser session cookie. Data access is governed by RLS, same as the web app.
 */
export async function GET(request: NextRequest) {
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = bearer
    ? createSupabase(publicEnv.supabaseUrl(), publicEnv.supabaseKey(), {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : createServerClient(publicEnv.supabaseUrl(), publicEnv.supabaseKey(), {
        cookies: { getAll: () => request.cookies.getAll(), setAll: () => {} },
      });

  const { data: claims } = await supabase.auth.getClaims(bearer);
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const { data: access } = await supabase.rpc("my_access");
  const employeeId = access?.employee?.id;
  if (!employeeId) return NextResponse.json({ error: "No employee record linked" }, { status: 404 });

  const [{ data: types }, { data: balances }] = await Promise.all([
    supabase.from("leave_types").select("id, code, name, balance_tracked").eq("is_active", true).order("sort_order"),
    supabase.from("leave_balances").select("leave_type_id, earned, used, balance, pending, available").eq("employee_id", employeeId),
  ]);

  return NextResponse.json({
    employee_id: employeeId,
    balances: (types ?? [])
      .filter((t) => t.balance_tracked)
      .map((t) => {
        const b = (balances ?? []).find((x) => x.leave_type_id === t.id);
        return {
          code: t.code,
          name: t.name,
          earned: Number(b?.earned ?? 0),
          used: Number(b?.used ?? 0),
          pending: Number(b?.pending ?? 0),
          available: Number(b?.available ?? 0),
        };
      }),
  });
}
