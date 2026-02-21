import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAuthUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch {}
        },
      },
    }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { rating, scan_id } = await req.json();
    if (!rating || rating < 1 || rating > 5) {
      return NextResponse.json({ error: "Rating must be 1-5" }, { status: 400 });
    }

    const { error } = await supabaseAdmin.from("scan_ratings").insert({
      user_id: user.id,
      scan_id: scan_id || null,
      rating,
    });

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Rating error:", error);
    return NextResponse.json({ error: "Failed to save rating" }, { status: 500 });
  }
}

// GET average rating (for admin stats)
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("scan_ratings")
      .select("rating");

    if (error) throw error;

    const total = data?.length || 0;
    const avg = total > 0 ? data.reduce((s, r) => s + r.rating, 0) / total : 0;
    const dist = [1, 2, 3, 4, 5].map(r => ({
      stars: r,
      count: data?.filter(d => d.rating === r).length || 0,
    }));

    return NextResponse.json({ average: Math.round(avg * 10) / 10, total, distribution: dist });
  } catch (error) {
    console.error("Rating fetch error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
