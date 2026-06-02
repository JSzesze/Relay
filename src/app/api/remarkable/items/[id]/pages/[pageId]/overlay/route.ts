import { renderRemarkableNotebookPageSvg } from "@/lib/remarkable-sync";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; pageId: string }> },
) {
  try {
    const { id, pageId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const viewportParam = searchParams.get("viewport");
    const viewport =
      viewportParam === "page" || viewportParam === "frame"
        ? viewportParam
        : "content";
    const transparentBackground = searchParams.get("transparent") === "1";
    const { geometry, placement } = await renderRemarkableNotebookPageSvg(id, pageId, {
      viewport,
      transparentBackground,
    });

    return Response.json(
      {
        geometry,
        placement,
      },
      {
        headers: {
          "cache-control": "private, max-age=300, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to render notebook overlay.",
      },
      { status: 500 },
    );
  }
}
