"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { PdfScenePreview } from "@/components/pdf-scene-preview";
import type { RemarkableDocumentDetail, RemarkableNotebookPage } from "@/lib/types";

export function DocumentPreviewSection({
  activeNotebookPage,
  detail,
  previewPageCount,
}: {
  activeNotebookPage: RemarkableNotebookPage | null;
  detail: RemarkableDocumentDetail;
  previewPageCount: number;
}) {
  const isPdfDocument = detail.downloadAsset?.contentType === "application/pdf";
  const renderableNotebookPages = detail.notebookPages;

  if (isPdfDocument) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-medium text-neutral-950">PDF Scene Preview</h4>
          <div className="flex items-center gap-2">
            {renderableNotebookPages.length > 0 ? (
              <Button asChild size="sm" variant="outline">
                <a
                  href={`/api/remarkable/items/${detail.id}/annotated.pdf`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Merged PDF
                </a>
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <a
                href={`/api/remarkable/items/${detail.id}/download?inline=1`}
                target="_blank"
                rel="noreferrer"
              >
                Open Full Size
              </a>
            </Button>
          </div>
        </div>
        <PdfScenePreview
          pdfUrl={`/api/remarkable/items/${detail.id}/download?inline=1`}
          overlayGeometryUrl={
            activeNotebookPage
              ? `/api/remarkable/items/${detail.id}/pages/${activeNotebookPage.id}/overlay?viewport=frame&transparent=1`
              : null
          }
          overlaySvgUrl={
            activeNotebookPage
              ? `/api/remarkable/items/${detail.id}/pages/${activeNotebookPage.id}/svg?viewport=frame&transparent=1`
              : null
          }
          sourcePageNumber={
            activeNotebookPage?.sourcePageIndex != null
              ? activeNotebookPage.sourcePageIndex + 1
              : null
          }
          title={detail.name}
        />
        {!activeNotebookPage && renderableNotebookPages.length < previewPageCount ? (
          <p className="text-sm text-neutral-600">
            No `.rm` annotation scene was found for this PDF page.
          </p>
        ) : null}
      </div>
    );
  }

  if (!activeNotebookPage) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-medium text-neutral-950">Notebook Preview</h4>
        <Button asChild size="sm" variant="outline">
          <a
            href={`/api/remarkable/items/${detail.id}/pages/${activeNotebookPage.id}/svg`}
            target="_blank"
            rel="noreferrer"
          >
            Open SVG
          </a>
        </Button>
      </div>
      <div className="relative min-h-[24rem] overflow-hidden rounded-[1rem] border border-black/10 bg-white">
        <Image
          src={`/api/remarkable/items/${detail.id}/pages/${activeNotebookPage.id}/svg`}
          alt={`${detail.name} notebook preview`}
          fill
          unoptimized
          sizes="(min-width: 1280px) 60vw, 100vw"
          className="object-contain"
        />
      </div>
      <p className="text-sm text-neutral-600">
        Pure notebooks still render directly from the first-party `.rm` parser,
        using the selected page from the scene bundle rather than a separate
        source document.
      </p>
    </div>
  );
}
