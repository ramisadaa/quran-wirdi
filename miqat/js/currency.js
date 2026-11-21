/* الحساب المركزي ثلاث مرات يوميًا؛ التحديث الشخصي يذهب للمجاني فقط. */
(() => {
  "use strict";
  const app = window.Dashboard, status = document.getElementById("currencyStatus"), refresh = document.getElementById("refreshCurrency");
  const dataURL = new URL("../data/exchange-rates.json", document.currentScript.src);
  const cacheKey = "dailyDashboard.sharedExchange.v1", allCodes = ["USD", "EUR", "ILS", "JOD"];
  let siteSnapshot = null, personalSnapshot = null, siteOffline = false, refreshing = false, request = 0, controller, notice = "";
  function baseCurrency() { const code = app.read("dailyDashboard.view.v1", {}).currencyBase; return allCodes.includes(code) ? code : "ILS"; }
  function valid(value) {
    return value?.base === "USD" && typeof value.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.date) && Number.isFinite(Date.parse(value.fetchedAt)) &&
      allCodes.every(code => Number.isFinite(value.quotes?.[code]) && value.quotes[code] > 0) && value.quotes.USD === 1;
  }
  function paint() {
    const value = personalSnapshot || siteSnapshot;
    if (!valid(value)) { status.textContent = refreshing ? "جارٍ التحديث المجاني…" : notice || "جارٍ قراءة الأسعار المشتركة…"; return; }
    const base = baseCurrency(), format = new Intl.NumberFormat("en", { style: "currency", currency: base, maximumFractionDigits: 3 });
    for (const code of ["USD", "EUR", "JOD"]) {
      const output = document.getElementById(`rate${code}`); output.textContent = format.format(value.quotes[base] / value.quotes[code]);
      const row = output.closest(".rate-row"); if (row) row.hidden = code === base;
    }
    document.getElementById("currencyBaseLabel").textContent = `سعر الوحدة مقابل ${base}`;
    document.getElementById("currencyBadge").textContent = personalSnapshot ? "مجاني" : "مشترك";
    const source = document.getElementById("currencySource"); source.textContent = value.provider || "مصدر الأسعار"; source.removeAttribute("href");
    try { const url = new URL(value.providerUrl); if (url.protocol === "https:") source.href = url.href; } catch { /* لا رابط غير آمن */ }
    document.getElementById("currencyMeta").textContent = `تاريخ السعر: ${value.date} • جُلب: ${app.dateLabel(Date.parse(value.fetchedAt))}`;
    status.textContent = refreshing ? "جارٍ التحقق من الخدمة المجانية…" : notice || (personalSnapshot ? "تحديث شخصي لهذا العرض" : siteOffline ? "بيانات مشتركة محفوظة على جهازك" : "بيانات مشتركة من الموقع");
    if (notice && siteOffline && !personalSnapshot) status.textContent += " • نسخة محفوظة";
    status.dataset.state = refreshing ? "loading" : siteOffline && !personalSnapshot ? "cached" : "ready";
  }
  async function loadSite() {
    const token = ++request; controller?.abort(); controller = new AbortController();
    if (!siteSnapshot) { const cached = app.read(cacheKey); if (valid(cached)) { siteSnapshot = cached; siteOffline = true; } }
    paint();
    try {
      let cachedResponse = false;
      const data = await app.getJSON(dataURL.href, controller.signal, 12000, { onResponse: response => { cachedResponse = response.headers?.get("X-DailyDashboard-Cache") === "offline"; } });
      if (token !== request) return;
      if (!valid(data.latest)) throw new Error("invalid site data");
      siteSnapshot = data.latest; siteOffline = cachedResponse || window.navigator?.onLine === false; app.write(cacheKey, siteSnapshot);
      if (personalSnapshot && personalSnapshot.date <= siteSnapshot.date) { personalSnapshot = null; notice = ""; }
    } catch {
      if (token !== request) return;
      siteOffline = true;
      if (!siteSnapshot && !personalSnapshot) notice = "لا تتوفر الأسعار المشتركة حاليًا. شغّل الموقع عبر خادم محلي أو الاستضافة.";
    }
    paint();
  }
  function normalizeFree(data) {
    const date = data?.date;
    const stamp = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) ? Date.parse(`${date}T00:00:00Z`) : NaN;
    if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== date || stamp > Date.now() + 86400000) throw new Error("invalid date");
    const value = { base: "USD", date, fetchedAt: new Date().toISOString(), provider: "Currency API", providerUrl: "https://github.com/fawazahmed0/exchange-api", quotes: {} };
    for (const code of allCodes) value.quotes[code] = data?.usd?.[code.toLowerCase()];
    if (!valid(value)) throw new Error("invalid rates");
    // حدود واسعة دون لقطة مرجعية؛ ومع اللقطة يجب ألا ينحرف أي زوج معروض أكثر من 20%.
    if (value.quotes.ILS < .1 || value.quotes.ILS > 1000 || value.quotes.EUR < .05 || value.quotes.EUR > 20 || value.quotes.JOD < .05 || value.quotes.JOD > 20) throw new Error("unsafe rates");
    if (siteSnapshot) for (const from of allCodes) for (const to of allCodes) {
      const baseline = siteSnapshot.quotes[to] / siteSnapshot.quotes[from];
      const ratio = value.quotes[to] / value.quotes[from];
      if (Math.abs(ratio / baseline - 1) > .20) throw new Error("unsafe deviation");
    }
    return value;
  }
  async function refreshPersonal() {
    if (refreshing) return;
    refreshing = true; refresh.disabled = true; refresh.setAttribute("aria-busy", "true"); notice = ""; paint();
    const date = new Date().toISOString().slice(0,10);
    // إصدار اليوم مثبت؛ لا نعتمد على cache الخاص بالوسم @latest.
    const urls = [`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`, `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`];
    let newer = null, noNewer = false, unsafe = false, unpublished = false, invalid = false;
    for (const url of urls) {
      try {
        const value = normalizeFree(await app.getJSON(url, null, 8000));
        if (siteSnapshot && value.date <= siteSnapshot.date) { noNewer = true; continue; }
        newer = value; break;
      } catch (error) {
        if (error.message.includes("unsafe")) unsafe = true;
        else if (error.status === 404) unpublished = true;
        else if (error.message.startsWith("invalid") || error instanceof SyntaxError) invalid = true;
      }
    }
    if (newer) { personalSnapshot = newer; notice = "تحديث مجاني أحدث لهذا العرض فقط"; }
    else {
      personalSnapshot = null;
      if (unsafe) notice = siteSnapshot ? "لم تُعتمد قيم غير معتادة؛ بقيت الأسعار المشتركة" : "لم تُعرض قيم مجانية غير موثوقة";
      else if (noNewer) notice = "لا توجد بيانات أحدث من بيانات الموقع";
      else if (unpublished) notice = siteSnapshot ? "لم تنشر الخدمة نسخة هذا اليوم؛ بقيت البيانات الأساسية" : "لم تنشر الخدمة نسخة هذا اليوم ولا توجد نسخة مشتركة محفوظة";
      else if (invalid) notice = siteSnapshot ? "استجابة مجانية غير صالحة؛ بقيت البيانات الأساسية" : "استجابة مجانية غير صالحة ولا توجد نسخة مشتركة محفوظة";
      else notice = siteSnapshot ? "تعذّر الاتصال بالخدمة المجانية؛ بقيت الأسعار المشتركة" : "تعذّر التحديث ولا توجد نسخة مشتركة محفوظة";
    }
    refreshing = false; refresh.disabled = false; refresh.setAttribute("aria-busy", "false"); paint();
  }
  refresh.addEventListener("click", refreshPersonal); app.on("view", paint); app.on("location", paint);
  window.addEventListener("online", loadSite); document.addEventListener("visibilitychange", () => { if (!document.hidden) loadSite(); }); loadSite();
})();
