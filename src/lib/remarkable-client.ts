import "server-only";

import { crc32cBase64 } from "@/lib/crc32c";

const AUTH_HOST = "https://webapp.cloud.remarkable.com";
const SOURCE_HEADER = "rM-Source";
const META_HEADER = "rM-Meta";
const SOURCE_NAME = "RemarkableSend-Web";

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function getUploadHost(userToken: string) {
  const payload = parseJwtPayload(userToken);
  const tectonic = payload?.tectonic;
  if (typeof tectonic === "string" && tectonic.length > 0) {
    return `https://${tectonic}.tectonic.remarkable.com`;
  }
  return "https://internal.cloud.remarkable.com";
}

function encodeMeta(meta: Record<string, unknown>) {
  return Buffer.from(JSON.stringify(meta), "utf8").toString("base64");
}

async function readTokenText(response: Response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }
  if (!text.startsWith("ey")) {
    throw new Error("Did not receive a valid token");
  }
  return text;
}

export async function registerDevice(code: string) {
  const normalizedCode = code.trim().replace(/\s+/g, "").toLowerCase();

  if (normalizedCode.length !== 8) {
    throw new Error("One-time code must be 8 characters.");
  }

  const deviceID = crypto.randomUUID();
  const response = await fetch(`${AUTH_HOST}/token/json/2/device/new`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: normalizedCode,
      deviceDesc: "browser-chrome",
      deviceID,
    }),
  });

  return readTokenText(response);
}

export async function refreshUserToken(deviceToken: string) {
  const response = await fetch(`${AUTH_HOST}/token/json/2/user/new`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
    },
  });

  return readTokenText(response);
}

export async function disconnectDevice(deviceToken: string) {
  const response = await fetch(`${AUTH_HOST}/token/json/2/device/delete`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${deviceToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    if (text.trim() === "deleted device") {
      return;
    }
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }
}

export async function uploadPdf(params: {
  userToken: string;
  title: string;
  pdfBytes: Uint8Array;
}) {
  const host = getUploadHost(params.userToken);
  const response = await fetch(`${host}/doc/v2/files`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.userToken}`,
      [SOURCE_HEADER]: SOURCE_NAME,
      [META_HEADER]: encodeMeta({
        file_name: params.title,
      }),
      "Content-Type": "application/pdf",
    },
    body: Buffer.from(params.pdfBytes),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || response.statusText || `HTTP ${response.status}`);
  }

  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  return {
    host,
    data,
  };
}

export async function putCloudFile(params: {
  bytes: Uint8Array;
  fileName: string;
  hash: string;
  host?: string;
  userToken: string;
}) {
  const host = params.host ?? getUploadHost(params.userToken);
  const response = await fetch(`${host}/sync/v3/files/${params.hash}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.userToken}`,
      "rm-filename": params.fileName,
      "x-goog-hash": `crc32c=${crc32cBase64(params.bytes)}`,
    },
    body: Buffer.from(params.bytes),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      text || response.statusText || `Failed to upload ${params.fileName}`,
    );
  }

  return {
    fileName: params.fileName,
    hash: params.hash,
    host,
  };
}

export async function putCloudRoot(params: {
  broadcast?: boolean;
  generation: number;
  hash: string;
  host?: string;
  userToken: string;
}) {
  const host = params.host ?? getUploadHost(params.userToken);
  const response = await fetch(`${host}/sync/v3/root`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${params.userToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      broadcast: params.broadcast ?? true,
      generation: params.generation,
      hash: params.hash,
    }),
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(text || response.statusText || "Failed to update sync root.");
  }

  return JSON.parse(text) as { generation: number; hash: string };
}
