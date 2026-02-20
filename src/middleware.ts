import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/pricing", "/auth/callback"];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;

  // Allow public routes and API routes
  if (PUBLIC_ROUTES.some((r) => pathname === r || (r !== "/" && pathname.startsWith(r))) || pathname.startsWith("/api/")) {
    // If logged in user visits landing page, send to dashboard
    if (user && pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    // If logged in user visits login/signup, send to dashboard
    if (user && (pathname === "/login" || pathname === "/signup")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return supabaseResponse;
  }

  // Protected routes - redirect to login if not authenticated
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Fetch profile once for all checks
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // Check if user is blocked (query is_blocked separately to avoid breaking if column missing)
  const { data: blockCheck } = await supabase
    .from("profiles")
    .select("is_blocked")
    .eq("id", user.id)
    .single();

  if (blockCheck?.is_blocked && !pathname.startsWith("/blocked")) {
    // Sign them out and redirect
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("blocked", "true");
    return NextResponse.redirect(url);
  }

  // Track last_seen_at (fire-and-forget, non-blocking)
  supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id).then(() => {});

  // Admin auto-redirect: if admin lands on /dashboard, send to /admin (unless they explicitly want scanner)
  if (pathname === "/dashboard" && !request.nextUrl.searchParams.has("scanner")) {
    if (profile?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  // Admin route protection
  if (pathname.startsWith("/admin")) {
    if (profile?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
