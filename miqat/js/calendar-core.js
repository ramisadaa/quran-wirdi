/* دوال التقويم والقمر قابلة للاختبار دون DOM أو شبكة. */
(() => {
  "use strict";
  function moonPhase(day) {
    const phase = (day - 1) / 29.53059, angle = Math.cos(2 * Math.PI * phase);
    const radius = Math.max(.01, Math.abs(angle) * 20);
    const outer = phase < .5 ? 1 : 0;
    const inner = phase < .5 ? (phase < .25 ? 0 : 1) : (phase < .75 ? 0 : 1);
    const names = ["محاق", "هلال متزايد", "تربيع أول", "أحدب متزايد", "بدر", "أحدب متناقص", "تربيع أخير", "هلال متناقص"];
    return { path: `M22 2 A20 20 0 0 ${outer} 22 42 A${radius} 20 0 0 ${inner} 22 2Z`, name: names[Math.round(phase * 8) % 8] };
  }
  function describe(now, timezone, offset = 0, atSunset = false, sunset = NaN) {
    const civil = window.PrayerClock.dateKey(now, timezone);
    const advanced = atSunset && Number.isFinite(sunset) && now >= sunset;
    const date = new Date(`${civil}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset + (advanced ? 1 : 0));
    const parts = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatToParts(date);
    const value = type => parts.find(part => part.type === type)?.value || "";
    return { civil, advanced, day: value("day"), month: value("month"), year: value("year"), moon: moonPhase(Number(value("day"))),
      gregorian: new Intl.DateTimeFormat("ar-PS-u-nu-latn", { day: "2-digit", month: "long", year: "numeric", timeZone: timezone }).format(new Date(now)) + " م." };
  }
  window.CalendarClock = Object.freeze({ describe, moonPhase });
})();
