import { NextRequest, NextResponse } from "next/server";
import { connectMT5 } from "@/lib/puppeteer-trader";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { login, password, server, serverUrl } = body;

    if (!login || !password || !server || !serverUrl) {
      return NextResponse.json({ error: "Missing required fields: login, password, server, serverUrl" }, { status: 400 });
    }

    const result = await connectMT5({ login, password, server, serverUrl });

    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
