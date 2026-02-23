import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const PUBLIC_ROUTES = ["/", "/login", "/signup", "/pricing", "/auth/callback", "/payment/success"];

const ADMIN_EMAILS = ["respondsetausi@gmail.com"];

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
    if (user && pathname === "/") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
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

  const isAdmin = ADMIN_EMAILS.includes(user.email || "");

  // Admin routes
  if (pathname.startsWith("/admin")) {
    if (!isAdmin) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return supabaseResponse;
  }

  // PAYWALL CHECK — for /dashboard, verify user has active paid plan
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard")) {
    if (!isAdmin) {
      try {
        const service = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        const { data: profile } = await service
          .from("profiles")
          .select("plan_id, subscription_status")
          .eq("id", user.id)
          .single();

        const hasPaidPlan = profile &&
          profile.plan_id &&
          profile.plan_id !== "free" &&
          profile.plan_id !== "none" &&
          profile.subscription_status === "active";

        if (!hasPaidPlan) {
          const url = new URL("/pricing", request.url);
          url.searchParams.set("gate", "1");
          return NextResponse.redirect(url);
        }
      } catch (err) {
        console.error("Paywall check error:", err);
        // Allow through on error to avoid blocking users
      }
    }
  }

  // Admin auto-redirect
  if (pathname === "/dashboard" && !request.nextUrl.searchParams.has("scanner")) {
    if (isAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|apk|json|js|css|ico)$).*)",
  ],
};
