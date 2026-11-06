// Try the shop locally with the mock Supabase:  cd tests/shop && PORT=8790 npm run serve
// Sign in with any email and the code 123456. Admin: in the browser console, run
//   localStorage.setItem("msa-session", JSON.stringify({access_token:"tok-admin",refresh_token:"r",expires_at:4e9,user:{id:"33333333-3333-4333-8333-333333333333",email:"artist@example.test"}}))
import { start } from "./server.mjs";
const s = await start();
console.log(`Shop (mock data) at ${s.url}`);
