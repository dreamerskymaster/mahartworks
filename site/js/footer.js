// The footer's Subscribe box and "Total views" counter (her 2026-11-06 ask, modelled on the Nippon Gallery footer).
// Both talk only to this site's own /api (functions/api/*.js, a free Cloudflare D1 database), so the CSP stays 'self'.
// Every page load adds one view; automated browsers (navigator.webdriver: tests, most crawlers) only read the count.
// If the API is missing (local test server, an outage) the counter stays hidden and nothing else breaks.
(() => {
  const box = document.getElementById("visits"), num = document.getElementById("visits-n");
  if (box && num && window.fetch) {
    fetch("/api/visits", { method: navigator.webdriver ? "GET" : "POST", headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || typeof d.total !== "number" || d.total < 1) return;
        num.textContent = d.total.toLocaleString("en-IN");
        box.hidden = false;
      })
      .catch(() => {});
  }

  const form = document.getElementById("sub-form"), msg = document.getElementById("sub-msg");
  if (!form || !msg) return;
  const input = form.querySelector('input[name="email"]'), btn = form.querySelector("button");
  const say = (text, ok) => { msg.textContent = text; msg.classList.toggle("ok", !!ok); msg.classList.toggle("err", !ok); };
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      say("Please enter a valid email address.", false);
      input.focus();
      return;
    }
    btn.disabled = true;
    say("Subscribing…", true);
    fetch("/api/subscribe", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, website: form.website ? form.website.value : "", page: location.pathname }),
    })
      .then((r) => r.json().catch(() => ({})).then((d) => ({ ok: r.ok && d.ok, d })))
      .then(({ ok, d }) => {
        if (ok) {
          say("Thank you! You're subscribed to new artworks.", true);
          form.reset();
        } else {
          say(d && d.error === "email" ? "Please enter a valid email address." : "Sorry, that didn't work. Please try again later.", false);
        }
      })
      .catch(() => say("Sorry, that didn't work. Please try again later.", false))
      .finally(() => { btn.disabled = false; });
  });
})();
