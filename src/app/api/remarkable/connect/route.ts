import { NextResponse } from "next/server";
import {
  getUploadHost,
  refreshUserToken,
  registerDevice,
} from "@/lib/remarkable-client";
import { saveConnection } from "@/lib/state";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim();
    if (!code) {
      return NextResponse.json({ error: "Missing one-time code." }, { status: 400 });
    }

    const deviceToken = await registerDevice(code);
    const userToken = await refreshUserToken(deviceToken);
    const tectonicHost = getUploadHost(userToken);

    await saveConnection({
      connectedAt: new Date().toISOString(),
      deviceToken,
      userToken,
      userTokenUpdatedAt: new Date().toISOString(),
      tectonicHost,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to connect." },
      { status: 500 },
    );
  }
}
