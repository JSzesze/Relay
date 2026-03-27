import { downloadRemarkableDocument } from "@/lib/remarkable-sync";

export const runtime = "nodejs";

function buildContentDisposition(fileName: string, disposition: "attachment" | "inline") {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, "_");
  const encoded = encodeURIComponent(fileName);

  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const file = await downloadRemarkableDocument(id);
    const { searchParams } = new URL(request.url);
    const disposition = searchParams.get("inline") === "1" ? "inline" : "attachment";

    return new Response(file.bytes, {
      headers: {
        "content-type": file.contentType,
        "content-disposition": buildContentDisposition(file.fileName, disposition),
        "content-length": String(file.bytes.length),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to download document.",
      },
      { status: 500 },
    );
  }
}
