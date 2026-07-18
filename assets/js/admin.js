import { BODY_STATUSES, CARE_NEEDS, MOODS, REMINDERS } from "./constants.js";
import { formatBeijingTime, formatChineseDate, getBeijingDate, getPublicConfig, getSupabaseClient } from "./supabase.js";

const loginPanel = document.querySelector("#loginPanel");
const workspacePanel = document.querySelector("#workspacePanel");
const loginForm = document.querySelector("#loginForm");
let supabase;
let todayRecord = null;

initialize();

async function initialize() {
  const config = getPublicConfig();
  if (!config.configured) {
    setLoginError("Supabase 尚未配置，请先完成 assets/js/config.js。");
    disableLogin();
    return;
  }
  if (!config.adminEmail || !config.adminEmail.includes("@")) {
    setLoginError("管理员邮箱尚未配置。");
    disableLogin();
    return;
  }

  supabase = getSupabaseClient();
  loginForm.addEventListener("submit", login);
  document.querySelector("#markViewedButton").addEventListener("click", markViewed);
  const { data } = await supabase.auth.getSession();
  if (isAdmin(data.session)) await openWorkspace();
}

async function login(event) {
  event.preventDefault();
  setLoginError("");
  const password = document.querySelector("#passwordInput").value;
  const button = document.querySelector("#loginButton");
  setLoading(button, true, "正在确认…");

  try {
    const { adminEmail } = getPublicConfig();
    const { data, error } = await supabase.auth.signInWithPassword({ email: adminEmail, password });
    if (error) throw error;
    if (!isAdmin(data.session)) {
      await supabase.auth.signOut();
      throw new Error("这个账号没有工作台权限。");
    }
    document.querySelector("#passwordInput").value = "";
    await openWorkspace();
  } catch (error) {
    const invalid = /invalid login credentials/i.test(error.message);
    setLoginError(invalid ? "密码不对，再试一次吧。" : error.message || "登录没有成功，请稍后再试。");
  } finally {
    setLoading(button, false);
  }
}

function isAdmin(session) {
  return session?.user?.app_metadata?.role === "mood_admin";
}

async function openWorkspace() {
  loginPanel.hidden = true;
  workspacePanel.hidden = false;
  document.querySelector("#todayDate").textContent = formatChineseDate(getBeijingDate());
  await loadTodayRecord();
}

async function loadTodayRecord() {
  const loading = document.querySelector("#loadingRecord");
  const empty = document.querySelector("#emptyRecord");
  const recordPanel = document.querySelector("#todayRecord");
  loading.hidden = false;
  empty.hidden = true;
  recordPanel.hidden = true;

  const { data, error } = await supabase
    .from("daily_records")
    .select("id, record_date, mood, body_status, care_needs, message, submitted_at, viewed, viewed_at")
    .eq("record_date", getBeijingDate())
    .maybeSingle();

  loading.hidden = true;
  if (error) {
    loading.hidden = false;
    loading.textContent = "读取失败，请刷新页面再试。";
    return;
  }
  if (!data) {
    empty.hidden = false;
    renderReminders(null);
    return;
  }

  todayRecord = data;
  recordPanel.hidden = false;
  document.querySelector("#todayMood").textContent = MOODS[data.mood]?.label ?? data.mood;
  document.querySelector("#todayBody").textContent = BODY_STATUSES[data.body_status]?.label ?? data.body_status;
  document.querySelector("#todayNeeds").textContent = data.care_needs.map((key) => CARE_NEEDS[key] ?? key).join("、");
  document.querySelector("#todayMessage").textContent = data.message || "没有留言";
  document.querySelector("#todaySubmittedAt").textContent = formatBeijingTime(data.submitted_at);
  renderViewedState(data.viewed);
  renderReminders(data);
}

async function markViewed() {
  if (!todayRecord || todayRecord.viewed) return;
  const button = document.querySelector("#markViewedButton");
  const errorElement = document.querySelector("#viewError");
  errorElement.textContent = "";
  setLoading(button, true, "正在告诉她…");

  const { error } = await supabase.rpc("mark_daily_record_viewed", {
    target_id: todayRecord.id,
  });

  if (error) {
    errorElement.textContent = "没有标记成功，请稍后再试。";
    setLoading(button, false);
    return;
  }
  todayRecord.viewed = true;
  renderViewedState(true);
}

function renderViewedState(viewed) {
  const badge = document.querySelector("#adminViewBadge");
  const button = document.querySelector("#markViewedButton");
  const success = document.querySelector("#viewSuccess");
  badge.hidden = false;
  badge.textContent = viewed ? "已查看" : "等待查看";
  button.hidden = viewed;
  success.hidden = !viewed;
}

function renderReminders(record) {
  const container = document.querySelector("#reminderList");
  container.replaceChildren();
  if (!record) {
    appendParagraph(container, "等赵小萱宝宝提交记录后，这里会出现小提醒。");
    return;
  }
  const reminders = [REMINDERS.mood[record.mood], REMINDERS.body[record.body_status]].filter(Boolean);
  if (!reminders.length) reminders.push("按今天的记录陪陪她。");
  reminders.forEach((text) => appendParagraph(container, text));
}

function appendParagraph(container, text) {
  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  container.append(paragraph);
}

function setLoginError(message) {
  document.querySelector("#loginError").textContent = message;
}

function disableLogin() {
  document.querySelector("#passwordInput").disabled = true;
  document.querySelector("#loginButton").disabled = true;
}

function setLoading(button, loading, text = "请稍候…") {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? text : button.dataset.originalText;
}
