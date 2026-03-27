import { renderRemarkableNotebookPageSvg } from "@/lib/remarkable-sync";

export const runtime = "nodejs";

function errorSvg(message: string) {
  const safeMessage = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1404 720" width="1404" height="720">
  <rect width="100%" height="100%" fill="#f7f4ee" />
  <rect x="48" y="48" width="1308" height="624" rx="24" fill="#ffffff" stroke="#ddd4c7" />
  <text x="96" y="140" font-family="ui-sans-serif, system-ui, sans-serif" font-size="32" fill="#171717">Notebook preview unavailable</text>
  <text x="96" y="196" font-family="ui-sans-serif, system-ui, sans-serif" font-size="22" fill="#525252">${safeMessage}</text>
  <text x="96" y="244" font-family="ui-sans-serif, system-ui, sans-serif" font-size="22" fill="#525252">The first-party parser now handles v6 strokes, text, and highlights, but some newer scene features still fall back here.</text>
</svg>`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; pageId: string }> },
) {
  try {
    const { id, pageId } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    const viewport =
      searchParams.get("viewport") === "page" ? "page" : "content";
    const { svg } = await renderRemarkableNotebookPageSvg(id, pageId, {
      viewport,
    });

    return new Response(svg, {
      headers: {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      errorSvg(
        error instanceof Error
          ? error.message
          : "Unable to render notebook page.",
      ),
      {
        status: 200,
        headers: {
          "content-type": "image/svg+xml; charset=utf-8",
          "cache-control": "no-store",
        },
      },
    );
  }
}
