/* خدمة الموقع مستقلة عن الصلاة والطقس؛ الحفظ يسبق إخطار المستهلكين. */
(() => {
  "use strict";
  const app = window.Dashboard;
  const city = document.getElementById("settingsCity"), country = document.getElementById("settingsCountry");
  const method = document.getElementById("settingsMethod"), timezone = document.getElementById("settingsTimezone");
  const latitude = document.getElementById("settingsLatitude"), longitude = document.getElementById("settingsLongitude");
  const form = document.getElementById("settingsLocationForm"), status = document.getElementById("settingsLocationStatus");
  let request = 0, controller;
  app.methods.forEach(item => { const option = document.createElement("option"); option.value = String(item.id); option.textContent = item.label; method.appendChild(option); });
  function fill(place) {
    if (!place) { method.value = "3"; timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone; return; }
    city.value = place.city || ""; country.value = place.country || "Palestine"; method.value = String(place.method);
    timezone.value = place.timezone; latitude.value = String(place.latitude); longitude.value = String(place.longitude);
  }
  function report(text, state = "") {
    status.textContent = text; status.dataset.state = state;
    form.querySelectorAll("button").forEach(button => { button.disabled = state === "loading"; });
    app.emit("location-state", { text, state });
  }
  function selectedMethod() { return app.methods.some(item => item.id === Number(method.value)) ? Number(method.value) : 3; }
  function save(place) {
    const saved = app.setLocation(place);
    fill(app.getLocation());
    report(saved ? "تم حفظ الموقع. تُحسب الصلاة محليًا ويُحدّث الطقس بصورة مستقلة." : "تم اختيار الموقع لهذه الجلسة، لكن المتصفح لم يسمح بحفظه.");
  }
  async function resolveCity(input, signal) {
    const aliases = { palestine: "PS", فلسطين: "PS", jordan: "JO", الأردن: "JO", الاردن: "JO", egypt: "EG", مصر: "EG", israel: "IL", "saudi arabia": "SA", السعودية: "SA", "united arab emirates": "AE", الإمارات: "AE", الامارات: "AE", turkey: "TR", تركيا: "TR", lebanon: "LB", لبنان: "LB", syria: "SY", سوريا: "SY", iraq: "IQ", العراق: "IQ", kuwait: "KW", الكويت: "KW", qatar: "QA", قطر: "QA", oman: "OM", عمان: "OM", bahrain: "BH", البحرين: "BH" };
    const countryText = input.country.trim();
    const code = /^[a-z]{2}$/i.test(countryText) ? countryText.toUpperCase() : aliases[countryText.toLowerCase()];
    const jerusalem = code === "PS" && ["القدس", "jerusalem", "al quds", "al-quds"].includes(input.city.toLowerCase());
    const name = jerusalem ? "Jerusalem" : input.city;
    const params = new URLSearchParams({ name: code ? name : `${name}, ${countryText}`, count: "10", language: "ar", format: "json" });
    if (code) params.set("countryCode", code);
    let data = await app.getJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal);
    let candidates = (data.results || []).filter(item => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && app.validTimezone(item.timezone) && (!code || item.country_code === code));
    // GeoNames قد يصنف القدس بغير PS. بحث مخصص مضبوط ضمن إحداثيات القدس دون تغيير الدولة التي اختارها المستخدم.
    if (!candidates.length && jerusalem) {
      params.delete("countryCode");
      data = await app.getJSON(`https://geocoding-api.open-meteo.com/v1/search?${params}`, signal);
      candidates = (data.results || []).filter(item => item.latitude >= 31.7 && item.latitude <= 31.9 && item.longitude >= 35.1 && item.longitude <= 35.3 && app.validTimezone(item.timezone));
    }
    const cities = candidates.filter(item => String(item.feature_code || "").startsWith("P"));
    const result = (cities.length ? cities : candidates).sort((a,b) => (b.population || 0) - (a.population || 0))[0];
    if (!result) throw new Error("لم تُعثر على المدينة. جرّب الاسم بالإنجليزية، أو أدخل الإحداثيات والمنطقة الزمنية يدويًا.");
    return { latitude: result.latitude, longitude: result.longitude, timezone: result.timezone, method: input.method,
      city: input.city, country: input.country, label: [result.name, code === "PS" ? "فلسطين" : result.country || countryText].join("، ") };
  }
  async function selectCity(input) {
    const token = ++request; controller?.abort(); controller = new AbortController();
    if (!input?.city?.trim() || !input?.country?.trim()) { report("اكتب المدينة والدولة أولًا.", "error"); return; }
    report("جارٍ البحث عن المدينة…", "loading");
    try {
      const place = await resolveCity({ city: input.city.trim(), country: input.country.trim(), method: input.method }, controller.signal);
      if (token === request) save(place);
    } catch (error) { if (token === request) report(error.name === "AbortError" ? "انتهت مهلة البحث. حاول مجددًا." : error.message, "error"); }
  }
  function useCoordinates(lat, lon, label) {
    const zone = timezone.value.trim();
    if (!app.validTimezone(zone)) throw new Error("اكتب منطقة زمنية صحيحة مثل Asia/Hebron.");
    save({ latitude: lat, longitude: lon, timezone: zone, method: selectedMethod(), city: city.value.trim(), country: country.value.trim(), label });
  }
  function useGPS() {
    const token = ++request; controller?.abort();
    if (!navigator.geolocation) { report("تحديد الموقع غير متاح. استخدم المدينة أو الإحداثيات.", "error"); return; }
    report("بانتظار إذن الموقع…", "loading");
    navigator.geolocation.getCurrentPosition(position => {
      if (token !== request) return;
      try { useCoordinates(Number(position.coords.latitude.toFixed(4)), Number(position.coords.longitude.toFixed(4)), "موقعي الحالي"); }
      catch (error) { report(error.message, "error"); }
    }, () => { if (token === request) report("تعذّر تحديد الموقع. اكتب المدينة أو الإحداثيات.", "error"); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  }
  form.addEventListener("submit", event => { event.preventDefault(); selectCity({ city: city.value, country: country.value, method: selectedMethod() }); });
  document.getElementById("settingsGeolocation").addEventListener("click", useGPS);
  document.getElementById("settingsCoordinates").addEventListener("click", () => {
    ++request; controller?.abort();
    try {
      if (!latitude.value.trim() || !longitude.value.trim()) throw new Error("أدخل خط العرض وخط الطول أولًا.");
      useCoordinates(Number(latitude.value), Number(longitude.value), city.value.trim() || "إحداثياتي المختارة");
    } catch (error) { report(error.message, "error"); }
  });
  method.addEventListener("change", () => { const place = app.getLocation(); if (place) { const saved = app.setLocation({ ...place, method: selectedMethod() }); report(saved ? "تم تطبيق طريقة الحساب محليًا." : "تم تطبيق طريقة الحساب، لكن تعذّر حفظها."); } });
  app.on("select-city", event => selectCity(event.detail));
  app.on("use-location", useGPS);
  fill(app.getLocation());
})();
