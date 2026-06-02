import { getUploadHost, refreshUserToken } from "@/lib/remarkable-client";
import { readState, saveConnection } from "@/lib/state";
import type { RemarkableConnection } from "@/lib/types";

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

function isUserTokenFresh(connection: RemarkableConnection) {
  const payload = parseJwtPayload(connection.userToken);
  const exp = payload?.exp;
  return typeof exp === "number" && exp - Math.floor(Date.now() / 1000) > 60;
}

export async function ensureFreshConnection() {
  const state = await readState();

  if (!state.connection) {
    throw new Error("Connect a reMarkable account first.");
  }

  if (isUserTokenFresh(state.connection)) {
    return state.connection;
  }

  const userToken = await refreshUserToken(state.connection.deviceToken);
  const updatedConnection: RemarkableConnection = {
    ...state.connection,
    userToken,
    userTokenUpdatedAt: new Date().toISOString(),
    tectonicHost: getUploadHost(userToken),
  };
  await saveConnection(updatedConnection);
  return updatedConnection;
}

export async function fetchSyncText(
  connection: RemarkableConnection,
  path: string,
) {
  const host = connection.tectonicHost ?? getUploadHost(connection.userToken);
  const response = await fetch(`${host}${path}`, {
    headers: {
      Authorization: `Bearer ${connection.userToken}`,
    },
    cache: "no-store",
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }

  return text;
}

export async function fetchSyncResponse(
  connection: RemarkableConnection,
  path: string,
) {
  const host = connection.tectonicHost ?? getUploadHost(connection.userToken);
  const response = await fetch(`${host}${path}`, {
    headers: {
      Authorization: `Bearer ${connection.userToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }

  return response;
}
