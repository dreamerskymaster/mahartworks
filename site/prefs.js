// Display & accessibility preferences, shared by every page.
// Loaded in <head> so the saved theme is applied before first paint.
(function () {
  const KEY = "ms-prefs";
  const DEFAULTS = { theme: "auto", size: "1", calm: false, contrast: false, readable: false, links: false };
  const root = document.documentElement;
  let prefs = { ...DEFAULTS };
  try { prefs = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch (e) { /* storage blocked */ }
  if (matchMedia("(prefers-reduced-motion: reduce)").matches && !("calmSet" in prefs)) prefs.calm = true;

  function apply() {
    if (prefs.theme === "auto") root.removeAttribute("data-theme"); else root.dataset.theme = prefs.theme;
    root.style.setProperty("--scale", prefs.size);
    ["calm", "contrast", "readable", "links"].forEach((k) => root.classList.toggle(k, !!prefs[k]));
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* ignore */ } }
  apply();
  window.MS_PREFS = prefs;

  const icon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="4.5" r="2"/><path d="M4 8.5l8 1.5 8-1.5M12 10v5m0 0l-3.5 6.5M12 15l3.5 6.5"/></svg>';
  const seg = (name, legend, opts) => `<fieldset><legend>${legend}</legend><div class="seg">${opts.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${v}"><span>${l}</span></label>`).join("")}</div></fieldset>`;
  const tog = (name, label) => `<label class="toggle"><span>${label}</span><input type="checkbox" name="${name}"></label>`;

  document.addEventListener("DOMContentLoaded", () => {
    const nav = document.querySelector(".nav");
    if (!nav) return;
    const btn = document.createElement("button");
    btn.className = "a11y-btn";
    btn.setAttribute("aria-expanded", "false");
    btn.setAttribute("aria-controls", "a11y-panel");
    btn.innerHTML = `${icon}<span>Display</span>`;
    const wrap = document.createElement("div");
    wrap.className = "nav-right";
    nav.querySelector("nav") && wrap.appendChild(nav.querySelector("nav"));
    wrap.appendChild(btn);
    nav.appendChild(wrap);

    const panel = document.createElement("div");
    panel.id = "a11y-panel";
    panel.className = "a11y-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Display and accessibility settings");
    panel.hidden = true;
    panel.innerHTML = `<button class="a11y-close" aria-label="Close settings">×</button>
      <h2>Display &amp; accessibility</h2>
      ${seg("theme", "Theme", [["auto", "Auto"], ["light", "Light"], ["dark", "Dark"]])}
      ${seg("size", "Text size", [["1", "A"], ["1.15", "A+"], ["1.3", "A++"]])}
      <fieldset><legend>Comfort</legend>
        ${tog("calm", "Reduce motion &amp; animations")}
        ${tog("contrast", "Higher contrast")}
        ${tog("readable", "Easier-to-read font")}
        ${tog("links", "Underline links")}
      </fieldset>
      <button class="a11y-reset" type="button">Reset to defaults</button>`;
    document.body.appendChild(panel);

    const sync = () => {
      panel.querySelectorAll("input").forEach((i) => {
        i.checked = i.type === "radio" ? String(prefs[i.name]) === i.value : !!prefs[i.name];
      });
    };
    sync();
    const open = (v) => {
      panel.hidden = !v;
      btn.setAttribute("aria-expanded", String(v));
      if (v) panel.querySelector("input:checked, input").focus();
    };
    btn.addEventListener("click", () => open(panel.hidden));
    panel.querySelector(".a11y-close").addEventListener("click", () => { open(false); btn.focus(); });
    panel.addEventListener("change", (e) => {
      const i = e.target;
      prefs[i.name] = i.type === "radio" ? i.value : i.checked;
      if (i.name === "calm") prefs.calmSet = true;
      apply(); save();
      document.dispatchEvent(new CustomEvent("prefs-change", { detail: prefs }));
    });
    panel.querySelector(".a11y-reset").addEventListener("click", () => {
      Object.keys(prefs).forEach((k) => delete prefs[k]);
      Object.assign(prefs, DEFAULTS);
      apply(); save(); sync();
      document.dispatchEvent(new CustomEvent("prefs-change", { detail: prefs }));
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !panel.hidden) { open(false); btn.focus(); } });
    document.addEventListener("click", (e) => {
      if (!panel.hidden && !panel.contains(e.target) && !btn.contains(e.target)) open(false);
    });
  });
})();
