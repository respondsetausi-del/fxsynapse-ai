import { NextResponse } from "next/server";
import { EMAIL_TEMPLATES } from "@/lib/email-templates";

export async function GET() {
  return NextResponse.json({
    templates: EMAIL_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      category: t.category,
      subject: t.subject,
    })),
  });
}
