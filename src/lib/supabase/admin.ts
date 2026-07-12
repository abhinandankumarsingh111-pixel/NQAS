import { createClient as createAdmin } from "@supabase/supabase-js";

// Service-role client. SERVER ONLY. Bypasses RLS. Used to create/delete login IDs.
export function adminClient() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
