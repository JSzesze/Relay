import { composeAnnotatedPdf } from "@/lib/remarkable-sync";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const result = await composeAnnotatedPdf(id);

    return new Response(result.bytes, {
      headers: {
        "cache-control": "no-store",
        "content-disposition": `attachment; filename="${result.fileName}"`,
        "content-type": result.contentType,
      },
    });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to compose annotated PDF.",
      },
      { status: 500 },
    );
  }
}
