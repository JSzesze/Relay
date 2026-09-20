import { createHash } from "node:crypto";

import { getUploadHost, putCloudFile, putCloudRoot } from "@/lib/remarkable-client";
import { fetchSyncResponse, fetchSyncText } from "@/lib/remarkable-sync/connection";
import type { RemarkableConnection } from "@/lib/remarkable-sync/types";
import type { NotebookBundleFile } from "@/lib/remarkable-notebook-bundle";
import {
  parseIndexCollection,
  parseRemarkableRootFingerprint,
  serializeIndexCollection,
  type IndexEntry,
} from "@/lib/remarkable-sync/types";

function sha256Hex(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function schema4CollectionHash(bytes: Buffer) {
  return sha256Hex(bytes);
}

export async function downloadBundleFiles(
  connection: RemarkableConnection,
  documentId: string,
  entries: IndexEntry[],
) {
  const files: NotebookBundleFile[] = [];

  for (const entry of entries) {
    const response = await fetchSyncResponse(
      connection,
      `/sync/v3/files/${entry.hash}`,
      entry.documentId,
    );
    files.push({
      bytes: Buffer.from(await response.arrayBuffer()),
      name: entry.documentId,
    });
  }

  return files;
}

export async function uploadNotebookBundle(params: {
  connection: RemarkableConnection;
  documentId: string;
  files: NotebookBundleFile[];
}) {
  const host = params.connection.tectonicHost ?? getUploadHost(params.connection.userToken);
  const fileEntries: IndexEntry[] = [];

  for (const file of params.files) {
    const hash = sha256Hex(file.bytes);
    await putCloudFile({
      bytes: file.bytes,
      fileName: file.name,
      hash,
      host,
      userToken: params.connection.userToken,
    });
    fileEntries.push({
      documentId: file.name,
      hash,
      size: file.bytes.length,
      subfiles: 0,
      type: 0,
    });
  }

  const documentIndex = serializeIndexCollection({
    entries: fileEntries,
    id: params.documentId,
    schemaVersion: 4,
  });
  const documentHash = schema4CollectionHash(documentIndex.bytes);
  await putCloudFile({
    bytes: documentIndex.bytes,
    fileName: `${params.documentId}.docSchema`,
    hash: documentHash,
    host,
    userToken: params.connection.userToken,
  });

  return {
    documentEntry: {
      documentId: params.documentId,
      hash: documentHash,
      size: documentIndex.size,
      subfiles: documentIndex.sorted.length,
      type: 0,
    } satisfies IndexEntry,
    fileEntries,
  };
}

export async function replaceRootDocumentEntry(params: {
  connection: RemarkableConnection;
  documentEntry: IndexEntry;
}) {
  const host =
    params.connection.tectonicHost ?? getUploadHost(params.connection.userToken);
  const root = parseRemarkableRootFingerprint(
    await fetchSyncText(params.connection, "/sync/v4/root"),
  );
  const rootBlob = await fetchSyncText(
    params.connection,
    `/sync/v3/files/${root.hash}`,
    "root.docSchema",
  );
  const current = parseIndexCollection(rootBlob);
  const entries = current.entries.filter(
    (entry) => entry.documentId !== params.documentEntry.documentId,
  );
  entries.push(params.documentEntry);

  const nextRoot = serializeIndexCollection({
    entries,
    id: "root",
    schemaVersion: 4,
  });
  const nextHash = schema4CollectionHash(nextRoot.bytes);
  await putCloudFile({
    bytes: nextRoot.bytes,
    fileName: "root.docSchema",
    hash: nextHash,
    host,
    userToken: params.connection.userToken,
  });

  return putCloudRoot({
    generation: root.generation,
    hash: nextHash,
    host,
    userToken: params.connection.userToken,
  });
}

export async function syncNotebookBundle(params: {
  connection: RemarkableConnection;
  documentId: string;
  files: NotebookBundleFile[];
}) {
  const uploaded = await uploadNotebookBundle(params);
  const root = await replaceRootDocumentEntry({
    connection: params.connection,
    documentEntry: uploaded.documentEntry,
  });

  return {
    documentHash: uploaded.documentEntry.hash,
    fileCount: uploaded.fileEntries.length,
    generation: root.generation,
    rootHash: root.hash,
  };
}
