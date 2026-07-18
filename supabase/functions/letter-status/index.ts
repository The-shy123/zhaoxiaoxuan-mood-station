import { isOriginAllowed, jsonResponse, preflightResponse, requirePost } from "../_shared/http.ts";
import { verifyAccessToken } from "../_shared/security.ts";
import { createServerClient } from "../_shared/supabase-admin.ts";

const LETTER_ID = "first-letter-20260719";

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
    if (!["status", "open", "content"].includes(body?.action)) {
      return jsonResponse(request, { error: "信件操作无效。" }, 400);
    }

    const supabase = createServerClient();
    if (!supabase) {
      console.error("Supabase server environment is incomplete.");
      return jsonResponse(request, { error: "服务配置不完整。" }, 500);
    }

    if (body.action === "content") {
      const { data: letter, error: letterError } = await supabase
        .from("private_letters")
        .select("title, salutation, paragraphs, signature, letter_date")
        .eq("letter_id", LETTER_ID)
        .maybeSingle();

      if (letterError) {
        console.error("letter-status content error", letterError);
        return jsonResponse(request, { error: "信件内容读取失败。" }, 500);
      }
      if (!letter) return jsonResponse(request, { error: "这封信还没有放进信箱。" }, 404);

      return jsonResponse(
        request,
        {
          letter: {
            title: letter.title,
            salutation: letter.salutation,
            paragraphs: letter.paragraphs,
            signature: letter.signature,
            date: letter.letter_date,
          },
        },
        200,
      );
    }

    if (body.action === "open") {
      const { error: openError } = await supabase
        .from("private_letter_reads")
        .upsert(
          { letter_id: LETTER_ID },
          { onConflict: "letter_id", ignoreDuplicates: true },
        );
      if (openError) {
        console.error("letter-status open error", openError);
        return jsonResponse(request, { error: "信件状态保存失败。" }, 500);
      }
    }

    const { data, error } = await supabase
      .from("private_letter_reads")
      .select("opened_at")
      .eq("letter_id", LETTER_ID)
      .maybeSingle();

    if (error) {
      console.error("letter-status database error", error);
      return jsonResponse(request, { error: "信件状态读取失败。" }, 500);
    }
    return jsonResponse(
      request,
      { opened: Boolean(data), opened_at: data?.opened_at ?? null },
      200,
    );
  } catch {
    return jsonResponse(request, { error: "请求格式不正确。" }, 400);
  }
});
