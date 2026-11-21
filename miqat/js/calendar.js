(() => {
  "use strict";
  const app = window.Dashboard;
  let last = "";
  function update(force = false) {
    const place = app.getLocation(), timezone = place?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const prefs = app.read("dailyDashboard.view.v1", {});
    const offset = [-2,-1,0,1,2].includes(Number(prefs.hijriOffset)) ? Number(prefs.hijriOffset) : 0;
    let sunset = NaN;
    if (prefs.hijriAtSunset && place) {
      try { sunset = window.PrayerClock.calculateDay(place, window.PrayerClock.dateKey(Date.now(), timezone)).times.Maghrib; } catch { /* اليوم المدني عند تعذر تقدير الغروب */ }
    }
    try {
      const info = window.CalendarClock.describe(Date.now(), timezone, offset, prefs.hijriAtSunset === true, sunset);
      const key = JSON.stringify([info.civil, info.advanced, offset, timezone, prefs.hijriAtSunset]);
      if (!force && key === last) return;
      last = key;
      for (const field of ["day", "month", "year"]) document.getElementById(`hijri${field[0].toUpperCase()}${field.slice(1)}`).textContent = info[field];
      document.getElementById("gregorianDate").textContent = info.gregorian;
      document.getElementById("moonLit").setAttribute("d", info.moon.path);
      document.getElementById("moonGraphic").setAttribute("aria-label", `طور القمر التقريبي: ${info.moon.name}`);
      document.getElementById("calendarNote").textContent = `أم القرى${offset ? ` • تعديل ${offset > 0 ? "+" : ""}${offset}` : ""} • ${prefs.hijriAtSunset ? Number.isFinite(sunset) ? "اليوم الهجري يبدأ عند المغرب" : "حدد الموقع لتفعيل تبديل المغرب" : "اليوم يتبدّل منتصف الليل"}`;
      app.emit("date-updated", null);
    } catch { document.getElementById("calendarNote").textContent = "تعذّر عرض التقويم الهجري في هذا المتصفح."; }
  }
  app.on("location", () => update(true)); app.on("view", () => update(true));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) update(); });
  setInterval(update, 30000); update();
})();
