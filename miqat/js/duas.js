/* data/duas.json هو مصدر النصوص الوحيد.
   Local Storage يحفظ IDs المقروءة، وليس نسخة من محتوى الملف. */
(() => {
  "use strict";
  const app = window.Dashboard;
  const card = document.getElementById("duaCard");
  if (!card) return;
  const text = document.getElementById("duaText");
  const source = document.getElementById("duaSource");
  const fullText = document.getElementById("duaFullText");
  const details = document.getElementById("duaDetails");
  const counter = document.getElementById("duaCounter");
  const status = document.getElementById("duaStatus");
  const previous = document.getElementById("previousDua");
  const next = document.getElementById("nextDua");
  const retry = document.getElementById("retryDuas");
  const storageKey = "dailyDashboard.duaReading.v1";
  const scriptURL = document.currentScript?.src;
  const jsonURL = new URL(scriptURL ? "../data/duas.json" : "data/duas.json", scriptURL || document.baseURI);
  let duas = [];
  let byId = new Map();
  let reading = { version: 1, readIds: [], lastId: null };
  let viewIndex = -1;
  let loading = false;
  let canSave = true;
  let selectedThisOpen = false;
  function visible() { return !card.closest(".card-slot").hidden; }

  function readProgress() {
    const saved = app.read(storageKey);
    if (saved?.version === 1 && Array.isArray(saved.readIds)) {
      reading.readIds = [...new Set(saved.readIds.filter(id => typeof id === "string" && byId.has(id)))];
      reading.lastId = typeof saved.lastId === "string" ? saved.lastId : null;
    }
  }
  function saveProgress() { canSave = app.write(storageKey, reading); }

  function render() {
    const dua = byId.get(reading.readIds[viewIndex]);
    if (!dua) return;
    text.textContent = fullText.textContent = dua.text;
    source.textContent = dua.reference;
    source.href = dua.sourceUrl;
    counter.textContent = `قُرئ ${reading.readIds.length} / ${duas.length}`;
    previous.disabled = viewIndex <= 0;
    next.disabled = duas.length === 0;
    details.open = false;
    status.textContent = canSave ? "" : "المتصفح لم يسمح بحفظ سجل القراءة بعد إغلاق الصفحة.";
  }

  function chooseUnread() {
    selectedThisOpen = true;
    let available = duas.filter((dua) => !reading.readIds.includes(dua.id));
    if (!available.length) {
      // الدورة تكتمل قبل مسح سجلها؛ لا نمس بقية إعدادات التطبيق.
      reading.readIds = [];
      available = duas;
    }
    // تجنّب نفس الدعاء عند الحد الفاصل بين دورتين، ما دامت القائمة تضم أكثر من دعاء.
    if (available.length > 1) available = available.filter((dua) => dua.id !== reading.lastId);
    const chosen = available[Math.floor(Math.random() * available.length)];
    reading.readIds.push(chosen.id);
    reading.lastId = chosen.id;
    viewIndex = reading.readIds.length - 1;
    saveProgress();
    render();
  }

  function validate(data) {
    if (!Array.isArray(data) || !data.length || !data.every((dua) =>
      dua && typeof dua.id === "string" && dua.id.trim() &&
      typeof dua.text === "string" && dua.text.trim() &&
      typeof dua.reference === "string" && dua.reference.trim() &&
      typeof dua.sourceUrl === "string" && /^https:\/\//.test(dua.sourceUrl) && (() => { try { return new URL(dua.sourceUrl).protocol === "https:"; } catch { return false; } })()) ||
      new Set(data.map((dua) => dua.id)).size !== data.length) {
      throw new Error("ملف الأدعية غير صالح. يلزم لكل دعاء id فريد ونص text ومرجع reference ورابط sourceUrl آمن.");
    }
  }

  async function load() {
    if (loading) return;
    loading = true;
    card.setAttribute("aria-busy", "true");
    retry.disabled = true;
    previous.disabled = next.disabled = true;
    status.textContent = "";
    const controller = new AbortController();
    try {
      if (jsonURL.protocol === "file:") {
        throw new Error("شغّل التطبيق من start.bat أو Live Server لقراءة ملف الأدعية تلقائيًا.");
      }
      const data = await app.getJSON(jsonURL.href, controller.signal, 10000, { cache: "no-cache" });
      validate(data);
      duas = data;
      byId = new Map(duas.map((dua) => [dua.id, dua]));
      readProgress();
      // مرة واحدة عند فتح الصفحة أو تحديثها: دعاء جديد من غير المقروء.
      if (visible()) chooseUnread();
      retry.hidden = true;
    } catch (error) {
      duas = [];
      byId = new Map();
      text.textContent = "الأدعية غير محمّلة";
      fullText.textContent = "";
      source.textContent = "";
      counter.textContent = "—";
      details.open = false;
      status.textContent = error instanceof SyntaxError ? "ملف JSON غير صالح. راجع الفواصل وعلامات الاقتباس." :
        error.name === "AbortError" ? "انتهت مهلة قراءة الأدعية. أعد المحاولة." : error.message;
      retry.hidden = false;
    } finally {
      loading = false;
      retry.disabled = false;
      card.setAttribute("aria-busy", "false");
    }
  }

  previous.addEventListener("click", () => {
    if (viewIndex <= 0) return;
    viewIndex -= 1;
    render();
  });
  next.addEventListener("click", () => {
    if (!duas.length) return;
    // مراجعة دعاء سابق لا تحتسبه دعاءً جديدًا، ولا تُعيد ترتيب سجل القراءة.
    if (viewIndex < reading.readIds.length - 1) { viewIndex += 1; render(); }
    else chooseUnread();
  });
  app.on("view", () => {
    if (duas.length && visible() && !selectedThisOpen) chooseUnread();
  });
  app.on("reset-duas", () => {
    if (!duas.length) return;
    reading = { version: 1, readIds: [], lastId: reading.lastId };
    selectedThisOpen = false;
    if (visible()) chooseUnread(); else saveProgress();
  });
  retry.addEventListener("click", load);
  load();
})();
