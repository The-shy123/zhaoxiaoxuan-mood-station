import { getHomeMember } from "../_shared/home-auth.ts";
import { createServerClient } from "../_shared/supabase-admin.ts";
import { verifyAccessToken } from "../_shared/security.ts";
import { isOriginAllowed, jsonResponse, preflightResponse, requirePost } from "../_shared/http.ts";

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return preflightResponse(request);
  if (!isOriginAllowed(request)) return jsonResponse(request, {error: "来源不在允许列表中。"}, 403);
  const methodError = requirePost(request); if (methodError) return methodError;
  try {
    const body = await request.json();
    const client = createServerClient();
    if (!client) return jsonResponse(request, {error: "小家暂时无法连接，请稍后再试。"}, 503);
    const ownerSetup = body.action === 'setup-member';
    if (ownerSetup || body.action === 'setup-status') {
      const actor = await getHomeMember(request);
      if (actor?.profile !== 'zhang') return jsonResponse(request, {error: '请先登录 zzt大帅哥，再设置萱宝的密码。'}, 403);
      if (body.action === 'setup-status') {
        const {data, error} = await client.from('home_members').select('user_id').eq('profile','xiaoxuan').maybeSingle();
        if (error) throw error;
        return jsonResponse(request, {setupNeeded: !data});
      }
    }
    if (!['xiaoxuan','zhang'].includes(body.profile) || typeof body.password !== 'string' || body.password.length > 128) {
      return jsonResponse(request, {error: "请选择身份并输入密码。"}, 400);
    }
    if (body.action === 'setup' || ownerSetup) {
      if (body.profile !== 'xiaoxuan' || (!ownerSetup && !(await verifyAccessToken(body.token)))) {
        return jsonResponse(request, {error: "请用原来的专属链接设置小萱的密码。"}, 403);
      }
      if (body.password.length < 10) return jsonResponse(request, {error: "密码至少需要 10 位。"}, 400);
      const {data: existing, error: lookupError} = await client.from('home_members').select('user_id').eq('profile','xiaoxuan').maybeSingle();
      if (lookupError) throw lookupError;
      if (existing) return jsonResponse(request, {error: "小萱已经设置过密码，请直接登录。"}, 409);
      const email = 'xiaoxuan@our-home.invalid';
      const {data: created, error} = await client.auth.admin.createUser({email, password: body.password, email_confirm:true, app_metadata:{role:'home_member'}});
      if (error || !created.user) return jsonResponse(request, {error: "账号未能创建，请稍后再试。"}, 400);
      const {error: memberError} = await client.from('home_members').insert({user_id:created.user.id, profile:'xiaoxuan'});
      if (memberError) { await client.auth.admin.deleteUser(created.user.id); throw memberError; }
      if (ownerSetup) return jsonResponse(request, {created: true});
    } else if (body.action !== 'login') {
      return jsonResponse(request, {error: "操作无效。"}, 400);
    }
    const {data: member, error: memberError} = await client.from('home_members').select('user_id').eq('profile',body.profile).maybeSingle();
    if (memberError || !member) return jsonResponse(request, {error: "密码不正确，或这个身份还没有设置密码。"}, 401);
    const {data: account, error: accountError} = await client.auth.admin.getUserById(member.user_id);
    if (accountError || !account.user.email) throw new Error('account unavailable');
    const {data, error} = await client.auth.signInWithPassword({email:account.user.email, password:body.password});
    if (error || !data.session) return jsonResponse(request, {error: "密码不正确，请再试一次。"}, 401);
    return jsonResponse(request, {access_token:data.session.access_token, refresh_token:data.session.refresh_token});
  } catch {
    return jsonResponse(request, {error: "小家暂时无法连接，请稍后再试。"}, 503);
  }
});
