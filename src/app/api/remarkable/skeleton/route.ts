import { NextResponse } from "next/server";
import { readRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import { syncRemarkableSkeleton } from "@/lib/remarkable-sync";

export const runtime = "nodejs";

export async function GET() {
  const store = await readRemarkableSkeleton();
  return NextResponse.json({
    store,
  });
}

export async function POST() {
  try {
    const store = await syncRemarkableSkeleton();
    return NextResponse.json({
      ok: true,
      syncedAt: store.syncedAt,
      rootHash: store.rootHash,
      generation: store.generation,
      folders: store.folders.length,
      documents: store.documents.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to sync skeleton.",
      },
      { status: 500 },
    );
  }
}
