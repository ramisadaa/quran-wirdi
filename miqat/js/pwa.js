(() => {
  "use strict";
  const status = document.getElementById("offlineStatus");
  if (!("serviceWorker" in navigator) || !window.isSecureContext) { status.textContent = "الحفظ دون اتصال يتطلب HTTPS أو localhost وزيارة أولى متصلة."; return; }
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
      await navigator.serviceWorker.ready;
      status.textContent = "ملفات التطبيق محفوظة للعمل دون اتصال";
    } catch { status.textContent = "تعذّر تجهيز نسخة العمل دون اتصال. تبقى الوظائف المتاحة وبياناتها المحلية محفوظة."; }
  });
})();
