// /unsubscribe: takes an address off the Subscribe-box list (functions/api/unsubscribe.js).
// A link like /unsubscribe?email=name@example.com fills the box in. The reply never says whether the address was listed.
(() => {
  const form = document.getElementById("unsub-form"), msg = document.getElementById("unsub-msg");
  if (!form || !msg) return;
  const input = form.querySelector('input[name="email"]'), btn = form.querySelector("button");
  const given = new URLSearchParams(location.search).get("email");
  if (given) input.value = given.slice(0, 254);
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
    say("Removing…", true);
    fetch("/api/unsubscribe", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email }),
    })
      .then((r) => r.json().catch(() => ({})).then((d) => r.ok && d.ok))
      .then((ok) => say(ok ? "Done. This address will not get any more emails about new artworks."
        : "Sorry, that didn't work. Please try again later, or email us.", ok))
      .catch(() => say("Sorry, that didn't work. Please try again later, or email us.", false))
      .finally(() => { btn.disabled = false; });
  });
})();
