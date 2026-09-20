import { NextResponse } from "next/server";
import { filterEventsSince } from "@/lib/remarkable-watch";
import {
  getWatchRuntimeStatus,
  runWatchTick,
} from "@/lib/remarkable-watch-runtime";
import { readLibraryWatchState } from "@/lib/remarkable-watch-store";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const since = searchParams.get("since");
  const state = await readLibraryWatchState();
  const runtime = getWatchRuntimeStatus();

  return NextResponse.json({
    watcher: {
      ...runtime,
      lastFingerprint: state.lastFingerprint,
      lastPolledAt: state.lastPolledAt,
      lastChangedAt: state.lastChangedAt,
      lastError: state.lastError,
    },
    events: filterEventsSince(state.events, since),
  });
}

export async function POST() {
  try {
    const result = await runWatchTick();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to poll the Connect library watcher.",
      },
      { status: 500 },
    );
  }
}
