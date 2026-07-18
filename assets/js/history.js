import { BODY_STATUSES, CARE_NEEDS, MOODS } from "./constants.js";
import {
  formatBeijingTime,
  formatChineseDate,
  getPublicConfig,
  getRecentBeijingDates,
  getSupabaseClient,
} from "./supabase.js";

const loading = document.querySelector("#historyLoading");
const authRequired = document.querySelector("#historyAuthRequired");
const errorElement = document.querySelector("#historyError");
const historyList = document.querySelector("#historyList");

initialize();

async function initialize() {
  if (!getPublicConfig().configured) {
    loading.hidden = true;
    errorElement.textContent = "Supabase 尚未配置，请先完成项目配置。";
    return;
  }

  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const session = sessionData.session;
  if (session?.user?.app_metadata?.role !== "mood_admin") {
    loading.hidden = true;
    authRequired.hidden = false;
    return;
  }

  const dates = getRecentBeijingDates(7);
  const { data, error } = await supabase
    .from("daily_records")
    .select("id, record_date, mood, body_status, care_needs, message, submitted_at, viewed, viewed_at")
    .gte("record_date", dates.at(-1))
    .lte("record_date", dates[0])
    .order("record_date", { ascending: false });

  loading.hidden = true;
  if (error) {
    errorElement.textContent = "最近七天记录读取失败，请稍后刷新再试。";
    return;
  }

  const recordByDate = new Map((data ?? []).map((record) => [record.record_date, record]));
  dates.forEach((date) => historyList.append(createHistoryItem(date, recordByDate.get(date))));
}

function createHistoryItem(date, record) {
  const details = document.createElement("details");
  details.className = `history-item${record ? "" : " history-empty"}`;
  const summary = document.createElement("summary");
  const dateElement = document.createElement("span");
  const summaryText = document.createElement("span");
  const mainText = document.createElement("strong");
  const secondaryText = document.createElement("span");

  dateElement.className = "history-date";
  summaryText.className = "history-summary";
  dateElement.textContent = formatChineseDate(date);
  mainText.textContent = record ? MOODS[record.mood]?.label ?? record.mood : "这一天没有记录。";
  secondaryText.textContent = record
    ? `${BODY_STATUSES[record.body_status]?.label ?? record.body_status} · 今天想要：${record.care_needs.map((key) => CARE_NEEDS[key] ?? key).join("、")}`
    : "";
  summaryText.append(mainText, secondaryText);
  summary.append(dateElement, summaryText);
  details.append(summary);

  const content = document.createElement("div");
  content.className = "history-details";
  if (!record) {
    const empty = document.createElement("p");
    empty.textContent = "这一天没有记录。";
    content.append(empty);
  } else {
    const list = document.createElement("dl");
    list.className = "record-list";
    addDetail(list, "心情", `${MOODS[record.mood]?.label ?? record.mood} ${MOODS[record.mood]?.emoji ?? ""}`.trim());
    addDetail(list, "身体状态", BODY_STATUSES[record.body_status]?.label ?? record.body_status);
    addDetail(list, "需求", record.care_needs.map((key) => CARE_NEEDS[key] ?? key).join("、"));
    addDetail(list, "留言", record.message || "没有留言");
    addDetail(list, "提交时间", formatBeijingTime(record.submitted_at));
    addDetail(list, "查看状态", record.viewed ? "张先森已经看到了 💗" : "宝宝专属照顾员还没有查看。");
    content.append(list);
  }
  details.append(content);
  return details;
}

function addDetail(list, label, value) {
  const row = document.createElement("div");
  const term = document.createElement("dt");
  const description = document.createElement("dd");
  term.textContent = `${label}：`;
  description.textContent = value;
  row.append(term, description);
  list.append(row);
}
