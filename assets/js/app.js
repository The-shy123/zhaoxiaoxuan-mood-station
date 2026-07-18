import { BODY_STATUSES, CARE_NEEDS, COUPONS, MOODS } from "./constants.js";
import { getBeijingDate, invokePublicFunction } from "./supabase.js";

const TOKEN_STORAGE_KEY = "mood_station_access_token";
const DRAW_STORAGE_PREFIX = "mood_station_draw_";
const LETTER_STORAGE_KEY = "mood_station_letter_opened_20260719";
const LETTER_PREVIEW = new URL(window.location.href).searchParams.get("preview") === "letter";
const state = {
  mood: "",
  body_status: "",
  care_needs: [],
  message: "",
};

const screens = [...document.querySelectorAll("[data-screen]")];
const moodReply = document.querySelector("#moodReply");
const bodyReply = document.querySelector("#bodyReply");
const messageInput = document.querySelector("#messageInput");
const todayRecordStatus = document.querySelector("#todayRecordStatus");
const toast = document.querySelector("#toast");
const letterSurprise = document.querySelector("#letterSurprise");
const surpriseEnvelope = document.querySelector("#surpriseEnvelope");
let accessToken = readAccessToken();
let statusTimer = null;
let toastTimer = null;
let letterSurpriseOpening = false;
let letterContentLoaded = false;

initialize();

function initialize() {
  document.querySelector("#accessNotice").hidden = Boolean(accessToken);
  if (accessToken) refreshWelcomeStatus();
  maybeShowLetterSurprise();
  bindSingleChoice("#moodChoices", (value) => {
    state.mood = value;
    moodReply.textContent = MOODS[value].reply;
    setError("moodError", "");
  });
  bindSingleChoice("#bodyChoices", (value) => {
    state.body_status = value;
    bodyReply.textContent = BODY_STATUSES[value].reply;
    setError("bodyError", "");
  });

  document.querySelector("#needChoices").addEventListener("click", handleNeedChoice);
  messageInput.addEventListener("input", handleMessageInput);
  document.addEventListener("click", handleAction);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (currentScreenName() === "success") checkViewStatus();
    if (currentScreenName() === "welcome") refreshWelcomeStatus();
  });
}

function readAccessToken() {
  const url = new URL(window.location.href);
  const tokenFromUrl = url.searchParams.get("token")?.trim();

  try {
    if (tokenFromUrl) sessionStorage.setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, cleanUrl);
    }
    return tokenFromUrl || sessionStorage.getItem(TOKEN_STORAGE_KEY) || "";
  } catch {
    return tokenFromUrl || "";
  }
}

function bindSingleChoice(selector, onSelect) {
  document.querySelector(selector).addEventListener("click", (event) => {
    const button = event.target.closest("[data-value]");
    if (!button) return;

    button.parentElement.querySelectorAll("[data-value]").forEach((choice) => {
      const selected = choice === button;
      choice.classList.toggle("is-selected", selected);
      choice.setAttribute("aria-checked", String(selected));
    });
    onSelect(button.dataset.value);
  });
}

function handleNeedChoice(event) {
  const button = event.target.closest("[data-value]");
  if (!button) return;
  const value = button.dataset.value;
  const existingIndex = state.care_needs.indexOf(value);

  if (existingIndex >= 0) {
    state.care_needs.splice(existingIndex, 1);
    setNeedButtonState(button, false);
  } else if (state.care_needs.length >= 3) {
    setError("needsError", "先选三个，其他的留给张先森自己想。");
    shake(button.parentElement);
    return;
  } else {
    state.care_needs.push(value);
    setNeedButtonState(button, true);
    setError("needsError", "");
  }
  document.querySelector("#needCount").textContent = state.care_needs.length;
}

function setNeedButtonState(button, selected) {
  button.classList.toggle("is-selected", selected);
  button.setAttribute("aria-pressed", String(selected));
}

function handleMessageInput() {
  const characters = [...messageInput.value];
  if (characters.length > 100) messageInput.value = characters.slice(0, 100).join("");
  document.querySelector("#messageCount").textContent = [...messageInput.value].length;
  setError("messageError", "");
}

async function handleAction(event) {
  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;
  const action = actionButton.dataset.action;

  if (action === "start") showScreen("mood");
  if (action === "open-mailbox") showScreen("mailbox");
  if (action === "open-letter") await openLetter();
  if (action === "unwrap-letter") await unwrapLetter();
  if (action === "back") showScreen(actionButton.dataset.target);
  if (action === "next-mood") {
    if (!state.mood) return setError("moodError", "选一个今天最接近的心情吧。");
    showScreen("body");
  }
  if (action === "next-body") {
    if (!state.body_status) return setError("bodyError", "选一个今天最接近的身体感觉吧。");
    showScreen("needs");
  }
  if (action === "next-needs") {
    if (!state.care_needs.length) {
      return setError("needsError", "选一个嘛，不然张先森不知道今天该做什么。");
    }
    showScreen("message");
  }
  if (action === "review") prepareReview();
  if (action === "submit") await submitRecord();
  if (action === "open-draw") openDraw();
  if (action === "draw") await drawReward();
  if (action === "show-coupon") showCoupon();
  if (action === "reroll") rerollCoupon();
  if (action === "save-coupon") await saveCoupon();
  if (action === "home") resetAndGoHome();
}

async function maybeShowLetterSurprise() {
  if (LETTER_PREVIEW) {
    document.querySelector("#surprisePreviewNote").hidden = false;
    await delay(280);
    showLetterSurprise();
    return;
  }
  if (!accessToken) return;

  const locallyOpened = hasLocallyOpenedLetter();
  let result;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      result = await invokePublicFunction("letter-status", {
        token: accessToken,
        action: "status",
      });
      break;
    } catch {
      if (attempt === 0) await delay(1200);
    }
  }

  // 状态不确定时不重复制造“首次惊喜”，信箱入口仍然可以正常阅读。
  if (!result) return;
  if (result.opened) {
    rememberLetterOpened();
    return;
  }
  if (locallyOpened) {
    markLetterOpened();
    return;
  }
  showLetterSurprise();
}

function showLetterSurprise() {
  letterSurprise.hidden = false;
  document.body.classList.add("has-letter-surprise");
  requestAnimationFrame(() => surpriseEnvelope.focus({ preventScroll: true }));
}

async function unwrapLetter() {
  if (letterSurpriseOpening) return;
  letterSurpriseOpening = true;
  surpriseEnvelope.disabled = true;
  letterSurprise.classList.add("is-opening");
  await delay(820);
  letterSurprise.hidden = true;
  letterSurprise.classList.remove("is-opening");
  document.body.classList.remove("has-letter-surprise");
  surpriseEnvelope.disabled = false;
  letterSurpriseOpening = false;
  await openLetter();
}

async function openLetter() {
  showScreen("letter");
  if (letterContentLoaded) return;

  const letterBody = document.querySelector("#letterBody");
  const signature = document.querySelector("#letterSignature");
  letterBody.replaceChildren(createLetterParagraph("正在展开信纸……", "letter-loading"));
  signature.hidden = true;

  if (!accessToken) {
    letterBody.replaceChildren(createLetterParagraph("请使用包含专属 token 的链接打开这封信。", "letter-load-error"));
    return;
  }

  try {
    const result = await invokePublicFunction("letter-status", {
      token: accessToken,
      action: "content",
    });
    const letter = result?.letter;
    if (!letter || !Array.isArray(letter.paragraphs)) throw new Error("信件内容不完整。");

    document.querySelector("#letterTitle").textContent = letter.title;
    const content = [createLetterParagraph(letter.salutation, "letter-salutation")];
    letter.paragraphs.forEach((paragraph) => content.push(createLetterParagraph(paragraph)));
    letterBody.replaceChildren(...content);
    document.querySelector("#letterSignatureName").textContent = letter.signature;
    document.querySelector("#letterSignatureDate").textContent = letter.date;
    signature.hidden = false;
    letterContentLoaded = true;
    markLetterOpened();
  } catch {
    letterBody.replaceChildren(createLetterParagraph("信纸暂时没有展开，请稍后返回信箱再试一次。", "letter-load-error"));
  }
}

function createLetterParagraph(text, className = "") {
  const paragraph = document.createElement("p");
  paragraph.textContent = String(text ?? "");
  if (className) paragraph.className = className;
  return paragraph;
}

async function markLetterOpened() {
  if (LETTER_PREVIEW || !accessToken) return;
  rememberLetterOpened();
  try {
    await invokePublicFunction("letter-status", {
      token: accessToken,
      action: "open",
    }, { keepalive: true });
  } catch {
    // 本机标记会避免重复弹出，下次访问时会再次尝试同步到服务端。
  }
}

function hasLocallyOpenedLetter() {
  try {
    return localStorage.getItem(LETTER_STORAGE_KEY) === "yes";
  } catch {
    return false;
  }
}

function rememberLetterOpened() {
  try {
    localStorage.setItem(LETTER_STORAGE_KEY, "yes");
  } catch {
    // 无痕模式可能禁止本地存储，服务端状态仍然有效。
  }
}

function prepareReview() {
  state.message = messageInput.value.trim();
  if ([...state.message].length > 100) {
    return setError("messageError", "想说的话最多 100 字。");
  }
  document.querySelector("#confirmMood").textContent = `${MOODS[state.mood].label} ${MOODS[state.mood].emoji}`;
  document.querySelector("#confirmBody").textContent = BODY_STATUSES[state.body_status].label;
  document.querySelector("#confirmNeeds").textContent = state.care_needs.map((key) => CARE_NEEDS[key]).join("、");
  document.querySelector("#confirmMessage").textContent = state.message || "没有留言";
  showScreen("confirm");
}

async function submitRecord() {
  setError("submitError", "");
  if (!accessToken) {
    setError("submitError", "专属 token 不见了，请重新使用完整链接打开页面。");
    return;
  }

  const button = document.querySelector("#submitButton");
  setButtonLoading(button, true, "正在提交…");
  try {
    await invokePublicFunction("submit-record", { token: accessToken, record: state });
    showScreen("success");
    setViewStatus(false);
    renderWelcomeStatus({ exists: true, viewed: false });
    startStatusPolling();
  } catch (error) {
    setError("submitError", friendlyError(error));
  } finally {
    setButtonLoading(button, false);
  }
}

function startStatusPolling() {
  clearInterval(statusTimer);
  checkViewStatus();
  statusTimer = window.setInterval(checkViewStatus, 15000);
}

async function checkViewStatus() {
  if (!accessToken) return;
  try {
    const result = await invokePublicFunction("record-status", { token: accessToken });
    setViewStatus(Boolean(result.viewed));
    renderWelcomeStatus(result);
    if (result.viewed) clearInterval(statusTimer);
  } catch {
    // 轮询失败时保留当前状态，下一个周期自动重试。
  }
}

async function refreshWelcomeStatus() {
  if (!accessToken) {
    todayRecordStatus.hidden = true;
    return;
  }
  try {
    const result = await invokePublicFunction("record-status", { token: accessToken });
    renderWelcomeStatus(result);
  } catch {
    // 首页状态读取失败时保持页面可用，下次回到页面会自动重试。
  }
}

function renderWelcomeStatus(result) {
  const exists = Boolean(result?.exists);
  todayRecordStatus.hidden = !exists;
  if (!exists) return;

  const viewed = Boolean(result.viewed);
  todayRecordStatus.classList.toggle("is-viewed", viewed);
  document.querySelector("#todayRecordStatusText").textContent = viewed
    ? "张先森已经看到了 💗"
    : "宝宝专属照顾员还没有查看。";
}

function setViewStatus(viewed) {
  const element = document.querySelector("#viewStatus");
  element.classList.toggle("is-viewed", viewed);
  element.lastElementChild.textContent = viewed
    ? "张先森已经看到了 💗"
    : "宝宝专属照顾员还没有查看。";
}

function openDraw() {
  const stored = getTodayDraw();
  if (!stored) {
    resetDrawStage();
    showScreen("draw");
    return;
  }
  if (!stored.won) {
    showScreen("lose");
    return;
  }
  renderCoupon(stored.couponIndex, stored.rerolled);
  showScreen("coupon");
}

async function drawReward() {
  if (getTodayDraw()) return openDraw();
  const button = document.querySelector("#drawButton");
  const stage = document.querySelector("#drawStage");
  button.disabled = true;
  stage.classList.add("is-drawing");
  document.querySelector("#drawingText").textContent = "正在抽取今日奖励……";

  await delay(1500);
  const won = randomUnit() < 0.25;
  const result = {
    date: getBeijingDate(),
    won,
    couponIndex: won ? randomIndex(COUPONS.length) : null,
    rerolled: false,
  };
  saveTodayDraw(result);
  showScreen(won ? "win" : "lose");
}

function showCoupon() {
  const result = getTodayDraw();
  if (!result?.won) return showScreen("lose");
  renderCoupon(result.couponIndex, result.rerolled);
  showScreen("coupon");
}

function renderCoupon(index, rerolled) {
  const coupon = COUPONS[index];
  document.querySelector("#couponTitle").textContent = coupon.title;
  document.querySelector("#couponDescription").textContent = coupon.description;
  const rerollButton = document.querySelector("#rerollButton");
  rerollButton.disabled = Boolean(rerolled);
  rerollButton.hidden = Boolean(rerolled);
  document.querySelector("#saveTip").textContent = "可以截图保存这张券。";
}

function rerollCoupon() {
  const result = getTodayDraw();
  if (!result?.won || result.rerolled) return;
  result.couponIndex = randomIndex(COUPONS.length);
  result.rerolled = true;
  saveTodayDraw(result);
  renderCoupon(result.couponIndex, true);
  const card = document.querySelector("#couponCard");
  card.style.animation = "none";
  requestAnimationFrame(() => {
    card.style.animation = "";
  });
  showToast("已经换成新的照顾券啦。今天不能再换咯。");
}

async function saveCoupon() {
  const result = getTodayDraw();
  if (!result?.won) return;
  const coupon = COUPONS[result.couponIndex];
  const shareText = `赵小萱宝宝的今日照顾券：${coupon.title}\n${coupon.description.replaceAll("\n", "")}`;

  if (navigator.share) {
    try {
      await navigator.share({ title: coupon.title, text: shareText });
      return;
    } catch (error) {
      if (error.name === "AbortError") return;
    }
  }
  document.querySelector("#saveTip").textContent = "请截图保存；电脑端也可以在打印窗口中另存。";
  window.print();
}

function getTodayDraw() {
  try {
    const raw = localStorage.getItem(`${DRAW_STORAGE_PREFIX}${getBeijingDate()}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.date !== getBeijingDate() || typeof parsed.won !== "boolean") return null;
    if (parsed.won && (!Number.isInteger(parsed.couponIndex) || !COUPONS[parsed.couponIndex])) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveTodayDraw(result) {
  try {
    localStorage.setItem(`${DRAW_STORAGE_PREFIX}${getBeijingDate()}`, JSON.stringify(result));
  } catch {
    // 隐私模式无法写入时，本次页面会继续显示结果。
  }
}

function randomUnit() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] / 4294967296;
}

function randomIndex(length) {
  return Math.floor(randomUnit() * length);
}

function resetDrawStage() {
  document.querySelector("#drawStage").classList.remove("is-drawing");
  document.querySelector("#drawingText").textContent = "";
  document.querySelector("#drawButton").disabled = false;
}

function resetAndGoHome() {
  clearInterval(statusTimer);
  Object.assign(state, { mood: "", body_status: "", care_needs: [], message: "" });
  document.querySelectorAll(".is-selected").forEach((element) => element.classList.remove("is-selected"));
  document.querySelectorAll('[aria-checked="true"]').forEach((element) => element.setAttribute("aria-checked", "false"));
  document.querySelectorAll('[aria-pressed="true"]').forEach((element) => element.setAttribute("aria-pressed", "false"));
  moodReply.textContent = "";
  bodyReply.textContent = "";
  messageInput.value = "";
  document.querySelector("#messageCount").textContent = "0";
  document.querySelector("#needCount").textContent = "0";
  showScreen("welcome");
  refreshWelcomeStatus();
}

function showScreen(name) {
  screens.forEach((screen) => {
    const active = screen.dataset.screen === name;
    screen.classList.toggle("is-active", active);
    screen.hidden = !active;
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  const heading = document.querySelector(`[data-screen="${name}"] h1, [data-screen="${name}"] h2`);
  if (heading && name !== "welcome") heading.setAttribute("tabindex", "-1"), heading.focus({ preventScroll: true });
}

function currentScreenName() {
  return document.querySelector("[data-screen].is-active")?.dataset.screen;
}

function setError(id, message) {
  document.getElementById(id).textContent = message;
}

function setButtonLoading(button, loading, loadingText = "请稍候…") {
  if (!button.dataset.originalText) button.dataset.originalText = button.textContent;
  button.disabled = loading;
  button.textContent = loading ? loadingText : button.dataset.originalText;
}

function friendlyError(error) {
  if (!navigator.onLine) return "现在好像没有网络，连上以后再试一次吧。";
  return error?.message || "提交没有成功，请稍后再试。";
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 2800);
}

function shake(element) {
  element.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 220 },
  );
}

function delay(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}
