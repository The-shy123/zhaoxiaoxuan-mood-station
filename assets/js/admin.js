import { requireHomeMember } from "./auth.js";
import { BODY_STATUSES, CARE_NEEDS, MOODS, REMINDERS } from "./constants.js";
import { formatBeijingTime, formatChineseDate, getBeijingDate, getSupabaseClient } from "./supabase.js";

const loginPanel = document.querySelector("#loginPanel");
const workspacePanel = document.querySelector("#workspacePanel");
let supabase;
let todayRecord = null;

initialize();

async function initialize() {
  const member = await requireHomeMember("admin.html");
  if (!member) return;
  supabase = getSupabaseClient();
  document.querySelector("#markViewedButton").addEventListener("click", markViewed);
  if (member.profile !== "zhang") {
    document.querySelector("#markViewedButton").disabled = true;
    document.querySelector("#markViewedButton").textContent = "等张先森来回应";
  }
  await openWorkspace();
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

function setLoading(button, loading, text = "请稍候…") {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? text : button.dataset.originalText;
}
