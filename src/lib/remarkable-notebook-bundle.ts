import { createHash, randomUUID } from "node:crypto";

import { resolveNotebookPageSize, type RemarkablePageSize } from "@/lib/remarkable-page-size";
import {
  fullPageImagePlacement,
  writeImageRmPage,
} from "@/lib/remarkable-rm-write";
import type { ContentPageRecord, ContentRecord, MetadataRecord } from "@/lib/remarkable-sync/types";

export interface NotebookBundleFile {
  bytes: Buffer;
  name: string;
}

export interface BuiltImagePage {
  fileName: string;
  imageUuid: string;
  pageId: string;
  pngBytes: Buffer;
  rmBytes: Buffer;
}

export interface NotebookBundle {
  content: ContentRecord;
  documentId: string;
  files: NotebookBundleFile[];
  metadata: MetadataRecord;
  pageIds: string[];
}

function sha256Hex(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

function nowMs() {
  return Date.now().toString();
}

function incrementPageIdx(value: string) {
  const chars = value.split("");
  for (let index = chars.length - 1; index >= 0; index -= 1) {
    const code = chars[index]!.charCodeAt(0);
    if (code < 122) {
      chars[index] = String.fromCharCode(code + 1);
      return chars.join("");
    }
    chars[index] = "a";
  }
  return `b${chars.join("")}`;
}

export function nextNotebookPageIdx(existing: ContentPageRecord[] = []) {
  const last = existing
    .map((page) => page.idx?.value)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => left.localeCompare(right))
    .at(-1);

  return last ? incrementPageIdx(last) : "ba";
}

export function buildImagePages(input: {
  pageSize?: Partial<RemarkablePageSize>;
  pages: Array<{ pageId?: string; pngBytes: Buffer }>;
}): BuiltImagePage[] {
  const pageSize = resolveNotebookPageSize(input.pageSize);

  return input.pages.map((page) => {
    const pageId = page.pageId ?? randomUUID();
    const imageUuid = randomUUID();
    const fileName = `${imageUuid}.png`;
    const rmBytes = writeImageRmPage({
      images: [
        {
          ...fullPageImagePlacement(fileName, pageSize),
          uuid: imageUuid,
        },
      ],
      pageSize,
    });

    return {
      fileName,
      imageUuid,
      pageId,
      pngBytes: page.pngBytes,
      rmBytes,
    };
  });
}

function upsertPageRecords(
  existing: ContentPageRecord[],
  pageIds: string[],
  startIdx: string,
) {
  const pages = [...existing];
  let idx = startIdx;

  for (const pageId of pageIds) {
    if (pages.some((page) => page.id === pageId)) {
      continue;
    }

    pages.push({
      id: pageId,
      idx: {
        value: idx,
      },
      template: {
        value: "Blank",
      },
    });
    idx = incrementPageIdx(idx);
  }

  return pages;
}

export function createNotebookMetadata(input: {
  lastModified?: string;
  parentId?: string | null;
  title: string;
}): MetadataRecord {
  const timestamp = input.lastModified ?? nowMs();
  return {
    lastModified: timestamp,
    lastOpened: timestamp,
    parent: input.parentId ?? "",
    pinned: false,
    type: "DocumentType",
    visibleName: input.title,
  };
}

export function buildNotebookContent(input: {
  content?: ContentRecord | null;
  documentId: string;
  lastOpenedPageId?: string;
  pageIds: string[];
  pageSize?: Partial<RemarkablePageSize>;
}): ContentRecord {
  const pageSize = resolveNotebookPageSize(input.pageSize);
  const existingPages = input.content?.cPages?.pages ?? [];
  const pages = upsertPageRecords(
    existingPages,
    input.pageIds,
    nextNotebookPageIdx(existingPages),
  );
  const lastOpened =
    input.lastOpenedPageId ??
    pages.at(-1)?.id ??
    input.content?.cPages?.pages?.at(-1)?.id;

  return {
    ...input.content,
    cPages: {
      ...input.content?.cPages,
      lastOpened: lastOpened
        ? {
            value: lastOpened,
          }
        : input.content?.cPages?.lastOpened,
      original: input.content?.cPages?.original ?? {
        value: -1,
      },
      pages,
    },
    coverPageNumber: input.content?.coverPageNumber ?? -1,
    customZoomCenterX: 0,
    customZoomCenterY: Math.round(pageSize.height / 2),
    customZoomOrientation: "portrait",
    customZoomPageHeight: pageSize.height,
    customZoomPageWidth: pageSize.width,
    customZoomScale: 1,
    dummyDocument: false,
    extraMetadata: input.content?.extraMetadata ?? {
      LastPen: "Fineliner",
      LastTool: "Fineliner",
    },
    fileType: "notebook",
    formatVersion: input.content?.formatVersion ?? 2,
    orientation: "portrait",
    pageCount: pages.filter((page) => !page.deleted?.value).length,
    pageTags: input.content?.pageTags ?? [],
    tags: input.content?.tags ?? [],
    zoomMode: "bestFit",
  };
}

export function buildNotebookBundle(input: {
  content?: ContentRecord | null;
  documentId?: string;
  existingFiles?: NotebookBundleFile[];
  metadata?: MetadataRecord | null;
  pageSize?: Partial<RemarkablePageSize>;
  pages: BuiltImagePage[];
  parentId?: string | null;
  title: string;
}): NotebookBundle {
  const documentId = input.documentId ?? randomUUID();
  const pageIds = input.pages.map((page) => page.pageId);
  const content = buildNotebookContent({
    content: input.content,
    documentId,
    lastOpenedPageId: pageIds.at(-1),
    pageIds,
    pageSize: input.pageSize,
  });
  const metadata = {
    ...createNotebookMetadata({
      parentId: input.parentId ?? input.metadata?.parent,
      title: input.title,
    }),
    ...input.metadata,
    lastModified: nowMs(),
    parent: input.parentId ?? input.metadata?.parent ?? "",
    type: "DocumentType",
    visibleName: input.title,
  } satisfies MetadataRecord;
  const pageCount = content.pageCount ?? pageIds.length;
  const pagedata = `${Array.from({ length: pageCount }, () => "Blank").join("\n")}\n`;
  const keep = new Set([
    `${documentId}.content`,
    `${documentId}.metadata`,
    `${documentId}.pagedata`,
  ]);
  const files = new Map<string, Buffer>();

  for (const file of input.existingFiles ?? []) {
    if (!keep.has(file.name) && !file.name.startsWith(`${documentId}/`)) {
      continue;
    }
    files.set(file.name, file.bytes);
  }

  files.set(`${documentId}.content`, Buffer.from(JSON.stringify(content), "utf8"));
  files.set(`${documentId}.metadata`, Buffer.from(JSON.stringify(metadata), "utf8"));
  files.set(`${documentId}.pagedata`, Buffer.from(pagedata, "utf8"));

  for (const page of input.pages) {
    files.set(`${documentId}/${page.pageId}.rm`, page.rmBytes);
    files.set(
      `${documentId}/${page.pageId}-metadata.json`,
      Buffer.from(JSON.stringify({ layers: [{ name: "Layer 1" }] }), "utf8"),
    );
    files.set(`${documentId}/${page.pageId}/${page.fileName}`, page.pngBytes);
  }

  return {
    content,
    documentId,
    files: [...files.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, bytes]) => ({ bytes, name })),
    metadata,
    pageIds,
  };
}

export function summarizeBundleFiles(files: NotebookBundleFile[]) {
  return files.map((file) => ({
    name: file.name,
    sha256: sha256Hex(file.bytes),
    size: file.bytes.length,
  }));
}
