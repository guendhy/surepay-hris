import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** POST only, so a link or image tag cannot sign someone out. */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.rpc("log_event", { p_action: "auth.sign_out", p_context: {} });
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
}
