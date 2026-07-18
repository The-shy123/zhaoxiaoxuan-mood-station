// 这里只放可公开的前端配置。Supabase anon key 本身是公开密钥，安全边界由 RLS 保证。
// GitHub Actions 部署时会用 Repository Variables 自动生成此文件的部署版本。
window.MOOD_STATION_CONFIG = Object.freeze({
  supabaseUrl: "https://wjwvcgvvsfivrofwntou.supabase.co",
  supabaseAnonKey: "sb_publishable_I2-aKRbBRcPcZQnRhn-UqQ_wc06uIZM",
  adminEmail: "zzt051028@gmail.com",
});
