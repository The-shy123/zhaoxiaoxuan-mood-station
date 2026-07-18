import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

let client;

export function getPublicConfig() {
  const raw = window.MOOD_STATION_CONFIG ?? {};
  const supabaseUrl = String(raw.supabaseUrl ?? "").trim().replace(/\/$/, "");
  const supabaseAnonKey = String(raw.supabaseAnonKey ?? "").trim();
  const adminEmail = String(raw.adminEmail ?? "").trim();
  const configured =
    /^https:\/\/.+\.supabase\.co$/i.test(supabaseUrl) &&
    supabaseAnonKey.length > 30 &&
    !supabaseAnonKey.includes("YOUR_");

  return { supabaseUrl, supabaseAnonKey, adminEmail, configured };
}

export function getSupabaseClient() {
  const config = getPublicConfig();
  if (!config.configured) {
    throw new Error("Supabase 尚未配置，请先填写 assets/js/config.js。");
  }

  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

export async function invokePublicFunction(functionName, payload) {
  const config = getPublicConfig();
  if (!config.configured) {
    throw new Error("Supabase 尚未配置，请先完成项目配置。");
  }

  const response = await fetch(`${config.supabaseUrl}/functions/v1/${functionName}`, {
    method: "POST",
    headers: {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let result;
  try {
    result = await response.json();
  } catch {
    result = {};
  }

  if (!response.ok) {
    throw new Error(result.error || "请求没有成功，请稍后再试。");
  }
  return result;
}

export function getBeijingDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

export function getBeijingDate(date = new Date()) {
  const { year, month, day } = getBeijingDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getRecentBeijingDates(numberOfDays = 7) {
  const today = getBeijingDateParts();
  const dates = [];

  for (let offset = 0; offset < numberOfDays; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day - offset, 12));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const day = date.getUTCDate();
    dates.push(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  }
  return dates;
}

export function formatBeijingTime(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatChineseDate(dateString) {
  const [, month, day] = dateString.split("-").map(Number);
  return `${month}月${day}日`;
}
