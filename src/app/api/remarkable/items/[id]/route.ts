import { NextResponse } from "next/server";
import { fetchRemarkableDocumentDetail } from "@/lib/remarkable-sync";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const detail = await fetchRemarkableDocumentDetail(id);
    return NextResponse.json({ detail });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load document detail.",
      },
      { status: 500 },
    );
  }
}
