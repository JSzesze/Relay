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

export interface ContentPageRecord {
  deleted?: {
    value?: number;
  };
  id?: string;
  idx?: {
    value?: string;
  };
  modifed?: string;
  redir?: {
    value?: number;
  };
  verticalScroll?: {
    value?: number;
  };
}

export function parseIndex(text: string) {
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
