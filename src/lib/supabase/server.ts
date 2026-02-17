import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// User-context client (respects RLS)
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component - can't set cookies
          }
        },
      },
    }
  );
}

// Admin/service role client (bypasses RLS) - for credit operations
export function createServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function getUser() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*, plans(*)")
    .eq("id", user.id)
    .single();

  return profile;
}

export async function requireAuth() {
  const profile = await getUser();
  if (!profile) {
    throw new Error("Unauthorized");
  }
  return profile;
}

export async function requireAdmin() {
  const profile = await requireAuth();
  if (profile.role !== "admin") {
    throw new Error("Forbidden");
  }
  return profile;
}
