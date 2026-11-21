/* دوال الوقت والحساب المحلي بمكتبة Adhan المضمّنة. */
(() => {
  "use strict";
  const prayers = Object.freeze([
    { key: "Fajr", name: "الفجر", row: "fajr" },
    { key: "Dhuhr", name: "الظهر", row: "dhuhr" },
    { key: "Asr", name: "العصر", row: "asr" },
    { key: "Maghrib", name: "المغرب", row: "maghrib" },
    { key: "Isha", name: "العشاء", row: "isha" }
  ]);
  const allTimes = Object.freeze(["Fajr", "Sunrise", "Dhuhr", "Asr", "Maghrib", "Isha"]);

  function dateKey(now, timezone) {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit"
    }).formatToParts(new Date(now));
    const value = (name) => parts.find((part) => part.type === name).value;
    return `${value("year")}-${value("month")}-${value("day")}`;
  }

  function addDay(date) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  }

  function apiDate(date) { return date.split("-").reverse().join("-"); }

  function normalizeDay(data) {
    const timezone = data?.meta?.timezone;
    if (typeof timezone !== "string") throw new Error("لا توجد منطقة زمنية صالحة.");
    dateKey(Date.now(), timezone);
    const times = {};
    for (const key of allTimes) {
      const value = data?.timings?.[key];
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
          !/(Z|[+-]\d{2}:\d{2})$/.test(value)) {
        throw new Error("صيغة مواقيت الصلاة غير صالحة.");
      }
      const timestamp = Date.parse(value);
      if (!Number.isFinite(timestamp)) throw new Error("وقت صلاة غير صالح.");
      times[key] = timestamp;
    }
    return { date: dateKey(times.Dhuhr, timezone), timezone, times };
  }

  function nextPrayer(days, now) {
    return days.flatMap((day) => prayers.map((prayer) => ({
      ...prayer, at: day.times[prayer.key], date: day.date, timezone: day.timezone
    }))).filter((prayer) => Number.isFinite(prayer.at) && prayer.at > now)
      .sort((first, second) => first.at - second.at)[0] || null;
  }

  function remaining(timestamp, now) {
    const total = Math.max(0, Math.ceil((timestamp - now) / 1000));
    const values = [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60];
    return values.map((value) => String(value).padStart(2, "0")).join(":");
  }

  function timeLabel(timestamp, timezone) {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(new Date(timestamp));
  }

  function calculateDay(place, date) {
    const adhan = window.adhan;
    const method = window.Dashboard.methods.find(item => item.id === place.method);
    if (!adhan || !method) throw new Error("مكتبة حساب الصلاة أو الطريقة غير متاحة.");
    const coordinates = new adhan.Coordinates(place.latitude, place.longitude);
    const params = adhan.CalculationMethod[method.name]();
    params.madhab = adhan.Madhab.Shafi;
    params.highLatitudeRule = adhan.HighLatitudeRule.recommended(coordinates);
    params.polarCircleResolution = adhan.PolarCircleResolution.AqrabBalad;
    const [year, month, day] = date.split("-").map(Number);
    if (place.method === 4) {
      const hijri = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
      if (Number(hijri) === 9) params.ishaInterval = 120;
    }
    // التاريخ المدني المطلوب يبنى في تقويم الجهاز؛ الحساب يعيد لحظات UTC مطلقة.
    const result = new adhan.PrayerTimes(coordinates, new Date(year, month - 1, day), params);
    const keys = { Fajr: "fajr", Sunrise: "sunrise", Dhuhr: "dhuhr", Asr: "asr", Maghrib: "maghrib", Isha: "isha" };
    const times = Object.fromEntries(Object.entries(keys).map(([key, name]) => [key, result[name].getTime()]));
    if (!Object.values(times).every(Number.isFinite)) throw new Error("تعذّر حساب هذه المواقيت. راجع الإحداثيات وطريقة الحساب.");
    return { date, timezone: place.timezone, times };
  }
  window.PrayerClock = Object.freeze({ prayers, allTimes, dateKey, addDay, apiDate,
    normalizeDay, nextPrayer, remaining, timeLabel, calculateDay });
})();
