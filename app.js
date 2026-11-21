"use strict";

const STORAGE_KEY = "wirdi-quran-tracker-v1";
const TOTAL_AYAHS = 6236;
const PRAYERS = [
  { id: "fajr", name: "الفجر", symbol: "☼" },
  { id: "dhuhr", name: "الظهر", symbol: "◉" },
  { id: "asr", name: "العصر", symbol: "◷" },
  { id: "maghrib", name: "المغرب", symbol: "☾" },
  { id: "isha", name: "العشاء", symbol: "✦" }
];
const NUMBER = new Intl.NumberFormat("ar");
const DATE_FORMAT = new Intl.DateTimeFormat("ar-PS", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const defaults = {
  version: 2,
  settings: { fajrTime: "04:30", dailyAyahCount: 5, startSurah: 1, startAyah: 1, textScale: 1, activePrayer: "fajr", autoPrayerDetect: false },
  days: {}
};

let state = loadState();
let surahs = [];
let verses = [];
let surahOffsets = new Map();
let toastTimer = null;
let currentDayKey = "";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return structuredClone(defaults);
    const parsed = JSON.parse(saved);
    const next = {
      ...structuredClone(defaults),
      ...parsed,
      settings: { ...defaults.settings, ...(parsed.settings || {}) },
      days: parsed.days && typeof parsed.days === "object" ? parsed.days : {}
    };
    Object.entries(next.days).forEach(([key, record]) => { next.days[key] = normalizeDayRecord(record, key); });
    next.version = 2;
    return next;
  } catch (error) {
    return structuredClone(defaults);
  }
}

function blankRepetitions() {
  return Object.fromEntries(PRAYERS.map((prayer) => [prayer.id, { reading: 0, memorization: 0 }]));
}

function normalizeDayRecord(record, key) {
  const normalized = { ...(record || {}) };
  const source = normalized.repetitions && typeof normalized.repetitions === "object" ? normalized.repetitions : {};
  normalized.repetitions = blankRepetitions();
  PRAYERS.forEach((prayer) => {
    const old = source[prayer.id];
    if (typeof old === "number") normalized.repetitions[prayer.id].memorization = Math.max(0, old);
    else if (old && typeof old === "object") {
      normalized.repetitions[prayer.id].reading = Math.max(0, Number(old.reading) || 0);
      normalized.repetitions[prayer.id].memorization = Math.max(0, Number(old.memorization) || 0);
    }
  });
  normalized.dateKey = normalized.dateKey || key;
  normalized.count = Math.max(1, Number(normalized.count) || 5);
  normalized.startGlobal = Math.max(0, Number(normalized.startGlobal) || 0);
  normalized.cycle = Math.max(1, Number(normalized.cycle) || 1);
  normalized.tasmee = { surahId: 1, ayahs: normalized.count, repetitions: 0, repetitionsManual: false, status: "not-done", errors: 0, saved: false, ...(normalized.tasmee || {}) };
  normalized.tafsir = { watched: false, vocabulary: false, summarized: false, notes: "", ...(normalized.tafsir || {}) };
  normalized.closed = Boolean(normalized.closed);
  return normalized;
}

function saveState(message) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) showToast(message);
    return true;
  } catch (error) {
    showToast("تعذّر الحفظ في هذا المتصفح. تأكد من توفر مساحة التخزين.", true);
    return false;
  }
}

function showToast(message, isError) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.toggle("error", Boolean(isError));
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function localDateKey(date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function dateForKey(key) {
  const parts = key.split("-").map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function currentFajrDayKey(now) {
  const place = getMiqatPlace();
  if (place) {
    try {
      const parts = datePartsInZone(now, place.timezone);
      let key = [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
      const times = localPrayerTimes(place, now);
      if (times && now.getTime() < times.fajr) {
        const previous = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - 1));
        key = [previous.getUTCFullYear(), String(previous.getUTCMonth() + 1).padStart(2, "0"), String(previous.getUTCDate()).padStart(2, "0")].join("-");
      }
      if (times) return key;
    } catch (error) {}
  }
  const parts = String(state.settings.fajrTime || "04:30").split(":").map(Number);
  const fajrMinutes = (parts[0] || 0) * 60 + (parts[1] || 0);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  if (nowMinutes < fajrMinutes) day.setDate(day.getDate() - 1);
  return localDateKey(day);
}

function dayTemplate(key, startGlobal, count, cycle) {
  const firstVerse = verses[Math.max(0, Math.min(startGlobal, verses.length - 1))];
  return {
    dateKey: key,
    startGlobal: Math.max(0, Math.min(startGlobal, verses.length - 1)),
    count: Math.max(1, Math.min(count, verses.length)),
    cycle: cycle || 1,
    repetitions: blankRepetitions(),
    tasmee: { surahId: firstVerse ? firstVerse.surahId : 1, ayahs: count, repetitions: 0, repetitionsManual: false, status: "not-done", errors: 0, saved: false },
    tafsir: { watched: false, vocabulary: false, summarized: false, notes: "" },
    closed: false,
    createdAt: new Date().toISOString()
  };
}

function getTodayRecord() {
  const key = currentFajrDayKey(new Date());
  if (key !== currentDayKey) currentDayKey = key;
  if (!state.days[key]) {
    const previousKeys = Object.keys(state.days).filter((item) => item < key).sort();
    let startGlobal = (surahOffsets.get(Number(state.settings.startSurah)) || 0) + Number(state.settings.startAyah || 1) - 1;
    let cycle = 1;
    if (previousKeys.length) {
      const previous = state.days[previousKeys[previousKeys.length - 1]];
      startGlobal = Number(previous.startGlobal || 0) + Number(previous.count || 1);
      cycle = Number(previous.cycle || 1);
      if (startGlobal >= verses.length) {
        startGlobal = 0;
        cycle += 1;
      }
    }
    startGlobal = Math.max(0, Math.min(startGlobal, verses.length - 1));
    const remaining = verses.length - startGlobal;
    const count = Math.min(Number(state.settings.dailyAyahCount) || 5, remaining);
    state.days[key] = dayTemplate(key, startGlobal, count, cycle);
    state.days[key].tasmee.ayahs = count;
    saveState();
  }
  return state.days[key];
}

function getPrayerCount(record, prayerId, mode) {
  const value = record.repetitions[prayerId];
  if (typeof value === "number") return mode === "memorization" ? value : 0;
  return Number(value?.[mode]) || 0;
}

function getModeTotal(record, mode) {
  return PRAYERS.reduce((sum, prayer) => sum + getPrayerCount(record, prayer.id, mode), 0);
}

function getDayTotal(record) {
  return getModeTotal(record, "reading") + getModeTotal(record, "memorization");
}

function getMiqatPlace() {
  try {
    const place = JSON.parse(localStorage.getItem("dailyDashboard.location.v1") || "null");
    if (!place || !Number.isFinite(place.latitude) || !Number.isFinite(place.longitude) || !place.timezone || ![3, 4, 5].includes(Number(place.method))) return null;
    return place;
  } catch (error) {
    return null;
  }
}

function datePartsInZone(date, timezone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) };
}

function localPrayerTimes(place, now) {
  if (!window.adhan) return null;
  const parts = datePartsInZone(now, place.timezone);
  const dateKey = [parts.year, String(parts.month).padStart(2, "0"), String(parts.day).padStart(2, "0")].join("-");
  const methodNames = { 3: "MuslimWorldLeague", 4: "UmmAlQura", 5: "Egyptian" };
  const methodName = methodNames[Number(place.method)];
  const methodFactory = window.adhan.CalculationMethod[methodName];
  if (!methodFactory) return null;
  const coordinates = new window.adhan.Coordinates(place.latitude, place.longitude);
  const parameters = methodFactory();
  parameters.madhab = window.adhan.Madhab.Shafi;
  parameters.highLatitudeRule = window.adhan.HighLatitudeRule.recommended(coordinates);
  parameters.polarCircleResolution = window.adhan.PolarCircleResolution.AqrabBalad;
  if (Number(place.method) === 4) {
    const hijriMonth = Number(new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", timeZone: "UTC" }).format(new Date(dateKey + "T12:00:00Z")));
    if (hijriMonth === 9) parameters.ishaInterval = 120;
  }
  const prayerDate = new Date(parts.year, parts.month - 1, parts.day);
  const times = new window.adhan.PrayerTimes(coordinates, prayerDate, parameters);
  return { fajr: times.fajr.getTime(), dhuhr: times.dhuhr.getTime(), asr: times.asr.getTime(), maghrib: times.maghrib.getTime(), isha: times.isha.getTime() };
}

function detectCurrentPrayer(now) {
  const place = getMiqatPlace();
  if (!place) return { prayer: null, message: "للتحديد التلقائي، احفظ موقعك أولًا في صفحة ميقات." };
  try {
    const times = localPrayerTimes(place, now);
    if (!times || !Object.values(times).every(Number.isFinite)) return { prayer: null, message: "تعذّر حساب المواقيت. اختر الصلاة يدويًا أو راجع إعدادات ميقات." };
    const timestamp = now.getTime();
    let id = "isha";
    if (timestamp >= times.fajr && timestamp < times.dhuhr) id = "fajr";
    else if (timestamp >= times.dhuhr && timestamp < times.asr) id = "dhuhr";
    else if (timestamp >= times.asr && timestamp < times.maghrib) id = "asr";
    else if (timestamp >= times.maghrib && timestamp < times.isha) id = "maghrib";
    const methodLabels = { 3: "رابطة العالم الإسلامي", 4: "أم القرى", 5: "الهيئة المصرية" };
    return { prayer: id, message: "تحديد تلقائي حسب مواقيت ميقات • " + (place.label || "موقعك") + " • " + methodLabels[Number(place.method)] };
  } catch (error) {
    return { prayer: null, message: "تعذّر حساب الصلاة تلقائيًا. اخترها يدويًا أو راجع موقعك في ميقات." };
  }
}

function formatNumber(value) {
  return NUMBER.format(Number(value) || 0);
}

function groupedPassage(startGlobal, count) {
  const selected = verses.slice(startGlobal, Math.min(startGlobal + count, verses.length));
  const groups = [];
  selected.forEach((verse) => {
    let group = groups[groups.length - 1];
    if (!group || group.surahId !== verse.surahId) {
      group = { surahId: verse.surahId, name: verse.surahName, first: verse.ayah, last: verse.ayah };
      groups.push(group);
    } else {
      group.last = verse.ayah;
    }
  });
  return groups;
}

function passageLabel(record) {
  return groupedPassage(record.startGlobal, record.count).map((part) => {
    return part.name + " " + formatNumber(part.first) + "–" + formatNumber(part.last);
  }).join("، ");
}

function firstVerseInRecord(record) {
  return verses[record.startGlobal] || verses[0];
}

function syncTasmeeDefaults(record) {
  const first = firstVerseInRecord(record);
  record.tasmee = record.tasmee || {};
  if (!record.tasmee.surahId) record.tasmee.surahId = first ? first.surahId : 1;
  if (record.tasmee.ayahs == null) record.tasmee.ayahs = record.count;
  if (record.tasmee.repetitions == null) record.tasmee.repetitions = getModeTotal(record, "memorization");
  if (record.tasmee.repetitionsManual == null) record.tasmee.repetitionsManual = false;
  if (!record.tasmee.status) record.tasmee.status = "not-done";
  if (record.tasmee.errors == null) record.tasmee.errors = 0;
  if (record.tasmee.saved == null) record.tasmee.saved = false;
}

function makeSelectOptions(select, selectedId) {
  select.replaceChildren();
  surahs.forEach((surah) => {
    const option = document.createElement("option");
    option.value = String(surah.id);
    option.textContent = surah.name;
    if (surah.id === Number(selectedId)) option.selected = true;
    select.append(option);
  });
}

function renderVersePassage(record) {
  const start = Math.max(0, Math.min(record.startGlobal, verses.length - 1));
  const selected = verses.slice(start, Math.min(start + record.count, verses.length));
  const groups = groupedPassage(start, record.count);
  const lastGroup = groups[groups.length - 1];
  const oneSurah = groups.length === 1;
  $("#passage-title").textContent = oneSurah
    ? groups[0].name + " • الآيات " + formatNumber(groups[0].first) + "–" + formatNumber(groups[0].last)
    : groups.length
      ? groups[0].name + " " + formatNumber(groups[0].first) + "–" + formatNumber(groups[0].last) + "، " + lastGroup.name + " " + formatNumber(lastGroup.first) + "–" + formatNumber(lastGroup.last)
      : "ورد القرآن الكريم";
  $("#passage-count").textContent = formatNumber(selected.length) + (selected.length === 1 ? " آية" : " آيات");
  const list = $("#verses-list");
  list.replaceChildren();
  let currentSurah = 0;
  selected.forEach((verse) => {
    if (verse.surahId !== currentSurah) {
      currentSurah = verse.surahId;
      const divider = document.createElement("div");
      divider.className = "surah-divider";
      divider.textContent = verse.surahName;
      list.append(divider);
    }
    const unit = document.createElement("span");
    unit.className = "verse-unit";
    unit.textContent = verse.text + " ";
    const marker = document.createElement("span");
    marker.className = "verse-number";
    marker.setAttribute("aria-label", "الآية " + formatNumber(verse.ayah));
    marker.textContent = formatNumber(verse.ayah);
    unit.append(marker);
    list.append(unit);
  });
  list.style.setProperty("--quran-size", (30 * state.settings.textScale) + "px");
  $("#font-size-label").textContent = formatNumber(Math.round(state.settings.textScale * 100)) + "٪";
}

function renderPrayerCounters(record) {
  const total = getDayTotal(record);
  let activeId = PRAYERS.some((prayer) => prayer.id === state.settings.activePrayer) ? state.settings.activePrayer : "fajr";
  let detectionMessage = "اختيار يدوي • سجّل كل تكرار بعد الصلاة.";
  if (state.settings.autoPrayerDetect) {
    const detection = detectCurrentPrayer(new Date());
    detectionMessage = detection.message;
    if (detection.prayer && detection.prayer !== activeId) {
      activeId = detection.prayer;
      state.settings.activePrayer = activeId;
      saveState();
    }
  }
  const active = PRAYERS.find((prayer) => prayer.id === activeId) || PRAYERS[0];
  const activeCount = getPrayerCount(record, active.id, "memorization");
  const activeReadingCount = getPrayerCount(record, active.id, "reading");
  const activeTotal = activeCount + activeReadingCount;
  $("#active-prayer").value = active.id;
  $("#auto-prayer-detect").checked = Boolean(state.settings.autoPrayerDetect);
  $("#active-prayer-name").textContent = active.name;
  $("#active-prayer-symbol").textContent = active.symbol;
  $("#counter-number").textContent = formatNumber(activeCount);
  $("#counter-reading-count").textContent = formatNumber(activeReadingCount);
  $("#reset-prayer-label").textContent = "عدّاد الحفظ • " + active.name;
  $("#increment-counter").disabled = record.closed;
  $("#increment-counter").setAttribute("aria-label", "تسجيل تكرار حفظ لآيات الورد بعد صلاة " + active.name);
  $("#counter-target").textContent = "مجموع الصلاة " + formatNumber(activeTotal) + " من ١٠ تكرارات";
  $("#counter-progress").style.width = Math.min(activeTotal * 10, 100) + "%";
  $("#reset-counter").disabled = record.closed || activeCount === 0;
  $("#reading-prayer-name").textContent = active.name;
  $("#reading-counter-number").textContent = formatNumber(activeReadingCount);
  $("#increment-reading-counter").disabled = record.closed;
  $("#increment-reading-counter").setAttribute("aria-label", "تسجيل تكرار قراءة لآيات الورد بعد صلاة " + active.name);
  $("#prayer-detection-status").textContent = detectionMessage;
  $("#home-passage-range").textContent = passageLabel(record);
  const ayahCount = formatNumber(Math.min(record.count, verses.length - record.startGlobal));
  $("#home-passage-count").textContent = ayahCount + " آيات • اليوم";
  $("#practice-passage-range").textContent = passageLabel(record);
  $("#practice-passage-count").textContent = ayahCount + " آيات";
  $("#practice-date").textContent = "بعد العشاء • " + dateLabel(record.dateKey);
  const summary = $("#summary-prayers");
  summary.replaceChildren();
  PRAYERS.forEach((prayer) => {
    const cell = document.createElement("div");
    cell.className = "summary-prayer";
    const label = document.createElement("span");
    label.textContent = prayer.name;
    const count = document.createElement("strong");
    const memorization = getPrayerCount(record, prayer.id, "memorization");
    const reading = getPrayerCount(record, prayer.id, "reading");
    count.textContent = formatNumber(memorization + reading);
    const modes = document.createElement("small");
    modes.textContent = "حفظ " + formatNumber(memorization) + " • قراءة " + formatNumber(reading);
    cell.append(label, count, modes);
    summary.append(cell);
  });
  $("#daily-total").textContent = formatNumber(total);
  $("#daily-target-label").textContent = formatNumber(total) + " من ٥٠ تكرارًا";
  const status = $("#daily-target-status");
  status.textContent = total >= 50 ? "أتممت الحد الأدنى" : "بقي " + formatNumber(50 - total) + " للوصول للحد الأدنى";
  $("#daily-progress-bar").style.width = Math.min(total / 50 * 100, 100) + "%";
}

function completedProgress() {
  const completed = Object.values(state.days).filter((record) => record.closed);
  if (!completed.length) return { count: 0, end: -1, cycle: 1 };
  const cycle = Math.max(...completed.map((record) => Number(record.cycle) || 1));
  const ranges = completed.filter((record) => (Number(record.cycle) || 1) === cycle).map((record) => {
    const first = Math.max(0, Number(record.startGlobal) || 0);
    const last = Math.min(verses.length - 1, first + (Number(record.count) || 1) - 1);
    return { first, last };
  }).sort((a, b) => a.first - b.first);
  const unique = new Set();
  let end = -1;
  ranges.forEach((range) => {
    end = Math.max(end, range.last);
    for (let index = range.first; index <= range.last; index += 1) unique.add(index);
  });
  return { count: unique.size, end, cycle };
}

function renderOverallProgress() {
  const progress = completedProgress();
  const location = $("#overall-location");
  if (progress.end < 0) {
    location.textContent = "ابدأ أول وِرد لك";
  } else {
    const verse = verses[progress.end];
    location.textContent = "الختمة " + formatNumber(progress.cycle) + " • " + verse.surahName + "، الآية " + formatNumber(verse.ayah);
  }
  $("#overall-count").textContent = formatNumber(progress.count) + " من " + formatNumber(TOTAL_AYAHS) + " آية مختومة";
  $("#overall-percent").textContent = formatNumber(Math.floor(progress.count / TOTAL_AYAHS * 100)) + "٪";
}

function renderTasmee(record) {
  syncTasmeeDefaults(record);
  makeSelectOptions($("#tasmee-surah"), record.tasmee.surahId);
  $("#tasmee-ayahs").value = record.tasmee.ayahs;
  $("#tasmee-repetitions").value = record.tasmee.repetitions;
  $("#mistake-count").textContent = formatNumber(record.tasmee.errors);
  $$('input[name="tasmee-status"]').forEach((radio) => { radio.checked = radio.value === record.tasmee.status; });
  renderTasmeePreview(record);
}

function renderTasmeePreview(record) {
  $("#tasmee-status-preview").textContent = record.tasmee.saved
    ? (record.tasmee.status === "done" ? "التسميع: تم • " : "التسميع: لم يتم • ") + formatNumber(record.tasmee.errors) + " أخطاء"
    : "لم يُسجّل تسميع اليوم";
}

function renderTafsir(record) {
  record.tafsir = { watched: false, vocabulary: false, summarized: false, notes: "", ...(record.tafsir || {}) };
  $("#tafsir-watched").checked = Boolean(record.tafsir.watched);
  $("#tafsir-vocabulary").checked = Boolean(record.tafsir.vocabulary);
  $("#tafsir-summarized").checked = Boolean(record.tafsir.summarized);
  $("#tafsir-notes").value = record.tafsir.notes || "";
  renderTafsirPreview(record);
}

function renderTafsirPreview(record) {
  const complete = [record.tafsir.watched, record.tafsir.vocabulary, record.tafsir.summarized].filter(Boolean).length;
  $("#tafsir-status-preview").textContent = complete ? formatNumber(complete) + " من ٣ خطوات مكتملة" : "تابع فهمك لمعاني الآيات";
}

function renderDayState(record) {
  document.documentElement.style.setProperty("--quran-size", (30 * state.settings.textScale) + "px");
  $("#today-label").textContent = "وِرد اليوم • الختمة " + formatNumber(record.cycle);
  const savedPlace = getMiqatPlace();
  const startText = savedPlace ? "يبدأ حسب فجر " + (savedPlace.label || "موقعك") : "يبدأ عند " + (state.settings.fajrTime || "04:30");
  $("#today-date").textContent = DATE_FORMAT.format(dateForKey(record.dateKey)) + " • " + startText;
  renderVersePassage(record);
  renderPrayerCounters(record);
  renderOverallProgress();
  renderTasmee(record);
  renderTafsir(record);
  $("#toggle-edit-passage").disabled = record.closed;
  if (record.closed) {
    $("#passage-editor").hidden = true;
    $("#tasmee-panel").hidden = true;
    $("#tafsir-panel").hidden = true;
  }
  $("#close-day").hidden = record.closed;
  $("#reopen-day").hidden = !record.closed;
  $("#reopen-day").textContent = "إعادة فتح اليوم للتعديل";
  if (record.closed) {
    $("#close-day").textContent = "تم حفظ وختم هذا اليوم";
    $("#close-day").hidden = false;
    $("#close-day").disabled = true;
  } else {
    $("#close-day").textContent = "حفظ وختم اليوم ✓";
    $("#close-day").disabled = false;
  }
}

function dateLabel(key) {
  return DATE_FORMAT.format(dateForKey(key));
}

function renderHistory() {
  const records = Object.values(state.days).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const completed = records.filter((record) => record.closed);
  const repetitions = completed.reduce((sum, record) => sum + getDayTotal(record), 0);
  const totalAyahs = completed.reduce((sum, record) => sum + (Number(record.count) || 0), 0);
  $("#history-overview").innerHTML = "";
  [
    ["أيام مختومة", formatNumber(completed.length)],
    ["مجموع التكرارات", formatNumber(repetitions)],
    ["آيات في الأوراد", formatNumber(totalAyahs)]
  ].forEach((item) => {
    const stat = document.createElement("div");
    stat.className = "history-stat";
    const label = document.createElement("span");
    label.textContent = item[0];
    const value = document.createElement("strong");
    value.textContent = item[1];
    stat.append(label, value);
    $("#history-overview").append(stat);
  });
  const list = $("#history-list");
  list.replaceChildren();
  $("#history-empty").hidden = records.length > 0;
  records.forEach((record) => {
    syncTasmeeDefaults(record);
    const details = document.createElement("details");
    details.className = "history-card";
    const summary = document.createElement("summary");
    summary.className = "history-summary";
    const left = document.createElement("span");
    const date = document.createElement("span");
    date.className = "history-date";
    date.textContent = dateLabel(record.dateKey);
    const range = document.createElement("strong");
    range.className = "history-range";
    range.textContent = passageLabel(record);
    const meta = document.createElement("span");
    meta.className = "history-meta";
    const dayTag = document.createElement("span");
    dayTag.className = "status-tag " + (record.closed ? "done" : "pending");
    dayTag.textContent = record.closed ? "اليوم مختوم" : "قيد المتابعة";
    const tasmeeTag = document.createElement("span");
    tasmeeTag.className = "status-tag " + (record.tasmee.saved && record.tasmee.status === "done" ? "done" : "");
    tasmeeTag.textContent = "التسميع: " + (record.tasmee.saved && record.tasmee.status === "done" ? "تم" : record.tasmee.saved ? "لم يتم" : "غير مسجل");
    meta.append(dayTag, tasmeeTag);
    left.append(date, range, meta);
    const total = document.createElement("span");
    total.className = "history-total";
    total.textContent = formatNumber(getDayTotal(record));
    const totalSmall = document.createElement("small");
    totalSmall.textContent = "تكرارًا";
    total.append(totalSmall);
    summary.append(left, total);
    const detail = document.createElement("div");
    detail.className = "history-detail";
    const prayerBreakdown = document.createElement("div");
    prayerBreakdown.className = "history-detail-grid";
    PRAYERS.forEach((prayer) => {
      const cell = document.createElement("span");
      const label = document.createElement("span");
      label.textContent = prayer.name;
      const value = document.createElement("strong");
      const memorization = getPrayerCount(record, prayer.id, "memorization");
      const reading = getPrayerCount(record, prayer.id, "reading");
      value.textContent = formatNumber(memorization + reading);
      const modes = document.createElement("small");
      modes.textContent = "حفظ " + formatNumber(memorization) + " / قراءة " + formatNumber(reading);
      cell.append(label, value, modes);
      prayerBreakdown.append(cell);
    });
    const extra = document.createElement("p");
    extra.className = "history-detail-note";
    const tafsirCount = [record.tafsir.watched, record.tafsir.vocabulary, record.tafsir.summarized].filter(Boolean).length;
    const tafsirText = "التفسير: " + formatNumber(tafsirCount) + " من ٣ خطوات" + (record.tafsir.notes ? " • الملاحظة: " + record.tafsir.notes : "");
    const tasmeeSurah = surahs[Number(record.tasmee.surahId) - 1]?.name || "السورة غير محددة";
    const tasmeeText = record.tasmee.saved
      ? "التسميع: " + tasmeeSurah + " • " + formatNumber(record.tasmee.ayahs) + " آيات • " + formatNumber(record.tasmee.repetitions) + " تكرار • " + (record.tasmee.status === "done" ? "تم" : "لم يتم")
      : "التسميع: غير مسجل";
    extra.textContent = tasmeeText + " • عدد الأخطاء: " + formatNumber(record.tasmee.errors) + " • " + tafsirText;
    detail.append(prayerBreakdown, extra);
    details.append(summary, detail);
    list.append(details);
  });
}

function fillSettings() {
  $("#setting-fajr-time").value = state.settings.fajrTime || "04:30";
  $("#setting-ayah-count").value = state.settings.dailyAyahCount || 5;
  makeSelectOptions($("#setting-start-surah"), state.settings.startSurah || 1);
  $("#setting-start-ayah").value = state.settings.startAyah || 1;
  updateAyahMax($("#setting-start-surah"), $("#setting-start-ayah"));
}

function updateAyahMax(select, input) {
  const surah = surahs[Number(select.value) - 1];
  if (!surah) return;
  input.max = String(surah.ayas.length);
  if (Number(input.value) > surah.ayas.length) input.value = String(surah.ayas.length);
}

function renderAll() {
  const record = getTodayRecord();
  renderDayState(record);
  renderHistory();
  fillSettings();
}

function createBackupFile() {
  return new Blob([JSON.stringify({
    format: "wirdi-quran-backup",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: state
  }, null, 2)], { type: "application/json" });
}

function downloadBackup(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = "wirdi-quran-backup-" + localDateKey(new Date()) + ".json";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportBackup() {
  const feedback = $("#backup-feedback");
  const file = createBackupFile();
  try {
    if (typeof File === "function" && typeof navigator.share === "function" && typeof navigator.canShare === "function") {
      const shareFile = new File([file], "wirdi-quran-backup-" + localDateKey(new Date()) + ".json", { type: "application/json" });
      if (navigator.canShare({ files: [shareFile] })) {
        await navigator.share({ files: [shareFile], title: "نسخة احتياطية من وِردي", text: "سجل وِردي للقرآن الكريم" });
        feedback.textContent = "فُتحت قائمة المشاركة لإرسال النسخة أو حفظها.";
        return;
      }
    }
  } catch (error) {
    if (error && error.name === "AbortError") {
      feedback.textContent = "أُلغيت المشاركة؛ يمكنك المحاولة مرة أخرى.";
      return;
    }
  }
  downloadBackup(file);
  feedback.textContent = "تم تنزيل ملف النسخة الاحتياطية؛ أرفقه بالبريد أو ارفعه إلى الموقع الذي تريده.";
}

function prepareImportedState(payload) {
  if (!payload || payload.format !== "wirdi-quran-backup" || !payload.data || typeof payload.data !== "object") {
    throw new Error("صيغة ملف النسخة الاحتياطية غير معروفة.");
  }
  const source = payload.data;
  if (!source.settings || typeof source.settings !== "object" || !source.days || typeof source.days !== "object" || Array.isArray(source.days)) {
    throw new Error("ملف النسخة الاحتياطية لا يحتوي على الإعدادات والسجل بصورة صحيحة.");
  }
  const imported = {
    ...structuredClone(defaults),
    ...source,
    version: 2,
    settings: { ...defaults.settings, ...source.settings },
    days: {}
  };
  Object.entries(source.days).forEach(([key, record]) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !record || typeof record !== "object") {
      throw new Error("توجد بيانات يومية غير صالحة في ملف النسخة الاحتياطية.");
    }
    imported.days[key] = normalizeDayRecord(record, key);
  });
  return imported;
}

async function importBackup(file) {
  const feedback = $("#backup-feedback");
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    const imported = prepareImportedState(payload);
    if (!window.confirm("سيستبدل هذا الملف سجل وِردي الحالي على هذا الجهاز. هل تريد المتابعة؟")) {
      feedback.textContent = "لم يتغير السجل.";
      return;
    }
    state = imported;
    currentDayKey = "";
    if (!saveState()) {
      feedback.textContent = "تم تحميل السجل مؤقتًا، لكن تعذّر حفظه في هذا المتصفح.";
      renderAll();
      return;
    }
    renderAll();
    feedback.textContent = "تم استيراد السجل وإعداده على هذا الجهاز.";
  } catch (error) {
    feedback.textContent = error instanceof SyntaxError ? "تعذّر قراءة الملف؛ اختر ملف JSON صالحًا." : error.message || "تعذّر استيراد النسخة الاحتياطية.";
    showToast(feedback.textContent, true);
  } finally {
    $("#import-backup-file").value = "";
  }
}

function clearReadingHistory() {
  if (!window.confirm("سيُحذف سجل القرآن بالكامل، بما فيه الأوراد والعدادات والتسميع والتفسير. ستبقى إعداداتك وبيانات ميقات كما هي. هل تريد البدء من جديد؟")) return;
  state = { ...structuredClone(defaults), settings: { ...state.settings }, days: {} };
  currentDayKey = "";
  $("#backup-feedback").textContent = "";
  renderAll();
  if (saveState()) showToast("مُسح سجل القرآن وبدأ وِرد جديد.");
}

function switchView(view) {
  const id = view + "-view";
  if (!$("#" + id)) return;
  $$(".view").forEach((section) => {
    const active = section.id === id;
    section.hidden = !active;
    section.classList.toggle("active", active);
  });
  document.body.classList.toggle("reading-mode", view === "quran");
  $$("[data-view-link]").forEach((button) => {
    if (button.classList.contains("nav-item")) {
      const active = button.dataset.viewLink === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    }
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (view === "practice") renderHistory();
  if (view === "settings") fillSettings();
  if (view === "miqat") openMiqatPage();
}

function resizeMiqatFrame() {
  const frame = $("#miqat-frame");
  try {
    const doc = frame.contentDocument;
    if (!doc || !doc.documentElement || !doc.body) return;
    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight, doc.documentElement.offsetHeight);
    frame.style.height = height + "px";
  } catch (error) {
    frame.style.height = "80vh";
  }
}

function openMiqatPage() {
  const frame = $("#miqat-frame");
  if (frame.getAttribute("src") === "about:blank") frame.src = frame.dataset.src;
  window.setTimeout(resizeMiqatFrame, 250);
  window.setTimeout(resizeMiqatFrame, 1000);
}

function changeTextScale(delta) {
  state.settings.textScale = Math.round(Math.max(.85, Math.min(1.8, state.settings.textScale + delta)) * 100) / 100;
  saveState();
  renderVersePassage(getTodayRecord());
}

function editPassage(event) {
  event.preventDefault();
  const record = getTodayRecord();
  if (record.closed) return showToast("أعد فتح اليوم أولًا لتعديل الورد.");
  const surahId = Number($("#passage-surah").value);
  const ayah = Number($("#passage-start").value);
  const count = Number($("#passage-length").value);
  const surah = surahs[surahId - 1];
  if (!surah || !Number.isInteger(ayah) || ayah < 1 || ayah > surah.ayas.length || !Number.isInteger(count) || count < 1) {
    return showToast("راجع السورة ورقم الآية وعدد الآيات.", true);
  }
  if (record.tasmee.saved && !window.confirm("تغيير الورد سيبدأ تسميعًا جديدًا لهذا اليوم. هل تريد المتابعة؟")) return;
  const startGlobal = surahOffsets.get(surahId) + ayah - 1;
  record.startGlobal = startGlobal;
  record.count = Math.min(count, verses.length - startGlobal);
  const first = verses[startGlobal];
  record.tasmee = { surahId: first.surahId, ayahs: record.count, repetitions: getModeTotal(record, "memorization"), repetitionsManual: false, status: "not-done", errors: 0, saved: false };
  $("#passage-editor").hidden = true;
  saveState("تم حفظ الورد الجديد.");
  renderAll();
}

function updatePassageEditorFromRecord(record) {
  const first = firstVerseInRecord(record);
  if (!first) return;
  makeSelectOptions($("#passage-surah"), first.surahId);
  $("#passage-start").value = first.ayah;
  $("#passage-start").max = String(surahs[first.surahId - 1].ayas.length);
  $("#passage-length").value = record.count;
}

function updateTafsirFromForm(record) {
  record.tafsir = {
    watched: $("#tafsir-watched").checked,
    vocabulary: $("#tafsir-vocabulary").checked,
    summarized: $("#tafsir-summarized").checked,
    notes: $("#tafsir-notes").value.trim()
  };
}

function addRepetition(mode) {
  const record = getTodayRecord();
  if (record.closed) return showToast("أعد فتح اليوم لتسجيل تكرار جديد.");
  if (state.settings.autoPrayerDetect) renderPrayerCounters(record);
  const id = state.settings.activePrayer;
  if (!record.repetitions[id] || typeof record.repetitions[id] !== "object") record.repetitions[id] = { reading: 0, memorization: 0 };
  record.repetitions[id][mode] = (Number(record.repetitions[id][mode]) || 0) + 1;
  if (mode === "memorization" && !record.tasmee.saved && !record.tasmee.repetitionsManual) {
    record.tasmee.repetitions = getModeTotal(record, "memorization");
    if (!$("#tasmee-panel").hidden) $("#tasmee-repetitions").value = record.tasmee.repetitions;
  }
  saveState();
  renderPrayerCounters(record);
  renderTasmeePreview(record);
  const button = mode === "reading" ? $("#increment-reading-counter") : $("#increment-counter");
  button.focus({ preventScroll: true });
}

async function loadQuran() {
  const response = await fetch("data/quran-uthmani.xml");
  if (!response.ok) throw new Error("تعذّر تحميل ملف القرآن");
  const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
  if (xml.querySelector("parsererror")) throw new Error("ملف القرآن بصيغة غير صالحة");
  const suraNodes = Array.from(xml.getElementsByTagName("sura"));
  let globalIndex = 0;
  surahs = suraNodes.map((node) => {
    const id = Number(node.getAttribute("index"));
    const name = node.getAttribute("name") || ("سورة " + formatNumber(id));
    const ayaNodes = Array.from(node.getElementsByTagName("aya"));
    const surah = { id, name, ayas: [] };
    surahOffsets.set(id, globalIndex);
    ayaNodes.forEach((ayaNode) => {
      const aya = { surahId: id, surahName: name, ayah: Number(ayaNode.getAttribute("index")), text: ayaNode.getAttribute("text"), globalIndex };
      surah.ayas.push(aya);
      verses.push(aya);
      globalIndex += 1;
    });
    return surah;
  });
  if (verses.length !== TOTAL_AYAHS || surahs.length !== 114) throw new Error("تحقّق من ملف القرآن: عدد السور أو الآيات غير متوقع.");
}

function bindEvents() {
  $$("[data-view-link]").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.viewLink)));

  $("#font-smaller").addEventListener("click", () => changeTextScale(-.1));
  $("#font-larger").addEventListener("click", () => changeTextScale(.1));
  $("#toggle-edit-passage").addEventListener("click", () => {
    const record = getTodayRecord();
    updatePassageEditorFromRecord(record);
    $("#passage-editor").hidden = !$("#passage-editor").hidden;
  });
  $("#cancel-edit-passage").addEventListener("click", () => { $("#passage-editor").hidden = true; });
  $("#passage-editor").addEventListener("submit", editPassage);
  $("#passage-surah").addEventListener("change", () => updateAyahMax($("#passage-surah"), $("#passage-start")));
  $("#setting-start-surah").addEventListener("change", () => updateAyahMax($("#setting-start-surah"), $("#setting-start-ayah")));

  $("#active-prayer").addEventListener("change", (event) => {
    state.settings.activePrayer = event.target.value;
    state.settings.autoPrayerDetect = false;
    saveState();
    renderPrayerCounters(getTodayRecord());
  });
  $("#auto-prayer-detect").addEventListener("change", (event) => {
    state.settings.autoPrayerDetect = event.target.checked;
    saveState();
    renderPrayerCounters(getTodayRecord());
  });
  $("#increment-counter").addEventListener("click", () => addRepetition("memorization"));
  $("#increment-reading-counter").addEventListener("click", () => addRepetition("reading"));
  $("#reset-counter").addEventListener("click", () => {
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم لتصفير العداد.");
    const prayer = PRAYERS.find((item) => item.id === state.settings.activePrayer) || PRAYERS[0];
    const count = getPrayerCount(record, prayer.id, "memorization");
    if (!count || !window.confirm("هل تريد تصفير عداد الحفظ لصلاة " + prayer.name + " لهذا اليوم؟")) return;
    record.repetitions[prayer.id].memorization = 0;
    if (!record.tasmee.saved && !record.tasmee.repetitionsManual) {
      record.tasmee.repetitions = getModeTotal(record, "memorization");
      if (!$("#tasmee-panel").hidden) $("#tasmee-repetitions").value = record.tasmee.repetitions;
    }
    saveState("تم تصفير عداد الحفظ لصلاة " + prayer.name + ".");
    renderPrayerCounters(record);
  });

  $("#open-tasmee").addEventListener("click", () => {
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم أولًا لتعديل التسميع.");
    const panel = $("#tasmee-panel");
    if (panel.hidden) {
      if (!record.tasmee.saved && !record.tasmee.repetitionsManual) record.tasmee.repetitions = getModeTotal(record, "memorization");
      renderTasmee(record);
    }
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $("#open-tafsir").addEventListener("click", () => {
    if (getTodayRecord().closed) return showToast("أعد فتح اليوم أولًا لتعديل متابعة التفسير.");
    const panel = $("#tafsir-panel");
    panel.hidden = !panel.hidden;
    if (!panel.hidden) panel.scrollIntoView({ behavior: "smooth", block: "center" });
  });
  $$('[data-close-panel]').forEach((button) => button.addEventListener("click", () => { $("#" + button.dataset.closePanel).hidden = true; }));
  function saveTasmeeDraft(event) {
    const record = getTodayRecord();
    if (record.closed) return;
    const surahId = Number($("#tasmee-surah").value);
    const ayahs = Number($("#tasmee-ayahs").value);
    const repetitions = Number($("#tasmee-repetitions").value);
    if (surahs[surahId - 1]) record.tasmee.surahId = surahId;
    if (Number.isInteger(ayahs) && ayahs > 0) record.tasmee.ayahs = ayahs;
    if (Number.isInteger(repetitions) && repetitions >= 0) record.tasmee.repetitions = repetitions;
    if (event.target.id === "tasmee-repetitions") record.tasmee.repetitionsManual = true;
    const status = $('input[name="tasmee-status"]:checked');
    if (status) record.tasmee.status = status.value;
    record.tasmee.saved = false;
    saveState();
    renderTasmeePreview(record);
  }
  $("#tasmee-surah").addEventListener("change", saveTasmeeDraft);
  $("#tasmee-ayahs").addEventListener("input", saveTasmeeDraft);
  $("#tasmee-repetitions").addEventListener("input", saveTasmeeDraft);
  $$('input[name="tasmee-status"]').forEach((radio) => radio.addEventListener("change", saveTasmeeDraft));
  $("#mistake-plus").addEventListener("click", () => {
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم لتعديل التسميع.");
    record.tasmee.errors = (Number(record.tasmee.errors) || 0) + 1;
    $("#mistake-count").textContent = formatNumber(record.tasmee.errors);
    saveState();
    renderTasmeePreview(record);
  });
  $("#mistake-minus").addEventListener("click", () => {
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم لتعديل التسميع.");
    record.tasmee.errors = Math.max(0, (Number(record.tasmee.errors) || 0) - 1);
    $("#mistake-count").textContent = formatNumber(record.tasmee.errors);
    saveState();
    renderTasmeePreview(record);
  });
  $("#tasmee-panel").addEventListener("submit", (event) => {
    event.preventDefault();
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم لتعديل التسميع.");
    const ayahs = Number($("#tasmee-ayahs").value);
    const repetitions = Number($("#tasmee-repetitions").value);
    if (!Number.isInteger(ayahs) || ayahs < 1 || !Number.isInteger(repetitions) || repetitions < 0) return showToast("أدخل عدد آيات وتكرارات صحيحًا.", true);
    const status = $('input[name="tasmee-status"]:checked');
    record.tasmee.surahId = Number($("#tasmee-surah").value);
    record.tasmee.ayahs = ayahs;
    record.tasmee.repetitions = repetitions;
    record.tasmee.repetitionsManual = true;
    record.tasmee.status = status ? status.value : "not-done";
    record.tasmee.saved = true;
    saveState("تم حفظ سجل التسميع.");
    renderDayState(record);
    $("#tasmee-panel").hidden = true;
  });

  $("#tafsir-panel").addEventListener("submit", (event) => {
    event.preventDefault();
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم لتعديل متابعة التفسير.");
    updateTafsirFromForm(record);
    saveState("تم حفظ متابعة التفسير.");
    renderTafsir(record);
    $("#tafsir-panel").hidden = true;
  });
  $("#tafsir-notes").addEventListener("input", () => {
    const record = getTodayRecord();
    if (record.closed) return;
    updateTafsirFromForm(record);
    saveState();
  });
  ["#tafsir-watched", "#tafsir-vocabulary", "#tafsir-summarized"].forEach((selector) => $(selector).addEventListener("change", () => {
    const record = getTodayRecord();
    if (record.closed) return showToast("أعد فتح اليوم لتعديل متابعة التفسير.");
    updateTafsirFromForm(record);
    saveState();
    renderTafsirPreview(record);
  }));

  $("#close-day").addEventListener("click", () => {
    const record = getTodayRecord();
    if (record.closed) return;
    if (!window.confirm("سيُحفظ هذا الورد في سجل الأيام ويُحدّث تقدمك في القرآن. هل تريد ختم اليوم؟")) return;
    record.closed = true;
    saveState();
    renderAll();
    showToast(getDayTotal(record) >= 50 ? "حُفظ اليوم. تقبّل الله وِردك." : "حُفظ اليوم. يمكنك إعادة فتحه لإكمال التكرار إلى ٥٠.");
  });
  $("#reopen-day").addEventListener("click", () => {
    const record = getTodayRecord();
    record.closed = false;
    saveState("أُعيد فتح اليوم للتعديل.");
    renderAll();
  });

  $("#settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const fajr = $("#setting-fajr-time").value || "04:30";
    const count = Number($("#setting-ayah-count").value);
    const startSurah = Number($("#setting-start-surah").value);
    const startAyah = Number($("#setting-start-ayah").value);
    const selectedSurah = surahs[startSurah - 1];
    if (!/^\d{2}:\d{2}$/.test(fajr) || !Number.isInteger(count) || count < 1 || count > 100 || !selectedSurah || !Number.isInteger(startAyah) || startAyah < 1 || startAyah > selectedSurah.ayas.length) {
      $("#settings-feedback").textContent = "راجع وقت الفجر وعدد الآيات وبداية المصحف.";
      return;
    }
    state.settings.fajrTime = fajr;
    state.settings.dailyAyahCount = count;
    state.settings.startSurah = startSurah;
    state.settings.startAyah = startAyah;
    saveState();
    $("#settings-feedback").textContent = "حُفظت إعداداتك.";
    currentDayKey = "";
    renderAll();
  });

  $("#export-backup").addEventListener("click", exportBackup);
  $("#import-backup-trigger").addEventListener("click", () => $("#import-backup-file").click());
  $("#import-backup-file").addEventListener("change", (event) => importBackup(event.target.files[0]));
  $("#clear-reading-history").addEventListener("click", clearReadingHistory);

  $("#miqat-frame").addEventListener("load", () => {
    resizeMiqatFrame();
    try {
      const doc = $("#miqat-frame").contentDocument;
      if (doc && "ResizeObserver" in window) new ResizeObserver(resizeMiqatFrame).observe(doc.documentElement);
    } catch (error) {}
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== "dailyDashboard.location.v1") return;
    if (currentFajrDayKey(new Date()) !== currentDayKey) renderAll();
    else if (state.settings.autoPrayerDetect) renderPrayerCounters(getTodayRecord());
  });
  window.addEventListener("focus", () => {
    if (state.settings.autoPrayerDetect) renderPrayerCounters(getTodayRecord());
  });
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  }
}

async function startApp() {
  bindEvents();
  try {
    await loadQuran();
    makeSelectOptions($("#passage-surah"), 1);
    makeSelectOptions($("#tasmee-surah"), 1);
    makeSelectOptions($("#setting-start-surah"), state.settings.startSurah);
    renderAll();
    registerServiceWorker();
    window.setInterval(() => {
      const key = currentFajrDayKey(new Date());
      if (key !== currentDayKey) renderAll();
      else if (state.settings.autoPrayerDetect) renderPrayerCounters(getTodayRecord());
      if (!$("#miqat-view").hidden) resizeMiqatFrame();
    }, 30_000);
  } catch (error) {
    const list = $("#verses-list");
    list.textContent = "تعذّر فتح ملف القرآن. شغّل التطبيق عبر خادم محلي مثل Live Server، وتأكد من وجود data/quran-uthmani.xml.";
    $("#passage-title").textContent = "تعذّر تحميل الآيات";
    $("#passage-count").textContent = "تأكد من تشغيل التطبيق عبر خادم محلي.";
    showToast("تعذّر تحميل ملف القرآن الكريم.", true);
  }
}

startApp();
