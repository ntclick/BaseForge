import { createClient } from "@supabase/supabase-js";

let _browser: ReturnType<typeof createClient> | null = null;

// Singleton browser client (uses anon/publishable key).
export function supabaseBrowser() {
  if (!_browser) {
    _browser = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return _browser;
}

// Server-only — never import from client components.
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
}
