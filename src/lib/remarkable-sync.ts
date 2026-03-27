import "server-only";

import { getUploadHost, refreshUserToken } from "@/lib/remarkable-client";
import {
  parseRemarkableRmPage,
  renderRemarkableRmPageToSvg,
} from "@/lib/remarkable-rm";
import { writeRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import { readState, saveConnection } from "@/lib/state";
import type {
  RemarkableConnection,
  RemarkableDocumentDetail,
  RemarkableDownloadAsset,
  RemarkableDocumentSkeleton,
  RemarkableFolderSkeleton,
  RemarkableNotebookPage,
  RemarkablePageTag,
  RemarkableSkeletonStore,
  RemarkableTag,
} from "@/lib/types";
import { safeTitle } from "@/lib/utils";

interface RootIndexResponse {
  hash: string;
  generation: number;
}

interface IndexEntry {
  hash: string;
  documentId: string;
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
  cPages?: {
    pages?: ContentPageRecord[];
  };
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

interface ContentPageRecord {
  id?: string;
  modifed?: string;
  verticalScroll?: {
    value?: number;
  };
}

function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
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

async function ensureFreshConnection() {
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

async function fetchSyncResponse(connection: RemarkableConnection, path: string) {
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

function parseIndex(text: string) {
  const lines = text.trim().split("\n");
  const startIndex = lines[0] === "4" ? 2 : 1;

  return lines.slice(startIndex).filter(Boolean).map((line) => {
    const [hash, , documentId] = line.split(":");
    return {
      hash,
      documentId,
    } satisfies IndexEntry;
  });
}

function getDocumentBundleAsset(
  bundleEntries: IndexEntry[],
  documentId: string,
): RemarkableDownloadAsset | null {
  const candidates = [
    { extension: "pdf", contentType: "application/pdf" },
    { extension: "epub", contentType: "application/epub+zip" },
  ];

  for (const candidate of candidates) {
    const entry = bundleEntries.find(
      (bundleEntry) =>
        bundleEntry.documentId === `${documentId}.${candidate.extension}`,
    );

    if (!entry) {
      continue;
    }

    return {
      documentId: entry.documentId,
      fileName: entry.documentId,
      contentType: candidate.contentType,
      extension: candidate.extension,
    };
  }

  return null;
}

function getNotebookPageEntry(
  bundleEntries: IndexEntry[],
  documentId: string,
  pageId: string,
) {
  return bundleEntries.find(
    (bundleEntry) => bundleEntry.documentId === `${documentId}/${pageId}.rm`,
  );
}

async function getDocumentEntry(
  connection: RemarkableConnection,
  documentId: string,
) {
  const root = JSON.parse(
    await fetchSyncText(connection, "/sync/v4/root"),
  ) as RootIndexResponse;
  const rootBlob = await fetchSyncText(connection, `/sync/v3/files/${root.hash}`);
  const entry = parseIndex(rootBlob).find((item) => item.documentId === documentId);

  if (!entry) {
    throw new Error("Document not found in reMarkable cloud.");
  }

  return entry;
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

function toNotebookPage(page: ContentPageRecord): RemarkableNotebookPage | null {
  if (!page?.id) {
    return null;
  }

  return {
    id: page.id,
    lastModified: page.modifed,
    verticalScroll: page.verticalScroll?.value,
  };
}

async function fetchJsonRecord<T>(
  connection: RemarkableConnection,
  hash: string,
) {
  const raw = await fetchSyncText(connection, `/sync/v3/files/${hash}`);
  return JSON.parse(raw) as T;
}

async function getBundleEntries(
  connection: RemarkableConnection,
  entryHash: string,
) {
  return parseIndex(await fetchSyncText(connection, `/sync/v3/files/${entryHash}`));
}

async function fetchMetadataForEntry(
  connection: RemarkableConnection,
  entry: IndexEntry,
) {
  const bundleEntries = await getBundleEntries(connection, entry.hash);
  const metadataEntry = bundleEntries.find((bundleEntry) =>
    bundleEntry.documentId.endsWith(".metadata"),
  );

  if (!metadataEntry) {
    return null;
  }

  const metadata = await fetchJsonRecord<MetadataRecord>(
    connection,
    metadataEntry.hash,
  );

  if (metadata.deleted) {
    return null;
  }

  return {
    entry,
    metadata,
  };
}

async function mapLimit<T, R>(
  values: T[],
  limit: number,
  iteratee: (value: T) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let index = 0;

  async function worker() {
    while (index < values.length) {
      const current = index++;
      results[current] = await iteratee(values[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );

  return results;
}

export async function syncRemarkableSkeleton() {
  const connection = await ensureFreshConnection();
  const root = JSON.parse(
    await fetchSyncText(connection, "/sync/v4/root"),
  ) as RootIndexResponse;
  const rootBlob = await fetchSyncText(connection, `/sync/v3/files/${root.hash}`);
  const entries = parseIndex(rootBlob);

  const resolvedEntries = await mapLimit(entries, 8, async (entry) =>
    fetchMetadataForEntry(connection, entry),
  );

  const folders: RemarkableFolderSkeleton[] = [];
  const documents: RemarkableDocumentSkeleton[] = [];

  for (const resolved of resolvedEntries) {
    if (!resolved) continue;

    const parentId = resolved.metadata.parent || null;
    const name = resolved.metadata.visibleName || resolved.entry.documentId;
    const pinned = resolved.metadata.pinned === true;
    const lastModified = resolved.metadata.lastModified;
    const lastOpened =
      resolved.metadata.lastOpened && resolved.metadata.lastOpened !== "0"
        ? resolved.metadata.lastOpened
        : undefined;

    if (resolved.metadata.type === "CollectionType") {
      folders.push({
        id: resolved.entry.documentId,
        kind: "folder",
        name,
        parentId,
        pinned,
        lastModified,
        lastOpened,
      });
      continue;
    }

    documents.push({
      id: resolved.entry.documentId,
      kind: "document",
      name,
      parentId,
      pinned,
      lastModified,
      lastOpened,
    });
  }

  const store: RemarkableSkeletonStore = {
    syncedAt: new Date().toISOString(),
    rootHash: root.hash,
    generation: root.generation,
    folders: folders.sort((a, b) => a.name.localeCompare(b.name)),
    documents: documents.sort((a, b) => a.name.localeCompare(b.name)),
  };

  await writeRemarkableSkeleton(store);
  return store;
}

export async function fetchRemarkableDocumentDetail(documentId: string) {
  const connection = await ensureFreshConnection();
  const entry = await getDocumentEntry(connection, documentId);
  const bundleEntries = await getBundleEntries(connection, entry.hash);
  const metadataEntry = bundleEntries.find((bundleEntry) =>
    bundleEntry.documentId.endsWith(".metadata"),
  );
  const contentEntry = bundleEntries.find((bundleEntry) =>
    bundleEntry.documentId.endsWith(".content"),
  );

  if (!metadataEntry) {
    throw new Error("Document metadata is missing.");
  }

  const metadata = await fetchJsonRecord<MetadataRecord>(
    connection,
    metadataEntry.hash,
  );
  const content = contentEntry
    ? await fetchJsonRecord<ContentRecord>(connection, contentEntry.hash)
    : null;

  const detail: RemarkableDocumentDetail = {
    id: documentId,
    name: metadata.visibleName || documentId,
    parentId: metadata.parent || null,
    pinned: metadata.pinned === true,
    lastModified: metadata.lastModified,
    lastOpened:
      metadata.lastOpened && metadata.lastOpened !== "0"
        ? metadata.lastOpened
        : undefined,
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
    notebookPages: (content?.cPages?.pages ?? [])
      .map(toNotebookPage)
      .filter((page): page is RemarkableNotebookPage => Boolean(page)),
    downloadAsset: getDocumentBundleAsset(bundleEntries, documentId),
    rawMetadata: metadata as Record<string, unknown>,
    rawContent: (content as Record<string, unknown> | null) ?? null,
  };

  return detail;
}

function sanitizeFileStem(value: string) {
  return safeTitle(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.+$/g, "")
    .trim();
}

export async function downloadRemarkableDocument(documentId: string) {
  const connection = await ensureFreshConnection();
  const entry = await getDocumentEntry(connection, documentId);
  const bundleEntries = await getBundleEntries(connection, entry.hash);
  const metadataEntry = bundleEntries.find((bundleEntry) =>
    bundleEntry.documentId.endsWith(".metadata"),
  );
  const asset = getDocumentBundleAsset(bundleEntries, documentId);

  if (!asset) {
    throw new Error("No downloadable source file is available for this document.");
  }

  if (!metadataEntry) {
    throw new Error("Document metadata is missing.");
  }

  const fileEntry = bundleEntries.find(
    (bundleEntry) => bundleEntry.documentId === asset.documentId,
  );

  if (!fileEntry) {
    throw new Error("Document file bundle entry is missing.");
  }

  const metadata = await fetchJsonRecord<MetadataRecord>(
    connection,
    metadataEntry.hash,
  );
  const response = await fetchSyncResponse(
    connection,
    `/sync/v3/files/${fileEntry.hash}`,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  const fileStem = sanitizeFileStem(metadata.visibleName || documentId);

  return {
    bytes,
    contentType: response.headers.get("content-type") ?? asset.contentType,
    fileName: `${fileStem}.${asset.extension}`,
  };
}

export async function renderRemarkableNotebookPageSvg(
  documentId: string,
  pageId: string,
  options?: {
    viewport?: "content" | "page";
  },
) {
  const connection = await ensureFreshConnection();
  const entry = await getDocumentEntry(connection, documentId);
  const bundleEntries = await getBundleEntries(connection, entry.hash);
  const pageEntry = getNotebookPageEntry(bundleEntries, documentId, pageId);

  if (!pageEntry) {
    throw new Error("Notebook page not found in document bundle.");
  }

  const response = await fetchSyncResponse(
    connection,
    `/sync/v3/files/${pageEntry.hash}`,
  );
  const page = parseRemarkableRmPage(Buffer.from(await response.arrayBuffer()));
  const svg = renderRemarkableRmPageToSvg(page, options);

  return {
    page,
    svg,
  };
}
