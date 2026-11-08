import { createServerClient } from "./supabase-admin.ts";

export async function getHomeMember(request: Request) {
  const client = createServerClient();
  const bearer = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!client || !bearer) return null;
  const { data, error } = await client.auth.getUser(bearer);
  if (error || !data.user) return null;
  const { data: member } = await client.from("home_members").select("profile").eq("user_id", data.user.id).maybeSingle();
  return member ? { client, user: data.user, profile: member.profile } : null;
}
