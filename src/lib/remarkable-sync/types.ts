import type {
  RemarkableConnection,
  RemarkableDownloadAsset,
  RemarkableDocumentSkeleton,
  RemarkableFolderSkeleton,
  RemarkableNotebookPage,
  RemarkablePageTag,
  RemarkableTag,
} from "@/lib/types";

export interface RootIndexResponse {
  hash: string;
  generation: number;
}

export interface IndexEntry {
  hash: string;
  documentId: string;
  size?: number;
  subfiles?: number;
  type?: number;
}

export interface MetadataRecord {
  deleted?: boolean;
  lastModified?: string;
  lastOpened?: string;
  parent?: string;
  pinned?: boolean;
  type?: string;
  visibleName?: string;
}

export interface ContentTagRecord {
  name?: string;
  timestamp?: number;
  pageId?: string;
}

export interface ContentRecord {
  cPages?: {
    lastOpened?: {
      timestamp?: string;
      value?: string;
    };
    original?: {
      timestamp?: string;
      value?: number;
    };
    pages?: ContentPageRecord[];
  };
  coverPageNumber?: number;
  customZoomCenterX?: number;
  customZoomCenterY?: number;
  customZoomOrientation?: string;
  customZoomPageHeight?: number;
  customZoomPageWidth?: number;
  customZoomScale?: number;
  documentMetadata?: {
    authors?: string[];
    title?: string;
  };
  dummyDocument?: boolean;
  extraMetadata?: Record<string, string>;
  fileType?: string;
  formatVersion?: number;
  orientation?: string;
  originalPageCount?: number;
  pageCount?: number;
  pageTags?: ContentTagRecord[];
  tags?: ContentTagRecord[];
  zoomMode?: string;
}

export interface ContentPageRecord {
  deleted?: {
    value?: number;
  };
  id?: string;
  idx?: {
    timestamp?: string;
    value?: string;
  };
  modifed?: string;
  redir?: {
    value?: number;
  };
  template?: {
    timestamp?: string;
    value?: string;
  };
  verticalScroll?: {
    value?: number;
  };
}

export interface IndexCollection {
  entries: IndexEntry[];
  id?: string;
  schemaVersion: 3 | 4;
  size?: number;
}

export function parseIndexCollection(text: string): IndexCollection {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const schemaVersion = lines[0] === "4" ? 4 : 3;
  const startIndex = schemaVersion === 4 ? 2 : 1;
  const info = schemaVersion === 4 ? lines[1]?.split(":") : undefined;

  return {
    entries: lines.slice(startIndex).map((line) => {
      const [hash, type, documentId, subfiles, size] = line.split(":");
      return {
        documentId,
        hash,
        size: size ? Number.parseInt(size, 10) : undefined,
        subfiles: subfiles ? Number.parseInt(subfiles, 10) : undefined,
        type: type ? Number.parseInt(type, 10) : undefined,
      } satisfies IndexEntry;
    }),
    id: info?.[1],
    schemaVersion,
    size: info?.[3] ? Number.parseInt(info[3], 10) : undefined,
  };
}

export function parseIndex(text: string) {
  return parseIndexCollection(text).entries;
}

export function serializeIndexCollection(input: {
  entries: IndexEntry[];
  id: string;
  schemaVersion?: 3 | 4;
}) {
  const schemaVersion = input.schemaVersion ?? 4;
  const sorted = [...input.entries].sort((left, right) =>
    left.documentId.localeCompare(right.documentId),
  );
  const size = sorted.reduce((total, entry) => total + (entry.size ?? 0), 0);
  const lines = [`${schemaVersion}`];

  if (schemaVersion === 4) {
    const name = input.id === "root" ? "." : input.id;
    lines.push(`0:${name}:${sorted.length}:${size}`);
  }

  for (const entry of sorted) {
    const type = schemaVersion === 4 ? 0 : (entry.type ?? 0);
    lines.push(
      `${entry.hash}:${type}:${entry.documentId}:${entry.subfiles ?? 0}:${entry.size ?? 0}`,
    );
  }

  return {
    bytes: Buffer.from(`${lines.join("\n")}\n`, "utf8"),
    schemaVersion,
    size,
    sorted,
  };
}

export function getDocumentBundleAsset(
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

export function getNotebookPageEntry(
  bundleEntries: IndexEntry[],
  documentId: string,
  pageId: string,
) {
  return bundleEntries.find(
    (bundleEntry) => bundleEntry.documentId === `${documentId}/${pageId}.rm`,
  );
}

export function toTag(tag: ContentTagRecord): RemarkableTag | null {
  if (!tag.name) {
    return null;
  }

  return {
    name: tag.name,
    timestamp: tag.timestamp,
  };
}

export function toPageTag(tag: ContentTagRecord): RemarkablePageTag | null {
  if (!tag.name || !tag.pageId) {
    return null;
  }

  return {
    name: tag.name,
    timestamp: tag.timestamp,
    pageId: tag.pageId,
  };
}

export function toNotebookPage(
  page: ContentPageRecord,
  pageIndex: number,
): RemarkableNotebookPage | null {
  if (!page?.id || Boolean(page.deleted?.value)) {
    return null;
  }

  return {
    id: page.id,
    pageIndex,
    lastModified: page.modifed,
    sourcePageIndex:
      typeof page.redir?.value === "number" ? page.redir.value : null,
    verticalScroll: page.verticalScroll?.value,
  };
}

export function getNotebookPages(content: ContentRecord | null) {
  const orderedPages = (content?.cPages?.pages ?? [])
    .map((page, originalIndex) => ({
      originalIndex,
      page,
      sortKey:
        typeof page.idx?.value === "string" && page.idx.value.length > 0
          ? page.idx.value
          : `~${originalIndex.toString().padStart(6, "0")}`,
    }))
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey))
    .map(({ page }) => page)
    .filter((page) => !page.deleted?.value);

  return orderedPages
    .map((page, pageIndex) => toNotebookPage(page, pageIndex))
    .filter((page): page is RemarkableNotebookPage => Boolean(page));
}

export async function mapLimit<T, R>(
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

export function toSkeletonEntry(
  entry: IndexEntry,
  metadata: MetadataRecord,
): RemarkableFolderSkeleton | RemarkableDocumentSkeleton {
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
      id: entry.documentId,
      kind: "folder",
      name,
      parentId,
      pinned,
      lastModified,
      lastOpened,
    };
  }

  return {
    id: entry.documentId,
    kind: "document",
    name,
    parentId,
    pinned,
    lastModified,
    lastOpened,
  };
}

export type { RemarkableConnection };
