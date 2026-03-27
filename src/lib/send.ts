import "server-only";

import { createDocument, createJob, readState, updateJob } from "@/lib/state";
import { prepareContent } from "@/lib/content-pipeline";
import { createPdfFromHtml, createPdfFromText } from "@/lib/pdf";
import { uploadPdf } from "@/lib/remarkable-client";
import { safeTitle } from "@/lib/utils";
import type { SourceType } from "@/lib/types";

export async function sendContent(input: {
  sourceType: SourceType;
  title?: string;
  content?: string;
  fileName?: string;
  pdfBytes?: Uint8Array;
}) {
  const state = await readState();
  if (!state.connection) {
    throw new Error("Connect a reMarkable account first.");
  }

  let title = safeTitle(input.title);
  const sourceType = input.sourceType;
  let normalizedHtml = "";
  let plainText = "";
  let rawSource = input.content ?? "";
  let pdfBytes: Uint8Array;

  if (sourceType === "pdf") {
    if (!input.pdfBytes) {
      throw new Error("PDF input is missing file data.");
    }
    title = safeTitle(input.fileName ?? input.title, "Uploaded PDF");
    pdfBytes = input.pdfBytes;
  } else {
    const prepared = await prepareContent({
      sourceType,
      title: input.title,
      content: input.content ?? "",
    });
    title = prepared.title;
    normalizedHtml = prepared.normalizedHtml;
    plainText = prepared.plainText;
    rawSource = prepared.rawSource;
    pdfBytes = normalizedHtml
      ? await createPdfFromHtml(title, normalizedHtml, plainText)
      : await createPdfFromText(title, plainText);
  }

  const document = await createDocument({
    title,
    sourceType,
    rawSource,
    normalizedHtml,
    plainText,
  });

  const job = await createJob({
    documentId: document.id,
    title,
    sourceType,
  });

  try {
    await updateJob(job.id, { status: "converting" });
    await updateJob(job.id, { status: "uploading" });

    await uploadPdf({
      userToken: state.connection.userToken,
      title,
      pdfBytes,
    });

    await updateJob(job.id, {
      status: "uploaded",
      uploadedAt: new Date().toISOString(),
      error: undefined,
    });
    return { jobId: job.id, documentId: document.id };
  } catch (error) {
    await updateJob(job.id, {
      status: "failed",
      error: error instanceof Error ? error.message : "Unknown send failure",
    });
    throw error;
  }
}
