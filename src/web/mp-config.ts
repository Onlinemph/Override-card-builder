/**
 * Baked-in multiplayer backend (Supabase Realtime).
 *
 * These are PUBLIC client credentials by design — the Supabase "anon" key is
 * meant to ship in browser code, so it's safe to commit here. It lets the app's
 * online battle work for everyone who opens the site, with zero setup on their
 * part. Set up once at supabase.com (free), paste the two values below, and it
 * deploys with the normal GitHub Pages build.
 *
 * To wire it up: Supabase project → Project Settings → API →
 *   - Project URL  → SUPABASE_URL
 *   - anon public  → SUPABASE_ANON_KEY
 */
export const SUPABASE_URL = "https://YOUR_PROJECT.supabase.co";
export const SUPABASE_ANON_KEY = "PASTE_YOUR_ANON_PUBLIC_KEY_HERE";

/** True once real credentials have been filled in above. */
export const MP_CONFIGURED =
  /^https:\/\/[a-z0-9]+\.supabase\.co/.test(SUPABASE_URL) &&
  SUPABASE_ANON_KEY.length > 40 &&
  !SUPABASE_ANON_KEY.startsWith("PASTE_");
