import { isOriginAllowed, jsonResponse, preflightResponse, requirePost } from "../_shared/http.ts";
import { getBeijingDate, validateRecord } from "../_shared/record.ts";
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

    const record = validateRecord(body?.record);
    const supabase = createServerClient();
    if (!supabase) {
      console.error("Supabase server environment is incomplete.");
      return jsonResponse(request, { error: "服务配置不完整。" }, 500);
    }
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("daily_records")
      .upsert(
        {
          record_date: getBeijingDate(),
          mood: record.mood,
          body_status: record.body_status,
          care_needs: record.care_needs,
          message: record.message,
          submitted_at: now,
          viewed: false,
          viewed_at: null,
          updated_at: now,
        },
        { onConflict: "record_date" },
      )
      .select("id, record_date, submitted_at, viewed")
      .single();

    if (error) {
      console.error("submit-record database error", error);
      return jsonResponse(request, { error: "记录保存失败，请稍后再试。" }, 500);
    }
    return jsonResponse(request, data, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "请求格式不正确。";
    return jsonResponse(request, { error: message }, 400);
  }
});
