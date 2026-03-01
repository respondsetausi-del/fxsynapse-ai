import { NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/supabase/server";

// POST: Upload annotated chart image for a scan
export async function POST(req: Request) {
  try {
    const user = await requireAuth();
    const { shareId, imageBase64 } = await req.json();

    if (!shareId || !imageBase64) {
      return NextResponse.json({ error: "Missing shareId or imageBase64" }, { status: 400 });
    }

    const supabase = createServiceSupabase();

    // Verify scan belongs to user
    const { data: scan } = await supabase
      .from("scans")
      .select("id, user_id")
      .eq("share_id", shareId)
      .single();

    if (!scan || scan.user_id !== user.id) {
      return NextResponse.json({ error: "Scan not found" }, { status: 404 });
    }

    // Decode base64 → Buffer
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");
    const fileName = `annotated/${user.id}/${shareId}.png`;

    // Upload to storage
    const { error: uploadError } = await supabase.storage
      .from("scans")
      .upload(fileName, buffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Chart upload error:", uploadError);
      return NextResponse.json({ error: "Upload failed" }, { status: 500 });
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from("scans").getPublicUrl(fileName);
    const chartImageUrl = urlData?.publicUrl;

    // Update scan record
    if (chartImageUrl) {
      await supabase
        .from("scans")
        .update({ chart_image_url: chartImageUrl })
        .eq("id", scan.id);
    }

    return NextResponse.json({ success: true, chartImageUrl });
  } catch (error) {
    console.error("Chart upload error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
