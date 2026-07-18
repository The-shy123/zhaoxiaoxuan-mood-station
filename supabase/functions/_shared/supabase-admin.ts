import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

function readHostedSecretKey(): string {
  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (legacyKey) return legacyKey;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
  if (!secretKeys) return "";

  try {
    const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
    const candidate = parsed.default ?? Object.values(parsed)[0];
    if (typeof candidate === "string") return candidate;
    if (candidate && typeof candidate === "object") {
      const value = (candidate as Record<string, unknown>).key;
      if (typeof value === "string") return value;
    }
  } catch {
    return "";
  }
  return "";
}

export function createServerClient(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.trim();
  const secretKey = readHostedSecretKey();
  if (!supabaseUrl || !secretKey) return null;

  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
