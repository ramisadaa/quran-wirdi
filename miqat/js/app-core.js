/* أدوات مشتركة وسجل أحداث موحّد. جميع المفاتيح تخص dailyDashboard. */
(() => {
  "use strict";
  const events = Object.freeze(Object.fromEntries([
    "location", "location-state", "open-location", "select-city", "use-location", "prayer-state",
    "view", "date-updated", "reset-duas", "links", "appearance"
  ].map(name => [name, `dashboard:${name}`])));
  const methods = Object.freeze([
    { id: 3, label: "رابطة العالم الإسلامي", name: "MuslimWorldLeague" },
    { id: 4, label: "أم القرى — مكة", name: "UmmAlQura" },
    { id: 5, label: "الهيئة المصرية للمساحة", name: "Egyptian" }
  ]);
  function read(key, fallback = null) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
  }
  function eventName(name) {
    if (!Object.hasOwn(events, name)) throw new Error(`Unknown dashboard event: ${name}`);
    return events[name];
  }
  function emit(name, detail) { window.dispatchEvent(new CustomEvent(eventName(name), { detail })); }
  function on(name, listener) { window.addEventListener(eventName(name), listener); }
  function validTimezone(value) {
    try { if (typeof value !== "string" || !value) return false; new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }
  function validLocation(value) {
    return Boolean(value && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 &&
      Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180 &&
      typeof value.label === "string" && value.label.trim() && validTimezone(value.timezone) &&
      methods.some(method => method.id === value.method));
  }
  let place = read("dailyDashboard.location.v1");
  if (!validLocation(place)) place = null;
  function getLocation() { return place; }
  function setLocation(value) {
    if (!validLocation(value)) throw new Error("الموقع أو المنطقة الزمنية غير صالحين.");
    place = { latitude: value.latitude, longitude: value.longitude, timezone: value.timezone,
      label: value.label, method: value.method, city: value.city || "", country: value.country || "" };
    const saved = write("dailyDashboard.location.v1", place);
    emit("location", place);
    return saved;
  }
  async function getJSON(url, signal = null, timeout = 15000, options = {}) {
    const { onResponse, ...fetchOptions } = options;
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) controller.abort();
    else signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, timeout);
    try {
      const response = await fetch(url, { cache: "no-cache", credentials: "omit", ...fetchOptions, signal: controller.signal });
      if (!response.ok) { const error = new Error("الخدمة غير متاحة حاليًا."); error.status = response.status; throw error; }
      if (onResponse) onResponse(response);
      return await response.json();
    } finally { clearTimeout(timer); signal?.removeEventListener("abort", abort); }
  }
  function dateLabel(timestamp, timezone = getLocation()?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone) {
    return new Intl.DateTimeFormat("ar-PS-u-nu-latn", { dateStyle: "short", timeStyle: "short", timeZone: timezone }).format(new Date(timestamp));
  }
  window.Dashboard = Object.freeze({ read, write, emit, on, events, methods, getJSON, getLocation, setLocation, validLocation, validTimezone, dateLabel });
})();
