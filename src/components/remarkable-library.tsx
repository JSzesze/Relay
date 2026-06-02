"use client";

import { useState, useTransition } from "react";
import { DetailCard } from "@/components/remarkable-library/detail-card";
import { LibraryTreeCard } from "@/components/remarkable-library/library-tree-card";
import type { TreeNode } from "@/components/remarkable-library/types";
import { useRemarkableDocumentDetail } from "@/components/remarkable-library/use-remarkable-document-detail";
import { useRemarkableLibraryTree } from "@/components/remarkable-library/use-remarkable-library-tree";
import type { RemarkableSkeletonStore } from "@/lib/types";

export function RemarkableLibrary({
  initialStore,
}: {
  initialStore: RemarkableSkeletonStore | null;
}) {
  const [store, setStore] = useState(initialStore);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<"folder" | "document" | null>(
    null,
  );
  const [showDebugPayload, setShowDebugPayload] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncPending, startSyncTransition] = useTransition();
  const { nodeMap, tree } = useRemarkableLibraryTree(store);
  const { detail, detailError: detailLoadError, isDetailLoading } =
    useRemarkableDocumentDetail(selectedId, selectedKind);

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const renderableNotebookPages = detail?.notebookPages ?? [];
  const isPdfDocument = detail?.downloadAsset?.contentType === "application/pdf";
  const previewPageCount = detail
    ? isPdfDocument
      ? typeof detail.pageCount === "number" && detail.pageCount > 0
        ? detail.pageCount
        : renderableNotebookPages.length > 0
          ? renderableNotebookPages.length
          : Math.max(detail.originalPageCount ?? 0, 1)
      : renderableNotebookPages.length
    : 0;

  function handleSync() {
    startSyncTransition(async () => {
      setSyncError(null);

      const response = await fetch("/api/remarkable/skeleton", {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setSyncError(payload.error || "Unable to sync directory.");
        return;
      }

      const refreshed = await fetch("/api/remarkable/skeleton");
      const refreshedPayload = (await refreshed.json()) as {
        store?: RemarkableSkeletonStore | null;
      };
      setStore(refreshedPayload.store ?? null);
    });
  }

  function handleSelect(node: TreeNode | undefined) {
    if (!node) {
      return;
    }

    setShowDebugPayload(false);
    setActivePageIndex(0);
    setSelectedId(node.id);
    setSelectedKind(node.kind === "document" ? "document" : "folder");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(20rem,26rem)_1fr]">
      <LibraryTreeCard
        isSyncPending={isSyncPending}
        onSelect={handleSelect}
        onSync={handleSync}
        selectedId={selectedId}
        store={store}
        tree={tree}
      />
      <DetailCard
        activePageIndex={activePageIndex}
        detail={detail}
        detailError={detailLoadError ?? syncError}
        isDetailLoading={isDetailLoading}
        onNextPage={() =>
          setActivePageIndex((current) =>
            Math.min(current + 1, Math.max(previewPageCount - 1, 0)),
          )
        }
        onPreviousPage={() =>
          setActivePageIndex((current) => Math.max(current - 1, 0))
        }
        onToggleDebugPayload={() => setShowDebugPayload((value) => !value)}
        previewPageCount={previewPageCount}
        selectedNode={selectedNode}
        setActivePageIndex={setActivePageIndex}
        showDebugPayload={showDebugPayload}
      />
    </div>
  );
}
