import { NextResponse } from "next/server";
import { sendContent } from "@/lib/send";
import type { SourceType } from "@/lib/types";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const sourceType = formData.get("sourceType");
    const title = formData.get("title");

    if (typeof sourceType !== "string") {
      return NextResponse.json({ error: "Missing source type." }, { status: 400 });
    }

    if (sourceType === "pdf") {
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing PDF file." }, { status: 400 });
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      await sendContent({
        sourceType: "pdf",
        title: typeof title === "string" ? title : file.name,
        fileName: file.name,
        pdfBytes: bytes,
      });
    } else {
      const content = formData.get("content");
      if (typeof content !== "string" || content.trim().length === 0) {
        return NextResponse.json({ error: "Missing content." }, { status: 400 });
      }
      await sendContent({
        sourceType: sourceType as Exclude<SourceType, "pdf">,
        title: typeof title === "string" ? title : "",
        content,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send." },
      { status: 500 },
    );
  }
}
