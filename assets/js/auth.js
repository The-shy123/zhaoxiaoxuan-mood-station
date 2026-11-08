import { getSupabaseClient } from './supabase.js';

export async function getMember() {
  const client = getSupabaseClient();
  const {data:{session}, error} = await client.auth.getSession();
  if (error) throw error;
  if (!session) return null;
  const {data, error: memberError} = await client.from('home_members').select('profile').eq('user_id',session.user.id).maybeSingle();
  if (memberError) throw new Error('小家暂时没有连上，请稍后重试。');
  return data ? {...data, user: session.user} : null;
}

export async function requireHomeMember(returnTo) {
  try {
    const member = await getMember();
    if (member) {
      getSupabaseClient().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT') location.replace('index.html');
      });
      return member;
    }
  } catch { /* The login page provides a retryable connection state. */ }
  location.replace(`index.html?return=${encodeURIComponent(returnTo)}`);
  return null;
}
