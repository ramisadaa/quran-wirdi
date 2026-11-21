(() => {
  const app = window.Dashboard;
  const defaults = window.DASHBOARD_CONFIG?.links || {};
  let links = { ...defaults, ...app.read("dailyDashboard.links.v1", {}) };
  function render() {
    document.querySelectorAll("[data-footer-link]").forEach((element) => {
      let url;
      try { url = new URL(links[element.dataset.footerLink]); } catch { url = null; }
      const valid = url?.protocol === "https:";
      element.hidden = !valid;
      if (valid) {
        element.href = url.href; element.target = "_blank"; element.rel = "noopener noreferrer";
        element.classList.remove("is-unavailable"); element.removeAttribute("aria-disabled");
      } else { element.removeAttribute("href"); element.setAttribute("aria-disabled", "true"); }
    });
    document.getElementById("footerYear").textContent = String(new Date().getFullYear());
  }
  app.on("links", (event) => { links = { ...defaults, ...event.detail }; render(); });
  render();
})();
