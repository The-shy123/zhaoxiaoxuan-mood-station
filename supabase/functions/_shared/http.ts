const DEFAULT_HEADERS = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
  Vary: "Origin",
};

export function isOriginAllowed(request: Request): boolean {
  const configured = Deno.env.get("ALLOWED_ORIGINS")?.trim();
  const origin = request.headers.get("Origin");
  if (!configured || !origin) return true;
  const allowed = configured.split(",").map((item) => item.trim()).filter(Boolean);
  return allowed.includes(origin);
}

export function responseHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin");
  const configured = Deno.env.get("ALLOWED_ORIGINS")?.trim();
  const headers: Record<string, string> = { ...DEFAULT_HEADERS };

  if (!configured) {
    headers["Access-Control-Allow-Origin"] = "*";
  } else if (origin) {
    const allowed = configured.split(",").map((item) => item.trim()).filter(Boolean);
    if (allowed.includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}

export function jsonResponse(request: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(request),
  });
}

export function preflightResponse(request: Request): Response {
  return new Response("ok", { headers: responseHeaders(request) });
}

export function requirePost(request: Request): Response | null {
  if (request.method === "POST") return null;
  return jsonResponse(request, { error: "只支持 POST 请求。" }, 405);
}
