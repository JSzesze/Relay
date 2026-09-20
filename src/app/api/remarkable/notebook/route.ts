import { NextResponse } from "next/server";

import { writeNotebookPages } from "@/lib/notebook-pages";
import type { NotebookSourceType, NotebookWriteMode } from "@/lib/notebook-pages";

export const runtime = "nodejs";

const SOURCE_TYPES = new Set<NotebookSourceType>(["markdown", "html", "text"]);

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      content?: string;
      dryRun?: boolean;
      mode?: NotebookWriteMode;
      pageSize?: { height?: number; width?: number };
      parentId?: string | null;
      sourceType?: NotebookSourceType;
      target?: { id?: string; name?: string; path?: string };
      title?: string;
    };

    if (body.mode !== "append" && body.mode !== "create") {
      return NextResponse.json({ error: "mode must be append or create." }, { status: 400 });
    }

    if (!body.sourceType || !SOURCE_TYPES.has(body.sourceType)) {
      return NextResponse.json(
        { error: "sourceType must be markdown, html, or text." },
        { status: 400 },
      );
    }

    if (typeof body.content !== "string" || body.content.trim().length === 0) {
      return NextResponse.json({ error: "Missing content." }, { status: 400 });
    }

    const result = await writeNotebookPages({
      content: body.content,
      dryRun: body.dryRun,
      mode: body.mode,
      pageSize: body.pageSize,
      parentId: body.parentId,
      sourceType: body.sourceType,
      target: body.target,
      title: body.title,
    });

    return NextResponse.json({ ok: true, result });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to write notebook pages.",
      },
      { status: 500 },
    );
  }
}
