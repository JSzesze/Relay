import { NextResponse } from "next/server";
import { disconnectDevice } from "@/lib/remarkable-client";
import { clearConnection, readState } from "@/lib/state";

export const runtime = "nodejs";

export async function POST() {
  try {
    const state = await readState();
    if (state.connection) {
      await disconnectDevice(state.connection.deviceToken);
    }
    await clearConnection();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to disconnect.",
      },
      { status: 500 },
    );
  }
}
