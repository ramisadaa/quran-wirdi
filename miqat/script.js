/* المظهر ونافذة الإعدادات؛ زر المستخدم يحتفظ بنفس وظيفته وكلاس show. */
(() => {
  "use strict";
  const app = window.Dashboard, scene = document.getElementById("scene");
  const themes = [
    { name: "green", label: "أخضر", color: "#0b6248" },
    { name: "blue", label: "أزرق", color: "#195b8d" },
    { name: "burgundy", label: "عنابي", color: "#7d284b" }
  ];
  const fonts = [
    { label: "نوتو العربي", value: "'Calendar Arabic', sans-serif" },
    { label: "القاهرة", value: "'Cairo', 'Calendar Arabic', sans-serif" }
  ];
  function applyTheme(theme) {
    scene.dataset.background = theme.name;
    document.querySelectorAll(".app-card").forEach(card => { card.dataset.card = theme.name; });
    document.documentElement.style.setProperty("--main-color", theme.color);
    document.querySelector('meta[name="theme-color"]').content = theme.color;
    document.querySelectorAll(".color-circle").forEach(button => { const active = button.dataset.theme === theme.name; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    app.emit("appearance", { theme: theme.name });
  }
  function applyFont(font) {
    document.documentElement.style.setProperty("--main-font", font.value);
    document.querySelectorAll(".font-circle").forEach(button => { const active = button.dataset.font === font.value; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
  }
  themes.forEach(theme => {
    const button = document.createElement("button"); button.type = "button"; button.className = "color-circle"; button.dataset.theme = theme.name;
    button.style.setProperty("--circle-color", theme.color); button.setAttribute("aria-label", `اللون ${theme.label}`); button.title = theme.label;
    button.addEventListener("click", () => { applyTheme(theme); app.write("dailyDashboard.themeColor.v1", theme.name); });
    document.querySelector(".theme-colors").appendChild(button);
  });
  fonts.forEach(font => {
    const button = document.createElement("button"); button.type = "button"; button.className = "font-circle"; button.dataset.font = font.value; button.textContent = font.label;
    button.style.fontFamily = font.value;
    button.addEventListener("click", () => { applyFont(font); app.write("dailyDashboard.themeFont.v1", font.value); });
    document.querySelector(".theme-font").appendChild(button);
  });
  applyTheme(themes.find(theme => theme.name === app.read("dailyDashboard.themeColor.v1")) || themes[0]);
  applyFont(fonts.find(font => font.value === app.read("dailyDashboard.themeFont.v1")) || fonts[0]);

  const container = document.querySelector(".setting"), button = document.querySelector(".show"), panel = document.querySelector(".wind");
  const sceneElement = document.getElementById("scene");
  function setOpen(open) {
    container.classList.toggle("active", open); panel.classList.toggle("active", open);
    button.setAttribute("aria-expanded", String(open)); document.body.classList.toggle("settings-open", open);
    sceneElement.inert = open;
    if (open) document.getElementById("closeSettings").focus(); else button.focus();
  }
  button.addEventListener("click", () => setOpen(!panel.classList.contains("active")));
  document.getElementById("closeSettings").addEventListener("click", () => setOpen(false));
  container.addEventListener("click", event => { if (event.target === container) setOpen(false); });
  document.addEventListener("keydown", event => {
    if (!panel.classList.contains("active")) return;
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); return; }
    if (event.key !== "Tab") return;
    const options = Array.from(panel.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(element => !element.disabled && element.getClientRects().length);
    const first = options[0], last = options.at(-1);
    if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); (last || panel).focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); (first || panel).focus(); }
  });
})();
