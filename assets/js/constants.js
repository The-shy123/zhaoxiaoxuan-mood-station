export const MOODS = Object.freeze({
  happy: {
    label: "今天心情不错",
    emoji: "☀️",
    reply: "嘿嘿，那张先森今天也沾点你的开心。",
  },
  normal: {
    label: "还可以啦",
    emoji: "🌤️",
    reply: "好呀，今天就按舒服的节奏来。",
  },
  sad: {
    label: "有点不开心",
    emoji: "🌧️",
    reply: "张先森知道啦，今天多陪着你一点。",
  },
  annoyed: {
    label: "今天有点烦",
    emoji: "⛈️",
    reply: "收到，张先森今天乖一点。",
  },
  need_comfort: {
    label: "想让张先森哄哄",
    emoji: "🥺",
    reply: "好，哄赵小萱宝宝这件事交给张先森。",
  },
  need_space: {
    label: "想自己安静一下",
    emoji: "🌙",
    reply: "好，张先森先不吵你，需要的时候一直在。",
  },
  upset_with_zhang: {
    label: "对张先森还有点小情绪",
    emoji: "😤",
    reply: "收到，张先森今天好好表现。",
  },
});

export const BODY_STATUSES = Object.freeze({
  good: {
    label: "还不错",
    reply: "那就好，不过也别太累啦。",
  },
  slightly_uncomfortable: {
    label: "有点难受",
    reply: "张先森记住了，今天多照顾你一点。",
  },
  very_uncomfortable: {
    label: "比较难受",
    reply: "知道啦，今天先让自己舒服一点。",
  },
});

export const CARE_NEEDS = Object.freeze({
  hug: "抱抱我",
  chat: "陪我聊聊天",
  listen_only: "听我吐槽，不要分析",
  treat: "给我买点好吃的",
  hot_drink: "给我准备一杯热饮",
  stay_together: "陪我待一会儿",
  give_space: "让我自己安静一会儿",
  comfort: "哄哄我",
  be_proactive: "主动一点",
  just_know: "什么都不用做，知道就好",
});

export const REMINDERS = Object.freeze({
  mood: {
    sad: "多留意一下她，做点实际的事情。",
    annoyed: "今天少讲道理，多一点耐心。",
    need_comfort: "主动一点，不要等她一直提醒。",
    need_space: "先给她一点空间。",
    upset_with_zhang: "别急着解释，好好表现。",
  },
  body: {
    slightly_uncomfortable: "记得问问她需不需要热饮或者吃点东西。",
    very_uncomfortable: "今天先关心她身体舒不舒服。",
  },
});

export const COUPONS = Object.freeze([
  {
    title: "无限抱抱券",
    description: "凭这张券，可以找张先森兑换一个抱抱。\n\n抱多久由赵小萱宝宝决定。",
  },
  {
    title: "陪伴券",
    description: "今天张先森负责陪赵小萱宝宝一会儿。",
  },
  {
    title: "不讲大道理券",
    description: "使用以后，张先森只负责听。",
  },
  {
    title: "甜品小奖励券",
    description: "可以指定一个小甜品。\n\n张先森根据实际情况安排。",
  },
  {
    title: "热饮券",
    description: "今天安排一杯暖暖的东西。",
  },
  {
    title: "主动关心券",
    description: "今天张先森主动照顾赵小萱宝宝。",
  },
  {
    title: "今日任性券",
    description: "今天可以稍微任性一点。\n\n张先森负责耐心一点。",
  },
]);
