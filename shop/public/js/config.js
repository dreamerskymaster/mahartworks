// Where the shop talks to. The Supabase URL and publishable key are public by design: every visitor's browser
// receives them. They give no access by themselves: what anyone can read or change is decided by the
// database (row level security and the shop_* functions). Never put a secret or service-role key here.
export const SUPABASE_URL = "https://geyyqbgqknyngmbyfjxd.supabase.co";
export const SUPABASE_KEY = "sb_publishable_ft5X6G4nBOg-l-PD3tNC-g_h0UOqa78";
export const MAIN_SITE = "https://mah-artworks.pages.dev";   // the gallery: images, data.js, certificate.js
export const SHOP_SITE = "https://mah-artworks-shop.pages.dev";
