export const ALLOWED_MOODS = new Set([
  "happy",
  "normal",
  "sad",
  "annoyed",
  "need_comfort",
  "need_space",
  "upset_with_zhang",
]);

export const ALLOWED_BODY_STATUSES = new Set([
  "good",
  "slightly_uncomfortable",
  "very_uncomfortable",
]);

export const ALLOWED_CARE_NEEDS = new Set([
  "hug",
  "chat",
  "listen_only",
  "treat",
  "hot_drink",
  "stay_together",
  "give_space",
  "comfort",
  "be_proactive",
  "just_know",
]);

export type ValidatedRecord = {
  mood: string;
  body_status: string;
  care_needs: string[];
  message: string;
};

export function validateRecord(input: unknown): ValidatedRecord {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("记录格式不正确。");
  }

  const value = input as Record<string, unknown>;
  if (typeof value.mood !== "string" || !ALLOWED_MOODS.has(value.mood)) {
    throw new Error("心情选项不正确。");
  }
  if (typeof value.body_status !== "string" || !ALLOWED_BODY_STATUSES.has(value.body_status)) {
    throw new Error("身体状态选项不正确。");
  }
  if (!Array.isArray(value.care_needs) || value.care_needs.length < 1 || value.care_needs.length > 3) {
    throw new Error("陪伴需求需要选择 1 到 3 项。");
  }

  const careNeeds = value.care_needs.map((item) => {
    if (typeof item !== "string" || !ALLOWED_CARE_NEEDS.has(item)) {
      throw new Error("陪伴需求选项不正确。");
    }
    return item;
  });
  if (new Set(careNeeds).size !== careNeeds.length) {
    throw new Error("陪伴需求不能重复。");
  }

  if (typeof value.message !== "string") {
    throw new Error("留言格式不正确。");
  }
  const message = value.message.trim();
  if ([...message].length > 100) {
    throw new Error("留言最多 100 字。");
  }

  return {
    mood: value.mood,
    body_status: value.body_status,
    care_needs: careNeeds,
    message,
  };
}

export function getBeijingDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
