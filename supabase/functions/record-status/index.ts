import { isOriginAllowed, jsonResponse, preflightResponse, requirePost } from "../_shared/http.ts";
import { getBeijingDate } from "../_shared/record.ts";
import { verifyAccessToken } from "../_shared/security.ts";
import { createServerClient } from "../_shared/supabase-admin.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isOriginAllowed(request)) return jsonResponse(request, { error: "来源不在允许列表中。" }, 403);
  const methodError = requirePost(request);
  if (methodError) return methodError;

  try {
    const body = await request.json();
    if (!(await verifyAccessToken(body?.token))) {
      return jsonResponse(request, { error: "专属 token 无效。" }, 401);
    }

    const supabase = createServerClient();
    if (!supabase) {
      console.error("Supabase server environment is incomplete.");
      return jsonResponse(request, { error: "服务配置不完整。" }, 500);
    }
    const { data, error } = await supabase
      .from("daily_records")
      .select("viewed, viewed_at")
      .eq("record_date", getBeijingDate())
      .maybeSingle();

    if (error) {
      console.error("record-status database error", error);
      return jsonResponse(request, { error: "查看状态读取失败。" }, 500);
    }
    return jsonResponse(
      request,
      { viewed: data?.viewed ?? false, viewed_at: data?.viewed_at ?? null },
      200,
    );
  } catch {
    return jsonResponse(request, { error: "请求格式不正确。" }, 400);
  }
});
