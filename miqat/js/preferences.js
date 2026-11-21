/* الموقع والمحتوى وحجم الكروت والروابط: إعدادات محفوظة لكل متصفح. */
(() => {
  const app = window.Dashboard;
  const key = "dailyDashboard.view.v1";
  const defaults = { width: 430, hijriOffset: 0, currencyBase: "ILS", hijriAtSunset: false, hiddenCards: [] };
  const ids = ["dateCard","prayerCard","currencyCard","weatherCard","duaCard"];
  const saved = app.read(key, {});
  const prefs = { ...defaults, ...(saved && typeof saved === "object" ? saved : {}) };
  prefs.width = Number.isFinite(Number(prefs.width)) ? Math.min(600, Math.max(300, Number(prefs.width))) : 430;
  prefs.hijriOffset = [-2,-1,0,1,2].includes(Number(prefs.hijriOffset)) ? Number(prefs.hijriOffset) : 0;
  prefs.currencyBase = ["ILS","USD","EUR","JOD"].includes(prefs.currencyBase) ? prefs.currencyBase : "ILS";
  prefs.hiddenCards = Array.isArray(prefs.hiddenCards) ? [...new Set(prefs.hiddenCards.filter((id) => ids.includes(id)))] : [];
  if (prefs.hiddenCards.length === ids.length) prefs.hiddenCards = [];
  prefs.hijriAtSunset = prefs.hijriAtSunset === true;
  const message = document.getElementById("preferencesStatus");
  function apply(save = false) {
    document.documentElement.style.setProperty("--dashboard-width", `${prefs.width}px`);
    document.getElementById("cardWidthValue").textContent = `${prefs.width}px`;
    ids.forEach((id) => {
      const checkbox = document.querySelector(`[data-card-toggle="${id}"]`);
      const hidden = prefs.hiddenCards.includes(id);
      document.getElementById(id).closest(".card-slot").hidden = hidden;
      checkbox.checked = !hidden;
    });
    if (save) message.textContent = app.write(key, prefs) ? "تم حفظ الإعدادات." : "تغيّرت الإعدادات، لكن المتصفح لم يسمح بحفظها.";
    app.emit("view", prefs);
  }
  document.getElementById("hijriAtSunset").checked = prefs.hijriAtSunset;
  document.getElementById("hijriAtSunset").addEventListener("change", event => { prefs.hijriAtSunset = event.target.checked; apply(true); });
  document.getElementById("cardWidth").value = String(prefs.width);
  document.getElementById("hijriOffset").value = String(prefs.hijriOffset);
  document.getElementById("currencyBase").value = prefs.currencyBase;
  document.getElementById("cardWidth").addEventListener("input", (event) => { prefs.width = Number(event.target.value); apply(true); });
  document.getElementById("hijriOffset").addEventListener("change", (event) => { prefs.hijriOffset = Number(event.target.value); apply(true); });
  document.getElementById("currencyBase").addEventListener("change", (event) => { prefs.currencyBase = event.target.value; apply(true); });
  document.querySelectorAll("[data-card-toggle]").forEach((checkbox) => checkbox.addEventListener("change", () => {
    const id = checkbox.dataset.cardToggle;
    const next = prefs.hiddenCards.filter((value) => value !== id);
    if (!checkbox.checked) next.push(id);
    if (next.length === ids.length) { checkbox.checked = true; message.textContent = "اترك كرتًا واحدًا ظاهرًا على الأقل."; return; }
    prefs.hiddenCards = next; apply(true);
  }));
  document.getElementById("resetView").addEventListener("click", () => {
    Object.assign(prefs, { ...defaults, hiddenCards: [] });
    document.getElementById("hijriAtSunset").checked = false;
    document.getElementById("cardWidth").value = "430";
    document.getElementById("hijriOffset").value = "0";
    document.getElementById("currencyBase").value = "ILS";
    apply(true);
  });
  document.getElementById("resetDuaCycle").addEventListener("click", () => {
    app.emit("reset-duas", null);
    message.textContent = "بدأت دورة جديدة للأدعية.";
  });
  function openLocation() {
    if (!document.querySelector(".wind").classList.contains("active")) document.querySelector(".show").click();
    document.getElementById("settingsCity").scrollIntoView({ block: "center" });
    document.getElementById("settingsCity").focus();
  }
  app.on("open-location", openLocation);
  apply();
})();

(() => {
  const app = window.Dashboard;
  const names = { whatsapp: "linkWhatsapp", facebook: "linkFacebook", linkedin: "linkLinkedin", github: "linkGithub", website: "linkWebsite" };
  const values = { ...window.DASHBOARD_CONFIG?.links, ...app.read("dailyDashboard.links.v1", {}) };
  for (const [name, id] of Object.entries(names)) document.getElementById(id).value = typeof values[name] === "string" ? values[name] : "";
  document.getElementById("socialLinksForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const links = {};
    const status = document.getElementById("linksStatus");
    for (const [name, id] of Object.entries(names)) {
      let value = document.getElementById(id).value.trim();
      if (!value) { links[name] = ""; continue; }
      if (name === "whatsapp" && /^\+?[\d\s()-]{6,25}$/.test(value)) {
        const digits = value.replace(/\D/g, "");
        if (!/^\d{7,15}$/.test(digits)) { status.textContent = "اكتب رقم واتساب دوليًا صحيحًا."; document.getElementById(id).focus(); return; }
        value = `https://wa.me/${digits}`;
      }
      try {
        const url = new URL(value);
        if (url.protocol !== "https:") throw new Error();
        links[name] = url.href;
      } catch { status.textContent = "اكتب رابط HTTPS صحيحًا، أو اترك الحقل فارغًا."; document.getElementById(id).focus(); return; }
    }
    const saved = app.write("dailyDashboard.links.v1", links);
    app.emit("links", links);
    status.textContent = saved ? "تم حفظ الروابط وتحديث الفوتر." : "تم تحديث الروابط، لكن المتصفح لم يسمح بحفظها.";
  });
})();
