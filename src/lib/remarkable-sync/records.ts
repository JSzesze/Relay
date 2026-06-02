import { PDFDocument } from "pdf-lib";
import { pointsToScreenUnits } from "@/lib/remarkable-rm";
import { fetchSyncResponse, fetchSyncText } from "@/lib/remarkable-sync/connection";
import {
  type ContentRecord,
  type IndexEntry,
  type MetadataRecord,
  type RemarkableConnection,
  getDocumentBundleAsset,
  getNotebookPageEntry,
  getNotebookPages,
  parseIndex,
  type RootIndexResponse,
} from "@/lib/remarkable-sync/types";

export async function fetchJsonRecord<T>(
  connection: RemarkableConnection,
  hash: string,
) {
  const raw = await fetchSyncText(connection, `/sync/v3/files/${hash}`);
  return JSON.parse(raw) as T;
}

export async function getBundleEntries(
  connection: RemarkableConnection,
  entryHash: string,
) {
  return parseIndex(await fetchSyncText(connection, `/sync/v3/files/${entryHash}`));
}

export async function getDocumentEntry(
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

export async function downloadRemarkableNotebookPage(
  connection: RemarkableConnection,
  documentId: string,
  pageId: string,
) {
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

  return Buffer.from(await response.arrayBuffer());
}

export async function getPdfBackedPageSize(
  connection: RemarkableConnection,
  bundleEntries: IndexEntry[],
  documentId: string,
  pageId: string,
) {
  const contentEntry = bundleEntries.find((bundleEntry) =>
    bundleEntry.documentId.endsWith(".content"),
  );
  const asset = getDocumentBundleAsset(bundleEntries, documentId);

  if (!contentEntry || asset?.contentType !== "application/pdf") {
    return null;
  }

  const content = await fetchJsonRecord<ContentRecord>(connection, contentEntry.hash);
  const notebookPage = getNotebookPages(content).find((page) => page.id === pageId);

  if (notebookPage?.sourcePageIndex == null) {
    return null;
  }

  const fileEntry = bundleEntries.find(
    (bundleEntry) => bundleEntry.documentId === asset.documentId,
  );

  if (!fileEntry) {
    return null;
  }

  const response = await fetchSyncResponse(
    connection,
    `/sync/v3/files/${fileEntry.hash}`,
  );
  const sourcePdf = await PDFDocument.load(await response.arrayBuffer());

  if (
    notebookPage.sourcePageIndex < 0 ||
    notebookPage.sourcePageIndex >= sourcePdf.getPageCount()
  ) {
    return null;
  }

  const sourcePage = sourcePdf.getPage(notebookPage.sourcePageIndex);
  const cropBox = sourcePage.getCropBox();
  const rotation = ((sourcePage.getRotation().angle % 360) + 360) % 360;
  let width = cropBox.width;
  let height = cropBox.height;

  if (rotation === 90 || rotation === 270) {
    [width, height] = [height, width];
  }

  return {
    width: Math.round(pointsToScreenUnits(width)),
    height: Math.round(pointsToScreenUnits(height)),
  };
}

export async function fetchMetadataForEntry(
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
