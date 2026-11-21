/* مستهلك للموقع: حساب محلي فقط، بلا API أو بحث مدينة مكرر. */
(() => {
  "use strict";
  const app = window.Dashboard, clock = window.PrayerClock;
  const card = document.getElementById("prayerCard"), details = document.getElementById("prayerDetails");
  const status = document.getElementById("prayerStatus");
  const cacheKey = "dailyDashboard.prayerDays.v2";
  let place = app.getLocation(), days = [], lastDate = "";
  function identity(value) { return JSON.stringify([value.latitude, value.longitude, value.timezone, value.method, "adhan-4.4.6"]); }
  function calculate() {
    if (!place) { days = []; return; }
    const today = clock.dateKey(Date.now(), place.timezone), tomorrow = clock.addDay(today);
    const cached = app.read(cacheKey);
    try {
      const usable = cached?.identity === identity(place) && Array.isArray(cached.days) && cached.days.length <= 32 &&
        cached.days.every(day => day.timezone === place.timezone && /^\d{4}-\d{2}-\d{2}$/.test(day.date) && clock.allTimes.every(key => Number.isFinite(day.times?.[key]))) &&
        cached.days.some(day => day.date === today) && cached.days.some(day => day.date === tomorrow);
      if (usable) days = cached.days;
      else {
        days = []; let date = today;
        for (let i = 0; i < 31; i++) { days.push(clock.calculateDay(place, date)); date = clock.addDay(date); }
        app.write(cacheKey, { identity: identity(place), days });
      }
      status.textContent = `حساب محلي • ${app.methods.find(item => item.id === place.method).label}${Math.abs(place.latitude) > 48 ? " • تقدير خطوط العرض العالية" : ""}`;
      status.dataset.state = "ready";
    } catch (error) { days = []; status.textContent = error.message; status.dataset.state = "error"; }
    lastDate = today;
    app.emit("prayer-state", { text: status.textContent, state: status.dataset.state });
  }
  function render() {
    const today = place ? clock.dateKey(Date.now(), place.timezone) : "";
    if (place && today !== lastDate) calculate();
    const current = days.find(day => day.date === today), upcoming = current ? clock.nextPrayer(days, Date.now()) : null;
    const ids = { Fajr: "fajr", Sunrise: "sunrise", Dhuhr: "dhuhr", Asr: "asr", Maghrib: "maghrib", Isha: "isha" };
    for (const [key,id] of Object.entries(ids)) document.getElementById(`${id}Time`).textContent = current ? clock.timeLabel(current.times[key], place.timezone) : "--:--";
    document.getElementById("nextPrayerName").textContent = upcoming ? upcoming.name : place ? "المواقيت غير متاحة" : "حدّد المدينة";
    document.getElementById("nextPrayerTime").textContent = upcoming ? clock.timeLabel(upcoming.at, place.timezone) : "--:--";
    document.getElementById("prayerCountdown").textContent = upcoming ? clock.remaining(upcoming.at, Date.now()) : "--:--:--";
    document.getElementById("prayerLocation").textContent = place ? `${place.label} • ${place.timezone}` : "اختر المدينة أو أدخل إحداثياتك من الإعدادات.";
    document.getElementById("prayerSetup").hidden = Boolean(place);
    card.querySelectorAll(".prayer-row").forEach(row => row.classList.toggle("is-next", Boolean(upcoming && upcoming.date === today && row.dataset.prayer === upcoming.row)));
  }
  document.getElementById("prayerSetup").addEventListener("click", () => app.emit("open-location", null));
  document.getElementById("changePrayerLocation").addEventListener("click", () => app.emit("open-location", null));
  app.on("location", event => { place = event.detail; lastDate = ""; calculate(); render(); });
  details.addEventListener("toggle", () => card.classList.toggle("is-expanded", details.open));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  calculate(); render(); setInterval(render, 1000);
})();
