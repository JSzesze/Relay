import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";

import { PDFDocument } from "pdf-lib";
import {
  getRemarkableRmSvgGeometry,
  getRemarkableRmOverlayPlacement,
  parseRemarkableRmPage,
  pointsToScreenUnits,
  renderRemarkableRmPageToSvg,
  screenUnitsToPoints,
} from "@/lib/remarkable-rm";
import {
  ensureFreshConnection,
  fetchSyncResponse,
  fetchSyncText,
} from "@/lib/remarkable-sync/connection";
import {
  downloadRemarkableNotebookPage as downloadNotebookPageRecord,
  fetchJsonRecord,
  fetchMetadataForEntry,
  getBundleEntries,
  getDocumentEntry,
  getPdfBackedPageSize,
} from "@/lib/remarkable-sync/records";
import {
  type ContentRecord,
  type MetadataRecord,
  type RootIndexResponse,
  getDocumentBundleAsset,
  getNotebookPageEntry,
  getNotebookPages,
  mapLimit,
  parseIndex,
  toPageTag,
  toSkeletonEntry,
  toTag,
} from "@/lib/remarkable-sync/types";
import { writeRemarkableSkeleton } from "@/lib/remarkable-skeleton-store";
import type {
  RemarkableDocumentDetail,
  RemarkablePageTag,
  RemarkableSkeletonStore,
  RemarkableTag,
} from "@/lib/types";
import { safeTitle } from "@/lib/utils";

const execFileAsync = promisify(execFile);
const PYTHON_TOOLCHAIN_BIN =
  process.env.REMARKABLE_PDF_PYTHON_BIN ?? "/tmp/remarkablesend-python/bin";

function sanitizeFileStem(value: string) {
  return safeTitle(value)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\.+$/g, "")
    .trim();
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
  const skeletonEntries = resolvedEntries
    .filter(
      (
        resolved,
      ): resolved is NonNullable<Awaited<ReturnType<typeof fetchMetadataForEntry>>> =>
        resolved !== null,
    )
    .map((resolved) => toSkeletonEntry(resolved.entry, resolved.metadata));

  const store: RemarkableSkeletonStore = {
    syncedAt: new Date().toISOString(),
    rootHash: root.hash,
    generation: root.generation,
    folders: skeletonEntries
      .filter((entry) => entry.kind === "folder")
      .sort((a, b) => a.name.localeCompare(b.name)),
    documents: skeletonEntries
      .filter((entry) => entry.kind === "document")
      .sort((a, b) => a.name.localeCompare(b.name)),
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
    notebookPages: getNotebookPages(content),
    downloadAsset: getDocumentBundleAsset(bundleEntries, documentId),
    rawMetadata: metadata as Record<string, unknown>,
    rawContent: (content as Record<string, unknown> | null) ?? null,
  };

  return detail;
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

export async function composeAnnotatedPdf(documentId: string) {
  const detail = await fetchRemarkableDocumentDetail(documentId);

  if (detail.downloadAsset?.contentType !== "application/pdf") {
    throw new Error("Annotated PDF export is only available for PDF documents.");
  }

  const connection = await ensureFreshConnection();
  const source = await downloadRemarkableDocument(documentId);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "remarkable-compose-"));
  const sourcePdfPath = path.join(tempDir, "source.pdf");
  const manifestPath = path.join(tempDir, "manifest.json");
  const outputPath = path.join(tempDir, "annotated.pdf");

  try {
    await writeFile(sourcePdfPath, source.bytes);
    const sourcePdf = await PDFDocument.load(source.bytes);

    const pages = [];

    for (const page of detail.notebookPages) {
      let svgPath: string | null = null;

      try {
        const rmBytes = await downloadNotebookPageRecord(
          connection,
          documentId,
          page.id,
        );
        const parsedPage = parseRemarkableRmPage(rmBytes);
        const sourcePageIndex = page.sourcePageIndex ?? null;
        let pageSize: { width: number; height: number } | undefined;

        if (
          sourcePageIndex != null &&
          sourcePageIndex >= 0 &&
          sourcePageIndex < sourcePdf.getPageCount()
        ) {
          const sourcePdfPage = sourcePdf.getPage(sourcePageIndex);
          const cropBox = sourcePdfPage.getCropBox();
          const rotation = ((sourcePdfPage.getRotation().angle % 360) + 360) % 360;
          let width = cropBox.width;
          let height = cropBox.height;

          if (rotation === 90 || rotation === 270) {
            [width, height] = [height, width];
          }

          pageSize = {
            width: Math.round(pointsToScreenUnits(width)),
            height: Math.round(pointsToScreenUnits(height)),
          };
        }

        svgPath = path.join(tempDir, `${page.pageIndex}-${page.id}.svg`);
        const svg = renderRemarkableRmPageToSvg(parsedPage, {
          pageSize,
          transparentBackground: true,
          unitScale: screenUnitsToPoints(1),
          viewport: "frame",
        });
        await writeFile(svgPath, svg, "utf8");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (!message.includes("Notebook page not found in document bundle.")) {
          throw error;
        }

        svgPath = null;
      }

      pages.push({
        pageIndex: page.pageIndex,
        svgPath,
        sourcePageIndex: page.sourcePageIndex ?? null,
      });
    }

    await writeFile(
      manifestPath,
      JSON.stringify(
        {
          pages,
          sourcePdf: sourcePdfPath,
        },
        null,
        2,
      ),
      "utf8",
    );

    await execFileAsync(
      "python3",
      [
        path.join(process.cwd(), "scripts", "compose_annotated_pdf.py"),
        manifestPath,
        outputPath,
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PATH: `${PYTHON_TOOLCHAIN_BIN}:${process.env.PATH ?? ""}`,
        },
      },
    );

    const bytes = await readFile(outputPath);
    const fileName = source.fileName.replace(/\.pdf$/i, " annotated.pdf");

    return {
      bytes,
      contentType: "application/pdf",
      fileName,
    };
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

export async function renderRemarkableNotebookPageSvg(
  documentId: string,
  pageId: string,
  options?: {
    pageSize?: {
      height: number;
      width: number;
    };
    viewport?: "content" | "page" | "frame";
    transparentBackground?: boolean;
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
  const pageSize =
    options?.pageSize ??
    (await getPdfBackedPageSize(connection, bundleEntries, documentId, pageId));
  const renderOptions = {
    ...options,
    pageSize: pageSize ?? options?.pageSize,
  };
  const svg = renderRemarkableRmPageToSvg(page, renderOptions);
  const geometry = getRemarkableRmSvgGeometry(page, renderOptions);
  const placement = getRemarkableRmOverlayPlacement(geometry);

  return {
    geometry,
    page,
    placement,
    svg,
  };
}
