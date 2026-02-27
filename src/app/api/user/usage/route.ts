import { NextResponse } from "next/server";
import { getAuthUserId, getUserUsage } from "@/lib/usage";

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const usage = await getUserUsage(userId);
  return NextResponse.json(usage);
}
