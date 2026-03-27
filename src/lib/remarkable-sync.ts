import "server-only";

import { readState, saveConnection } from "@/lib/state";
import { getUploadHost, refreshUserToken } from "@/lib/remarkable-client";
import { writeRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import type {
  RemarkableConnection,
  RemarkableDocumentSkeleton,
  RemarkableFolderSkeleton,
  RemarkablePageTag,
  RemarkableSkeletonStore,
  RemarkableTag,
} from "@/lib/types";

interface RootIndexResponse {
  hash: string;
  generation: number;
  schemaVersion: number;
}

interface IndexEntry {
  hash: string;
  documentId: string;
  subfiles: number;
  size: number;
}

interface MetadataRecord {
  deleted?: boolean;
  lastModified?: string;
  lastOpened?: string;
  parent?: string;
  pinned?: boolean;
  type?: string;
  visibleName?: string;
}

interface ContentTagRecord {
  name?: string;
  timestamp?: number;
  pageId?: string;
}

interface ContentRecord {
  documentMetadata?: {
    authors?: string[];
    title?: string;
  };
  fileType?: string;
  originalPageCount?: number;
  pageCount?: number;
  pageTags?: ContentTagRecord[];
  tags?: ContentTagRecord[];
}

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

function isUserTokenFresh(connection: RemarkableConnection) {
  const payload = parseJwtPayload(connection.userToken);
  const exp = payload?.exp;
  if (typeof exp !== "number") return false;
  return exp - Math.floor(Date.now() / 1000) > 60;
}

async function ensureFreshConnection() {
  const state = await readState();
  const connection = state.connection;
  if (!connection) {
    throw new Error("Connect a reMarkable account first.");
  }

  if (isUserTokenFresh(connection)) {
    return connection;
  }

  const userToken = await refreshUserToken(connection.deviceToken);
  const updatedConnection: RemarkableConnection = {
    ...connection,
    userToken,
    userTokenUpdatedAt: new Date().toISOString(),
    tectonicHost: getUploadHost(userToken),
  };
  await saveConnection(updatedConnection);
  return updatedConnection;
}

async function fetchSyncText(connection: RemarkableConnection, path: string) {
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

function parseIndex(text: string) {
  const lines = text.trim().split("\n");
  const schema = lines[0] ?? "";
  const startIndex = schema === "4" ? 2 : 1;

  return lines.slice(startIndex).filter(Boolean).map((line) => {
    const [hash, , documentId, subfiles, size] = line.split(":");
    return {
      hash,
      documentId,
      subfiles: Number(subfiles),
      size: Number(size),
    } satisfies IndexEntry;
  });
}

function toTag(tag: ContentTagRecord): RemarkableTag | null {
  if (!tag.name) {
    return null;
  }
  return {
    name: tag.name,
    timestamp: tag.timestamp,
  };
}

function toPageTag(tag: ContentTagRecord): RemarkablePageTag | null {
  if (!tag.name || !tag.pageId) {
    return null;
  }
  return {
    name: tag.name,
    timestamp: tag.timestamp,
    pageId: tag.pageId,
  };
}

async function fetchBundleRecord<T>(
  connection: RemarkableConnection,
  hash: string,
): Promise<T | null> {
  const raw = await fetchSyncText(connection, `/sync/v3/files/${hash}`);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

async function fetchSkeletonEntry(
  connection: RemarkableConnection,
  entry: IndexEntry,
) {
  const docSchema = await fetchSyncText(
    connection,
    `/sync/v3/files/${entry.hash}`,
  );
  const subEntries = parseIndex(docSchema);

  const metadataEntry = subEntries.find((subEntry) =>
    subEntry.documentId.endsWith(".metadata"),
  );
  const contentEntry = subEntries.find((subEntry) =>
    subEntry.documentId.endsWith(".content"),
  );

  const metadata =
    metadataEntry &&
    (await fetchBundleRecord<MetadataRecord>(connection, metadataEntry.hash));
  const content =
    contentEntry &&
    (await fetchBundleRecord<ContentRecord>(connection, contentEntry.hash));

  if (!metadata || metadata.deleted) {
    return null;
  }

  const parentId = metadata.parent || null;
  const name = metadata.visibleName || entry.documentId;
  const pinned = metadata.pinned === true;
  const lastModified = metadata.lastModified;
  const lastOpened =
    metadata.lastOpened && metadata.lastOpened !== "0"
      ? metadata.lastOpened
      : undefined;

  if (metadata.type === "CollectionType") {
    return {
      kind: "folder" as const,
      id: entry.documentId,
      name,
      parentId,
      pinned,
      lastModified,
      lastOpened,
    } satisfies RemarkableFolderSkeleton;
  }

  return {
    kind: "document" as const,
    id: entry.documentId,
    name,
    parentId,
    pinned,
    fileType: content?.fileType,
    title: content?.documentMetadata?.title,
    authors: content?.documentMetadata?.authors,
    pageCount: content?.pageCount,
    originalPageCount: content?.originalPageCount,
    tags: (content?.tags ?? [])
      .map(toTag)
      .filter((tag): tag is RemarkableTag => Boolean(tag)),
    pageTags: (content?.pageTags ?? [])
      .map(toPageTag)
      .filter((tag): tag is RemarkablePageTag => Boolean(tag)),
    lastModified,
    lastOpened,
  } satisfies RemarkableDocumentSkeleton;
}

export async function syncRemarkableSkeleton() {
  const connection = await ensureFreshConnection();
  const root = JSON.parse(
    await fetchSyncText(connection, "/sync/v4/root"),
  ) as RootIndexResponse;
  const rootBlob = await fetchSyncText(connection, `/sync/v3/files/${root.hash}`);
  const entries = parseIndex(rootBlob);

  const folders: RemarkableFolderSkeleton[] = [];
  const documents: RemarkableDocumentSkeleton[] = [];

  for (const entry of entries) {
    const skeleton = await fetchSkeletonEntry(connection, entry);
    if (!skeleton) {
      continue;
    }
    if (skeleton.kind === "folder") {
      folders.push(skeleton);
    } else {
      documents.push(skeleton);
    }
  }

  const store: RemarkableSkeletonStore = {
    syncedAt: new Date().toISOString(),
    rootHash: root.hash,
    generation: root.generation,
    folders,
    documents,
  };

  await writeRemarkableSkeleton(store);
  return store;
}
