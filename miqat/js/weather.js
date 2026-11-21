/* Open-Meteo: الاستخدام المجاني غير التجاري، مع إسناد المصدر في الكرت. */
(() => {
  const app = window.Dashboard;
  const status = document.getElementById("weatherStatus");
  const refresh = document.getElementById("refreshWeather");
  const art = document.getElementById("weatherArt");
  let place = app.getLocation(), request = 0, controller = null;
  function describe(code, isDay) {
    if (code === 0) return [isDay ? "صحو ومشمس" : "سماء صافية", isDay ? "sun" : "night"];
    if ([1,2].includes(code)) return ["غائم جزئيًا", isDay ? "partial" : "night"];
    if (code === 3) return ["غائم", "clouds"];
    if ([45,48].includes(code)) return ["ضباب", "fog"];
    if ([71,73,75,77,85,86].includes(code)) return ["ثلوج", "snow"];
    if ([95,96,99].includes(code)) return ["عواصف رعدية", "storm"];
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return ["أمطار", "rain"];
    return ["حالة طقس متغيرة", "clouds"];
  }
  function key(location) { return `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`; }
  function valid(data, location) {
    return data?.locationKey === key(location) && Number.isFinite(data.savedAt) && Number.isFinite(data.at) &&
      ["temperature","humidity","wind","direction","code"].every((name) => Number.isFinite(data[name])) &&
      data.humidity >= 0 && data.humidity <= 100 && typeof data.timezone === "string";
  }
  function paint(data, cached = false) {
    const [description, condition] = describe(data.code, data.isDay);
    document.getElementById("temperature").textContent = `${Math.round(data.temperature)}°`;
    document.getElementById("weatherCondition").textContent = description;
    document.getElementById("windSpeed").textContent = `${Math.round(data.wind)} كم/س`;
    document.getElementById("humidity").textContent = `${Math.round(data.humidity)}%`;
    document.getElementById("windDirection").textContent = ["شمالي", "شمالي شرقي", "شرقي", "جنوبي شرقي", "جنوبي", "جنوبي غربي", "غربي", "شمالي غربي"][Math.round(((data.direction % 360 + 360) % 360) / 45) % 8];
    document.getElementById("weatherCity").textContent = place.label;
    document.getElementById("weatherBadge").textContent = cached ? "محفوظ" : "الآن";
    art.dataset.condition = condition;
    art.setAttribute("aria-label", description);
    status.textContent = `${cached ? "آخر بيانات محفوظة" : "وقت البيانات"}: ${app.dateLabel(data.at, data.timezone)}`;
    status.dataset.state = cached ? "cached" : "ready";
  }
  async function load(force = false) {
    const token = ++request;
    controller?.abort(); controller = new AbortController();
    refresh.disabled = false;
    if (!app.validLocation(place)) {
      status.textContent = "اختر المدينة أو موقعك من الإعدادات لعرض الطقس والصلاة.";
      status.dataset.state = "";
      return;
    }
    const cached = app.read(`dailyDashboard.weather.${key(place)}.v1`);
    const usable = valid(cached, place);
    if (usable) paint(cached, true);
    else {
      document.getElementById("temperature").textContent = "—";
      document.getElementById("windSpeed").textContent = "—";
      document.getElementById("humidity").textContent = "—";
      document.getElementById("windDirection").textContent = "—";
      document.getElementById("weatherCondition").textContent = "جارٍ التحميل…";
      document.getElementById("weatherCity").textContent = place.label;
      status.textContent = "جارٍ تحميل بيانات الطقس…";
    }
    if (!force && usable && Date.now() - cached.savedAt < 10 * 60000) return;
    refresh.disabled = true;
    try {
      const params = new URLSearchParams({ latitude: String(place.latitude), longitude: String(place.longitude),
        current: "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day",
        timezone: "auto", timeformat: "unixtime", wind_speed_unit: "kmh" });
      const data = await app.getJSON(`https://api.open-meteo.com/v1/forecast?${params}`, controller.signal);
      if (token !== request) return;
      const current = data.current;
      const result = { locationKey: key(place), savedAt: Date.now(), at: current?.time * 1000,
        temperature: current?.temperature_2m, humidity: current?.relative_humidity_2m,
        wind: current?.wind_speed_10m, direction: current?.wind_direction_10m,
        code: current?.weather_code, isDay: current?.is_day === 1, timezone: data.timezone };
      if (!valid(result, place)) throw new Error();
      app.write(`dailyDashboard.weather.${key(place)}.v1`, result);
      paint(result);
    } catch {
      if (token !== request) return;
      if (usable) { paint(cached, true); status.textContent += " • تعذّر الاتصال حاليًا"; }
      else { status.textContent = "تعذّر تحميل الطقس. اضغط تحديث للمحاولة."; status.dataset.state = "error";
        document.getElementById("weatherCondition").textContent = "الطقس غير متاح"; }
    } finally { if (token === request) refresh.disabled = false; }
  }
  refresh.addEventListener("click", () => load(true));
  document.getElementById("weatherLocation").addEventListener("click", () => app.emit("open-location", null));
  app.on("location", (event) => { place = event.detail; load(); });
  window.addEventListener("online", () => load());
  document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
  setInterval(() => { if (!document.hidden) load(); }, 10 * 60000);
  load();
})();
