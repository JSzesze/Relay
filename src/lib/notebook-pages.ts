import "server-only";

import { prepareContent } from "@/lib/content-pipeline";
import {
  buildImagePages,
  buildNotebookBundle,
  summarizeBundleFiles,
  type NotebookBundle,
} from "@/lib/remarkable-notebook-bundle";
import { renderHtmlPagesToPng } from "@/lib/remarkable-page-png";
import {
  DEFAULT_NOTEBOOK_PAGE_SIZE,
  resolveNotebookPageSize,
  type RemarkablePageSize,
} from "@/lib/remarkable-page-size";
import { ensureFreshConnection } from "@/lib/remarkable-sync/connection";
import {
  fetchJsonRecord,
  getBundleEntries,
  getDocumentEntry,
} from "@/lib/remarkable-sync/records";
import type { ContentRecord, MetadataRecord } from "@/lib/remarkable-sync/types";
import { downloadBundleFiles, syncNotebookBundle } from "@/lib/remarkable-sync/write";
import { readRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import { createDocument, createJob, updateJob } from "@/lib/state";
import type { RemarkableConnection, SourceType } from "@/lib/types";
import { safeTitle } from "@/lib/utils";

export type NotebookWriteMode = "append" | "create";
export type NotebookSourceType = Exclude<SourceType, "pdf" | "url">;

export interface WriteNotebookPagesInput {
  content: string;
  dryRun?: boolean;
  mode: NotebookWriteMode;
  pageSize?: Partial<RemarkablePageSize>;
  parentId?: string | null;
  sourceType: NotebookSourceType;
  target?: {
    id?: string;
    name?: string;
    path?: string;
  };
  title?: string;
}

export interface WriteNotebookPagesResult {
  appendedPageCount: number;
  documentId: string;
  dryRun: boolean;
  files: Array<{ name: string; sha256: string; size: number }>;
  mode: NotebookWriteMode;
  pageIds: string[];
  title: string;
  totalPageCount: number;
  uploadGap?: string;
  uploaded: boolean;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function folderPath(
  folders: Array<{ id: string; name: string; parentId: string | null }>,
  folderId: string | null,
) {
  const parts: string[] = [];
  let current = folderId;

  while (current) {
    const folder = folders.find((entry) => entry.id === current);
    if (!folder) {
      break;
    }
    parts.unshift(folder.name);
    current = folder.parentId;
  }

  return parts.join("/");
}

async function resolveTargetDocument(input: WriteNotebookPagesInput) {
  if (input.mode === "create") {
    return null;
  }

  if (input.target?.id) {
    return { id: input.target.id, name: input.title };
  }

  const skeleton = await readRemarkableSkeleton();
  if (!skeleton) {
    throw new Error(
      "No local library skeleton is available. Sync the library first, or pass a document id.",
    );
  }

  const wantedPath = input.target?.path?.replace(/^\/+|\/+$/g, "");
  const wantedName = input.target?.name ?? input.title;
  const matches = skeleton.documents.filter((document) => {
    if (wantedPath) {
      const path = [folderPath(skeleton.folders, document.parentId), document.name]
        .filter(Boolean)
        .join("/");
      return normalizeName(path) === normalizeName(wantedPath);
    }

    return wantedName
      ? normalizeName(document.name) === normalizeName(wantedName)
      : false;
  });

  if (matches.length === 0) {
    throw new Error(
      `Notebook not found: ${wantedPath ?? wantedName ?? "(missing target)"}.`,
    );
  }

  if (matches.length > 1) {
    throw new Error(
      `Multiple notebooks match "${wantedName}". Pass a path or document id.`,
    );
  }

  return matches[0];
}

async function loadExistingNotebook(
  connection: RemarkableConnection,
  documentId: string,
) {
  const entry = await getDocumentEntry(connection, documentId);
  const bundleEntries = await getBundleEntries(
    connection,
    entry.hash,
    `${documentId}.docSchema`,
  );
  const metadataEntry = bundleEntries.find((item) =>
    item.documentId.endsWith(".metadata"),
  );
  const contentEntry = bundleEntries.find((item) =>
    item.documentId.endsWith(".content"),
  );

  if (!metadataEntry || !contentEntry) {
    throw new Error("Existing notebook is missing .metadata or .content.");
  }

  const metadata = await fetchJsonRecord<MetadataRecord>(
    connection,
    metadataEntry.hash,
    metadataEntry.documentId,
  );
  const content = await fetchJsonRecord<ContentRecord>(
    connection,
    contentEntry.hash,
    contentEntry.documentId,
  );

  if (content.fileType && content.fileType !== "notebook") {
    throw new Error(
      `Refusing to append image pages onto a ${content.fileType} document. Target a notebook.`,
    );
  }

  return {
    content,
    files: await downloadBundleFiles(connection, documentId, bundleEntries),
    metadata,
  };
}

export async function buildNotebookPagesFromContent(input: {
  content: string;
  pageSize?: Partial<RemarkablePageSize>;
  sourceType: NotebookSourceType;
  title?: string;
}) {
  const prepared = await prepareContent({
    content: input.content,
    sourceType: input.sourceType,
    title: input.title,
  });
  const pages = renderHtmlPagesToPng({
    normalizedHtml: prepared.normalizedHtml,
    pageSize: input.pageSize,
    plainText: prepared.plainText,
    title: prepared.title,
  });

  return {
    builtPages: buildImagePages({
      pageSize: input.pageSize,
      pages,
    }),
    prepared,
  };
}

export function inspectNotebookBundle(bundle: NotebookBundle) {
  return {
    documentId: bundle.documentId,
    files: summarizeBundleFiles(bundle.files),
    pageIds: bundle.pageIds,
    totalPageCount: bundle.content.pageCount ?? bundle.pageIds.length,
  };
}

export async function writeNotebookPages(
  input: WriteNotebookPagesInput,
): Promise<WriteNotebookPagesResult> {
  if (input.mode === "append" && !input.target?.id && !input.target?.name && !input.target?.path) {
    throw new Error("Append requires a notebook id, name, or path.");
  }

  const pageSize = resolveNotebookPageSize(input.pageSize);
  const target = await resolveTargetDocument(input);
  const { builtPages, prepared } = await buildNotebookPagesFromContent({
    content: input.content,
    pageSize,
    sourceType: input.sourceType,
    title: input.title ?? target?.name,
  });
  const title = safeTitle(input.title ?? target?.name ?? prepared.title, "Agent notebook");

  let existing:
    | Awaited<ReturnType<typeof loadExistingNotebook>>
    | undefined;
  let connection: RemarkableConnection | undefined;

  if (!input.dryRun || input.mode === "append") {
    try {
      connection = await ensureFreshConnection();
    } catch (error) {
      if (input.mode === "append" && !input.dryRun) {
        throw error;
      }
    }
  }

  if (input.mode === "append" && target && connection) {
    existing = await loadExistingNotebook(connection, target.id);
  }

  const bundle = buildNotebookBundle({
    content: existing?.content,
    documentId: target?.id,
    existingFiles: existing?.files,
    metadata: existing?.metadata,
    pageSize,
    pages: builtPages,
    parentId: input.parentId ?? existing?.metadata.parent,
    title,
  });
  const summary = inspectNotebookBundle(bundle);
  const document = await createDocument({
    plainText: prepared.plainText,
    rawSource: prepared.rawSource,
    sourceType: prepared.sourceType,
    title,
    normalizedHtml: prepared.normalizedHtml,
  });
  const job = await createJob({
    documentId: document.id,
    sourceType: prepared.sourceType,
    title,
  });

  if (input.dryRun || !connection) {
    const uploadGap = input.dryRun
      ? undefined
      : "No Connect session is available, so the notebook bundle was generated locally only.";
    await updateJob(job.id, {
      error: uploadGap,
      status: uploadGap ? "failed" : "uploaded",
      uploadedAt: uploadGap ? undefined : new Date().toISOString(),
    });

    return {
      appendedPageCount: builtPages.length,
      documentId: bundle.documentId,
      dryRun: Boolean(input.dryRun),
      files: summary.files,
      mode: input.mode,
      pageIds: bundle.pageIds,
      title,
      totalPageCount: summary.totalPageCount,
      uploadGap,
      uploaded: false,
    };
  }

  try {
    await updateJob(job.id, { status: "uploading" });
    await syncNotebookBundle({
      connection,
      documentId: bundle.documentId,
      files: bundle.files,
    });
    await updateJob(job.id, {
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
    });

    return {
      appendedPageCount: builtPages.length,
      documentId: bundle.documentId,
      dryRun: false,
      files: summary.files,
      mode: input.mode,
      pageIds: bundle.pageIds,
      title,
      totalPageCount: summary.totalPageCount,
      uploaded: true,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connect notebook sync failed.";
    await updateJob(job.id, {
      error: message,
      status: "failed",
    });

    return {
      appendedPageCount: builtPages.length,
      documentId: bundle.documentId,
      dryRun: false,
      files: summary.files,
      mode: input.mode,
      pageIds: bundle.pageIds,
      title,
      totalPageCount: summary.totalPageCount,
      uploadGap: `Local image-in-.rm generation succeeded, but Connect sync did not: ${message}`,
      uploaded: false,
    };
  }
}

export const NOTEBOOK_PAGE_DEFAULTS = {
  device: "reMarkable Paper Pro",
  pageSize: DEFAULT_NOTEBOOK_PAGE_SIZE,
} as const;
