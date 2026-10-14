import { sendCode, verifyCode, completeRedirectSignIn, getSession, friendly } from "../api.js";
import { $, renderChrome, setBusy, safeNext } from "../ui.js";

renderChrome("account");
const next = safeNext(new URLSearchParams(location.search).get("next"));
const go = () => location.replace(next);
const fail = (el, e) => { el.textContent = friendly(e); el.hidden = false; };

try {
  if (await completeRedirectSignIn()) go();          // came back from the email link
  else if (await getSession()) go();                 // already signed in
} catch (e) { fail($("#email-err"), e); }

let email = "";
$("#email-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  email = $("#email").value.trim().toLowerCase();
  $("#email-err").hidden = true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return fail($("#email-err"), new Error("Please enter a valid email address."));
  setBusy($("#send"), true, "Sending");
  try {
    await sendCode(email, `${location.origin}/signin?next=${encodeURIComponent(next)}`);
    $("#sent-to").textContent = email;
    $("#email-form").hidden = true; $("#code-form").hidden = false; $("#code").focus();
  } catch (err) { fail($("#email-err"), err); }
  setBusy($("#send"), false);
});

$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = $("#code").value.replace(/\D/g, "");
  $("#code-err").hidden = true;
  if (code.length !== 6) return fail($("#code-err"), new Error("The code has 6 digits."));
  setBusy($("#verify"), true, "Checking");
  try { await verifyCode(email, code); go(); }
  catch (err) { fail($("#code-err"), new Error("That code didn't work. Check it, or ask for a new one.")); setBusy($("#verify"), false); }
});
$("#restart").addEventListener("click", () => { $("#code-form").hidden = true; $("#email-form").hidden = false; $("#email").focus(); });
