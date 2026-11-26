import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Opens a stored file through a 60-second signed URL. Signing runs as the
 * signed-in user, so storage RLS decides whether they may see the file.
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("path");
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data, error } = await supabase.storage.from("employee-files").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "File not found or access denied" }, { status: 404 });
  }

  await supabase.rpc("log_event", { p_action: "file.view", p_context: { path } });
  return NextResponse.redirect(data.signedUrl);
}
