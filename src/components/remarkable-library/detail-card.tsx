"use client";

import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RemarkableDocumentDetail } from "@/lib/types";
import type { TreeNode } from "@/components/remarkable-library/types";
import { DocumentMetadataSections } from "@/components/remarkable-library/document-metadata-sections";
import { DocumentPreviewSection } from "@/components/remarkable-library/document-preview-section";
import { PageNavigation } from "@/components/remarkable-library/page-navigation";

export function DetailCard({
  activePageIndex,
  detail,
  detailError,
  isDetailLoading,
  onNextPage,
  onPreviousPage,
  onToggleDebugPayload,
  previewPageCount,
  selectedNode,
  setActivePageIndex,
  showDebugPayload,
}: {
  activePageIndex: number;
  detail: RemarkableDocumentDetail | null;
  detailError: string | null;
  isDetailLoading: boolean;
  onNextPage: () => void;
  onPreviousPage: () => void;
  onToggleDebugPayload: () => void;
  previewPageCount: number;
  selectedNode: TreeNode | null;
  setActivePageIndex: (nextPageIndex: number) => void;
  showDebugPayload: boolean;
}) {
  const isPdfDocument = detail?.downloadAsset?.contentType === "application/pdf";
  const renderableNotebookPages = detail?.notebookPages ?? [];
  const clampedPageIndex =
    previewPageCount > 0
      ? Math.min(activePageIndex, previewPageCount - 1)
      : 0;
  const activeNotebookPage = detail
    ? isPdfDocument
      ? renderableNotebookPages.find((page) => page.pageIndex === clampedPageIndex) ??
        null
      : renderableNotebookPages[clampedPageIndex] ?? null
    : null;
  const activePageNumber = clampedPageIndex + 1;

  useEffect(() => {
    if (previewPageCount === 0) {
      return;
    }

    if (activePageIndex > previewPageCount - 1) {
      setActivePageIndex(previewPageCount - 1);
    }
  }, [activePageIndex, previewPageCount, setActivePageIndex]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Detail</CardTitle>
        <CardDescription className="mt-2">
          Selecting a document pulls its `.content` lazily so you can inspect
          tags before deciding what to automate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!selectedNode ? (
          <p className="text-sm text-neutral-600">
            Select a folder or document from the tree.
          </p>
        ) : selectedNode.kind === "folder" ? (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-neutral-950">
                {selectedNode.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                Folder {selectedNode.parentId ? `inside ${selectedNode.parentId}` : "at root"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="muted">Folder</Badge>
              {selectedNode.pinned ? <Badge variant="success">Pinned</Badge> : null}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-neutral-950">
                {selectedNode.name}
              </h3>
              <p className="mt-1 text-sm text-neutral-600">
                {selectedNode.parentId ? `Parent ${selectedNode.parentId}` : "At root"}
              </p>
            </div>

            {isDetailLoading ? (
              <p className="text-sm text-neutral-600">Loading detail…</p>
            ) : detailError ? (
              <p className="text-sm font-medium text-[var(--danger)]">
                {detailError}
              </p>
            ) : detail ? (
              <>
                <PageNavigation
                  activePageNumber={activePageNumber}
                  annotationPageCount={renderableNotebookPages.length}
                  currentPageIndex={clampedPageIndex}
                  onNext={onNextPage}
                  onPrevious={onPreviousPage}
                  previewPageCount={previewPageCount}
                />

                <DocumentPreviewSection
                  activeNotebookPage={activeNotebookPage}
                  detail={detail}
                  previewPageCount={previewPageCount}
                />

                <DocumentMetadataSections
                  detail={detail}
                  onToggleDebugPayload={onToggleDebugPayload}
                  showDebugPayload={showDebugPayload}
                />
              </>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
