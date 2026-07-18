# 赵小萱宝宝的今日心情补给站

一个只属于赵小萱宝宝和张先森的情侣状态记录网页。赵小萱宝宝每天选择心情、身体状态、陪伴需求并留下一句话；张先森通过受保护的工作台查看当天记录和最近七天记录，并把“我看到啦”同步回用户页面。

项目是纯静态前端，适合部署到 GitHub Pages；数据、登录与服务端校验由 Supabase 提供。

## 功能介绍

### 赵小萱宝宝端

- 欢迎页和四步记录流程：心情、身体状态、最多三项陪伴需求、100 字以内留言。
- 首次打开时自动出现可拆封的惊喜信件；拆阅状态同步到 Supabase，清缓存、无痕模式或换设备也不会重复自动弹出。
- 首页永久保留专属信箱，可随时重读；信件正文通过专属 token 验证后才会加载，不写入公开网页文件。
- 提交前确认；同一天重复提交时只保留最新一次，并重置为“未查看”。
- 提交成功页每 15 秒查询一次查看状态。
- 每个北京时间自然日可抽奖一次，中奖率 25%；中奖后七张照顾券等概率出现。
- 中奖后允许换券一次，抽奖结果保存在当前浏览器的 `localStorage`，照顾券不写入数据库。

### 张先森端

- `/admin.html` 使用 Supabase Auth 登录，页面只要求输入密码。
- 查看今天记录、简单提醒，并点击“我看到啦”。
- `/history.html` 按日期倒序显示最近七个北京时间自然日，没有记录的日期也会显示。
- 历史记录可展开查看心情、身体状态、需求、留言、提交时间和查看状态。

## 技术与目录

- HTML5、CSS3、JavaScript ES6 Modules
- Supabase Database、Auth、Edge Functions
- GitHub Actions、GitHub Pages
- 无 React、Vue、Next.js，无构建框架

```text
zhaoxiaoxuan-mood-station/
├── .github/workflows/deploy-pages.yml
├── assets/
│   ├── css/styles.css
│   ├── images/heart-cloud.svg
│   └── js/
│       ├── admin.js
│       ├── app.js
│       ├── config.js
│       ├── constants.js
│       ├── history.js
│       └── supabase.js
├── supabase/
│   ├── config.toml
│   ├── letter-surprise.sql
│   ├── schema.sql
│   └── functions/
│       ├── _shared/
│       │   ├── http.ts
│       │   ├── record.ts
│       │   ├── security.ts
│       │   └── supabase-admin.ts
│       ├── letter-status/index.ts
│       ├── record-status/index.ts
│       └── submit-record/index.ts
├── admin.html
├── history.html
├── index.html
├── .gitignore
└── README.md
```

## 一、本地运行

静态页面必须通过 HTTP 服务打开，不能直接双击 HTML 文件。

```bash
cd zhaoxiaoxuan-mood-station
python3 -m http.server 8000
```

浏览器访问：

- 用户端：`http://localhost:8000/`
- 管理端：`http://localhost:8000/admin.html`
- 七天记录：`http://localhost:8000/history.html`

在完成 Supabase 配置前，可以浏览和操作 UI，但提交、登录与数据读取不会成功。

## 二、创建 Supabase 项目

1. 在 [Supabase Dashboard](https://supabase.com/dashboard) 创建项目，妥善保存数据库密码。
2. 打开 **Project Settings → API**，复制项目 URL 和浏览器可用的 Publishable key（旧项目中可能显示为 anon key）。
3. 编辑 `assets/js/config.js`：

```js
window.MOOD_STATION_CONFIG = Object.freeze({
  supabaseUrl: "https://你的项目引用.supabase.co",
  supabaseAnonKey: "浏览器可用的 publishable 或 anon key",
  adminEmail: "管理员账号邮箱",
});
```

这里的浏览器 key 是公开配置，不是 service role/secret key。项目使用 RLS 作为数据库安全边界。绝对不要把 service role、secret key、管理员密码或专属 token 写进此文件。

## 三、初始化数据库

1. 打开 Supabase Dashboard 的 **SQL Editor**。
2. 复制并完整执行 `supabase/schema.sql`。
3. 在 **Table Editor** 中确认 `daily_records`、`private_letters` 和 `private_letter_reads` 已创建。
4. 再复制并执行本机文件 `supabase/private/letter-content.sql`，把信件正文放进私密数据表。该目录已被 `.gitignore` 排除，不能上传到 GitHub。

如果此前已经执行过旧版 `schema.sql`，只需额外执行一次 `supabase/letter-surprise.sql`，不必重建原有数据表。

SQL 会完成：

- 字段、枚举值、留言长度、需求数量和需求值约束。
- `record_date` 唯一约束，保证同一天只保留最新一条。
- RLS；匿名访问没有任何表权限。
- `private_letters` 保存信件正文，匿名浏览器无法直接读取。
- `private_letter_reads` 只保存信件首次拆阅时间，供服务端判断是否自动弹出。
- 只有 JWT `app_metadata.role = mood_admin` 的登录用户可以读取记录。
- 管理员只能通过受控 RPC 标记查看，不能从浏览器改写记录正文。

## 四、配置管理员账号

1. 在 Supabase Dashboard 打开 **Authentication → Users**。
2. 创建一个邮箱密码用户。邮箱必须与 `config.js` 或 GitHub Repository Variable `ADMIN_EMAIL` 一致。
3. 在 SQL Editor 执行下面语句，把占位邮箱改成刚创建的账号邮箱：

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"mood_admin"}'::jsonb
where email = '<管理员账号邮箱>';
```

管理员角色必须放在 `app_metadata`，不能放在用户自己可以修改的 `user_metadata`。角色修改后需要重新登录，以取得包含新角色的 JWT。建议在 **Authentication → Providers → Email** 关闭普通用户自行注册；本项目不提供注册页面。

管理员密码只存在 Supabase Auth 和使用者的输入中，不能提交到 GitHub。

## 五、配置专属 token

专属 token 只放在 Supabase Edge Function Secret 中。先自行生成一个足够长的随机值，例如：

```bash
openssl rand -hex 32
```

不要把命令输出写进仓库、README、Issues 或聊天截图。安装 [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)，然后：

```bash
supabase login
supabase link --project-ref <你的项目引用>
supabase secrets set BABY_ACCESS_TOKEN='<刚生成的随机值>'
supabase secrets set ALLOWED_ORIGINS='http://localhost:8000,https://<GitHub用户名>.github.io'
```

如果 GitHub Pages 项目使用自定义域名，把该域名也加入 `ALLOWED_ORIGINS`，多个来源用英文逗号分隔，不要在结尾加 `/`。

赵小萱宝宝的专属入口格式为：

```text
https://<GitHub用户名>.github.io/<仓库名>/?token=<与 BABY_ACCESS_TOKEN 相同的值>
```

页面第一次读取 token 后会立即把它保存到当前标签页的 `sessionStorage`，并从地址栏删除 token。请只通过私密渠道发送完整链接；不要把完整链接提交到仓库或公开页面。

## 六、部署 Edge Functions

`supabase/config.toml` 已为三个公开入口函数设置 `verify_jwt = false`，因为用户端没有 Supabase 登录态；函数会在代码中对 `BABY_ACCESS_TOKEN` 做 SHA-256 后的固定长度比较。数据库写入密钥只在 Edge Function 服务端环境读取，不会发给浏览器。

```bash
supabase functions deploy submit-record
supabase functions deploy record-status
supabase functions deploy letter-status
```

也可以一次部署全部函数：

```bash
supabase functions deploy
```

Supabase 托管环境会自动提供服务端数据库配置。代码优先读取当前托管环境的 `SUPABASE_SECRET_KEYS`，并兼容旧项目的 `SUPABASE_SERVICE_ROLE_KEY`；绝对不要把这些值复制到前端配置。

部署参考：[Supabase Edge Functions 部署文档](https://supabase.com/docs/guides/functions/deploy) 与 [Secrets 文档](https://supabase.com/docs/guides/functions/secrets)。

## 七、部署 GitHub Pages

1. 在项目目录初始化 Git 并推送到 GitHub 仓库的 `main` 分支。
2. 打开 GitHub 仓库 **Settings → Secrets and variables → Actions → Variables**。
3. 创建三个 Repository Variables：

   - `SUPABASE_URL`：Supabase 项目 URL。
   - `SUPABASE_ANON_KEY`：浏览器可用的 Publishable/anon key，绝不能填 service role/secret key。
   - `ADMIN_EMAIL`：管理员账号邮箱。

4. 打开 **Settings → Pages → Build and deployment**，将 Source 选择为 **GitHub Actions**。
5. 推送到 `main`。`.github/workflows/deploy-pages.yml` 会检查变量、生成部署用 `config.js`、上传纯静态文件并部署 Pages。
6. 在 **Actions** 页面等待 `Deploy GitHub Pages` 完成，然后打开 Pages 地址。

工作流只发布 `index.html`、`admin.html`、`history.html` 和 `assets/`；数据库脚本、Edge Functions、README 与本地文件不会进入 Pages 站点。GitHub 官方流程参考：[Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。

## 八、测试步骤

建议按下面顺序做一次完整验收：

1. 用不带 token 的地址打开用户端，确认页面提示入口缺少 token。
2. 在地址后加入 `?preview=letter&token=<专属 token>` 预览首次信封动画；预览模式不会写入已读状态。
3. 用正式专属链接打开，确认 token 很快从地址栏消失，并自动出现首次信封。
4. 点击拆信，确认可以展开全文，且 `private_letter_reads` 出现 `first-letter-20260719`。
5. 清除站点数据或使用另一台设备重新打开正式专属链接，确认不再自动弹信；首页专属信箱仍可重读。
6. 依次选择心情、身体、1—3 个需求，输入 100 字以内留言并提交。
7. 在 Supabase `daily_records` 确认当天记录存在，`viewed=false`。
8. 打开 `/admin.html`，分别测试错误密码和正确密码。
9. 确认工作台显示今天记录和对应的简单提醒。
10. 点击“我看到啦”，确认数据库出现 `viewed=true`、`viewed_at` 有值。
11. 返回用户提交成功页，最多等待 15 秒，确认变为“张先森已经看到了 💗”。
12. 当天重新提交，确认仍只有一条当天记录，内容更新且查看状态重置。
13. 打开 `/history.html`，确认最近七个自然日按倒序显示，无记录日期也存在。
14. 测试需求未选、选择超过三项、留言超过 100 字、非法接口数据，确认前后端都会拒绝。
15. 抽奖后刷新页面，确认当天不能再次抽首轮；若中奖，只允许换券一次。
16. 用 320px 宽度手机模拟器和桌面宽度检查页面，无横向滚动。

如果误用正式链接提前拆开了信，可在 SQL Editor 中执行下面语句，恢复为“从未拆阅”；分享给赵小萱宝宝前不要再用正式链接拆信：

```sql
delete from public.private_letter_reads
where letter_id = 'first-letter-20260719';
```

## 九、安全与注意事项

- 不要把 `BABY_ACCESS_TOKEN`、管理员密码、service role/secret key 或 `.env` 文件提交到 Git。
- Publishable/anon key 设计上可以放在浏览器；仍必须保持 RLS 开启，不能用它替代服务端 secret。
- 用户留言与数据库内容都通过 DOM `textContent` 渲染，不拼接 HTML，避免存储型 XSS。
- Edge Functions 会重新校验所有字段、枚举、数组长度、重复需求与留言长度，不能只依赖前端校验。
- 日期由 Edge Function 按 `Asia/Shanghai` 生成，避免设备时区导致跨日错误。
- 照顾券按需求不保存到数据库。每日限制依赖当前浏览器 `localStorage`，刷新页面不能重抽；清空站点数据或换浏览器会清除该本地限制。
- 专属链接本质上是一把钥匙。若怀疑泄露，立即执行 `supabase secrets set BABY_ACCESS_TOKEN='<新随机值>'`，并重新私下发送新链接。
- 信件正文保存在 Supabase 的 `private_letters` 表中；本机初始化文件位于被 Git 忽略的 `supabase/private/`，不会进入 GitHub Pages 或 GitHub 仓库。
- `ALLOWED_ORIGINS` 是浏览器侧来源限制，不能替代 token 验证；生产环境应只保留实际 Pages 域名和需要的本地开发地址。

## 十、完成情况

- 用户端完整记录流程、确认、提交、查看状态：已实现。
- 25% 每日抽奖、七张等概率照顾券、中奖后换券一次：已实现。
- Supabase upsert、北京时间、服务端校验和 token 验证：已实现。
- Supabase Auth 管理员登录、RLS、受控查看标记：已实现。
- 今日记录、简单提醒、最近七天自然日历史：已实现。
- 手机优先粉色 UI、动画、无版权图片：已实现。
- GitHub Pages 自动部署：已实现。

上线前仍需由部署者完成 Supabase 项目创建、数据库 SQL 执行、管理员账号创建、Edge Function Secrets 设置和 GitHub Repository Variables 配置。
