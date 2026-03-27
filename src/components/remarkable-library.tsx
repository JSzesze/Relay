"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderClosed,
  FolderOpen,
  Pin,
  RefreshCw,
  Tag,
} from "lucide-react";
import { PdfScenePreview } from "@/components/pdf-scene-preview";
import { Tree, TreeItem, TreeItemLabel } from "@/components/reui/tree";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import type {
  RemarkableDocumentDetail,
  RemarkableDocumentSkeleton,
  RemarkableFolderSkeleton,
  RemarkableSkeletonStore,
} from "@/lib/types";

type TreeNode =
  | RemarkableFolderSkeleton
  | RemarkableDocumentSkeleton
  | {
      id: "root";
      kind: "folder";
      name: "reMarkable";
      parentId: null;
      pinned: false;
    };

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
  const [detail, setDetail] = useState<RemarkableDocumentDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isSyncPending, startSyncTransition] = useTransition();
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [showDebugPayload, setShowDebugPayload] = useState(false);
  const [activePageIndex, setActivePageIndex] = useState(0);

  const rootNode = useMemo<TreeNode>(
    () => ({
      id: "root",
      kind: "folder",
      name: "reMarkable",
      parentId: null,
      pinned: false,
    }),
    [],
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, TreeNode>();
    map.set(rootNode.id, rootNode);
    for (const folder of store?.folders ?? []) {
      map.set(folder.id, folder);
    }
    for (const document of store?.documents ?? []) {
      map.set(document.id, document);
    }
    return map;
  }, [rootNode, store]);

  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    map.set("root", []);

    for (const folder of store?.folders ?? []) {
      const parentId = folder.parentId ?? "root";
      map.set(parentId, [...(map.get(parentId) ?? []), folder.id]);
      if (!map.has(folder.id)) {
        map.set(folder.id, []);
      }
    }

    for (const document of store?.documents ?? []) {
      const parentId = document.parentId ?? "root";
      map.set(parentId, [...(map.get(parentId) ?? []), document.id]);
    }

    for (const [parentId, childIds] of map.entries()) {
      childIds.sort((leftId, rightId) => {
        const left = nodeMap.get(leftId);
        const right = nodeMap.get(rightId);
        if (!left || !right) return 0;
        if (left.kind !== right.kind) {
          return left.kind === "folder" ? -1 : 1;
        }
        return left.name.localeCompare(right.name);
      });
      map.set(parentId, childIds);
    }

    return map;
  }, [nodeMap, store]);

  const getTreeNode = (itemId: string) => {
    const node = nodeMap.get(itemId);

    if (!node) {
      throw new Error(`Missing tree node for item "${itemId}"`);
    }

    return node;
  };

  const tree = useTree<TreeNode>({
    rootItemId: "root",
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind === "folder",
    dataLoader: {
      getItem: getTreeNode,
      getChildren: (itemId) => childrenMap.get(itemId) ?? [],
    },
    initialState: {
      expandedItems: ["root"],
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  useEffect(() => {
    if (!selectedId || selectedKind !== "document") {
      setIsDetailLoading(false);
      setDetail(null);
      setDetailError(null);
      setActivePageIndex(0);
      return;
    }

    let cancelled = false;

    setIsDetailLoading(true);
    setDetail(null);
    setDetailError(null);
    setShowDebugPayload(false);

    void (async () => {
      try {
        const response = await fetch(`/api/remarkable/items/${selectedId}`);
        const data = (await response.json()) as {
          detail?: RemarkableDocumentDetail;
          error?: string;
        };

        if (!response.ok || !data.detail) {
          throw new Error(data.error || "Unable to load document detail.");
        }

        if (!cancelled) {
          setDetail(data.detail);
          setActivePageIndex(0);
        }
      } catch (error) {
        if (!cancelled) {
          setDetail(null);
          setDetailError(
            error instanceof Error ? error.message : "Unable to load detail.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, selectedKind]);

  const selectedNode = selectedId ? nodeMap.get(selectedId) ?? null : null;
  const isPdfDocument = detail?.downloadAsset?.contentType === "application/pdf";
  const renderableNotebookPages = detail?.notebookPages ?? [];
  const previewPageCount = detail
    ? isPdfDocument
      ? typeof detail.pageCount === "number" && detail.pageCount > 0
        ? detail.pageCount
        : renderableNotebookPages.length > 0
          ? renderableNotebookPages.length
          : Math.max(detail.originalPageCount ?? 0, 1)
      : renderableNotebookPages.length
    : 0;
  const clampedPageIndex =
    previewPageCount > 0
      ? Math.min(activePageIndex, previewPageCount - 1)
      : 0;
  const activeNotebookPage = isPdfDocument
    ? renderableNotebookPages.find((page) => page.pageIndex === clampedPageIndex) ?? null
    : renderableNotebookPages[clampedPageIndex] ?? null;
  const activePageNumber = clampedPageIndex + 1;

  useEffect(() => {
    if (previewPageCount === 0) {
      return;
    }

    if (activePageIndex > previewPageCount - 1) {
      setActivePageIndex(previewPageCount - 1);
    }
  }, [activePageIndex, previewPageCount]);

  function handleSync() {
    startSyncTransition(async () => {
      const response = await fetch("/api/remarkable/skeleton", {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        setDetailError(payload.error || "Unable to sync directory.");
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

    setSelectedId(node.id);
    setSelectedKind(node.kind === "document" ? "document" : "folder");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(20rem,26rem)_1fr]">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Library</CardTitle>
            <CardDescription className="mt-2">
              Sync the reMarkable directory tree locally, then open documents on
              demand for tags and page-level detail.
            </CardDescription>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={isSyncPending}
          >
            <RefreshCw
              className={isSyncPending ? "animate-spin" : undefined}
            />
            Sync
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
            <Badge variant="muted">
              {store?.folders.length ?? 0} folders
            </Badge>
            <Badge variant="muted">
              {store?.documents.length ?? 0} documents
            </Badge>
            <Badge variant="muted">
              {store ? `Synced ${formatDate(store.syncedAt)}` : "Not synced yet"}
            </Badge>
          </div>

          {store ? (
            <div className="rounded-[1.25rem] border border-black/10 bg-white p-3">
              <Tree tree={tree} className="gap-0.5" toggleIconType="chevron">
                {tree.getItems().map((item) => {
                  const node = item.getItemData() as TreeNode | undefined;
                  const active = selectedId === node?.id;

                  return (
                    <TreeItem
                      key={item.getId()}
                      item={item}
                      onClick={() => handleSelect(node)}
                      className={active ? "z-20" : undefined}
                    >
                      <TreeItemLabel
                        className={active ? "bg-neutral-100 text-neutral-950" : undefined}
                      >
                        {node?.kind === "folder" ? (
                          item.isExpanded() ? (
                            <FolderOpen className="size-4 text-neutral-500" />
                          ) : (
                            <FolderClosed className="size-4 text-neutral-500" />
                          )
                        ) : (
                          <BookOpen className="size-4 text-neutral-500" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{node?.name}</span>
                        {node?.pinned ? <Pin className="size-3.5 text-amber-600" /> : null}
                      </TreeItemLabel>
                    </TreeItem>
                  );
                })}
              </Tree>
            </div>
          ) : (
            <div className="rounded-[1.25rem] border border-dashed border-black/10 bg-[var(--panel)] p-5 text-sm text-neutral-600">
              No local skeleton yet. Run the first sync to build the directory
              tree from reMarkable metadata.
            </div>
          )}
        </CardContent>
      </Card>

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
                  {previewPageCount > 1 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-black/10 bg-[var(--panel)] p-3">
                      <div>
                        <h4 className="font-medium text-neutral-950">Page</h4>
                        <p className="mt-1 text-sm text-neutral-600">
                          Page {activePageNumber} of {previewPageCount}
                        </p>
                        {isPdfDocument &&
                        renderableNotebookPages.length > 0 &&
                        renderableNotebookPages.length < previewPageCount ? (
                          <p className="mt-1 text-xs text-neutral-500">
                            Annotation scenes are available on{" "}
                            {renderableNotebookPages.length} of{" "}
                            {previewPageCount} pages.
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setActivePageIndex((current) =>
                              Math.max(current - 1, 0),
                            )
                          }
                          disabled={clampedPageIndex === 0}
                        >
                          <ChevronLeft className="size-4" />
                          Previous
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            setActivePageIndex((current) =>
                              Math.min(current + 1, previewPageCount - 1),
                            )
                          }
                          disabled={clampedPageIndex >= previewPageCount - 1}
                        >
                          Next
                          <ChevronRight className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {isPdfDocument ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="font-medium text-neutral-950">
                          PDF Scene Preview
                        </h4>
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
                      {!activeNotebookPage &&
                      renderableNotebookPages.length < previewPageCount ? (
                        <p className="text-sm text-neutral-600">
                          No `.rm` annotation scene was found for this PDF page.
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {!isPdfDocument && activeNotebookPage ? (
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
                        Pure notebooks still render directly from the first-party `.rm` parser, using the selected page from the scene bundle rather than a separate source document.
                      </p>
                    </div>
                  ) : null}

                  {detail.downloadAsset ? (
                    <div className="flex justify-start">
                      <Button asChild size="sm" variant="outline">
                        <a
                          href={`/api/remarkable/items/${detail.id}/download`}
                        >
                          <Download className="size-4" />
                          Download Original
                        </a>
                      </Button>
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="muted">{detail.fileType ?? "document"}</Badge>
                    {detail.pinned ? <Badge variant="success">Pinned</Badge> : null}
                    {typeof detail.pageCount === "number" ? (
                      <Badge variant="muted">{detail.pageCount} pages</Badge>
                    ) : null}
                    {detail.notebookPages.length > 0 ? (
                      <Badge variant="muted">{detail.notebookPages.length} notebook pages</Badge>
                    ) : null}
                  </div>

                  <dl className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-neutral-500">Document ID</dt>
                      <dd className="mt-1 break-all font-mono text-xs text-neutral-950">
                        {detail.id}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Title</dt>
                      <dd className="mt-1 text-neutral-950">
                        {detail.title ?? detail.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Authors</dt>
                      <dd className="mt-1 text-neutral-950">
                        {detail.authors?.join(", ") || "—"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Last Modified</dt>
                      <dd className="mt-1 text-neutral-950">
                        {formatDate(detail.lastModified)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-neutral-500">Last Opened</dt>
                      <dd className="mt-1 text-neutral-950">
                        {formatDate(detail.lastOpened)}
                      </dd>
                    </div>
                  </dl>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Tag className="size-4 text-neutral-500" />
                      <h4 className="font-medium text-neutral-950">
                        Document Tags
                      </h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {detail.tags.length > 0 ? (
                        detail.tags.map((tag) => (
                          <Badge key={`${tag.name}-${tag.timestamp}`} variant="muted">
                            {tag.name}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-neutral-600">No document tags</span>
                      )}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Tag className="size-4 text-neutral-500" />
                      <h4 className="font-medium text-neutral-950">Page Tags</h4>
                    </div>
                    {detail.pageTags.length > 0 ? (
                      <div className="space-y-2 rounded-[1rem] border border-black/10 bg-[var(--panel)] p-4">
                        {detail.pageTags.map((tag) => (
                          <div
                            key={`${tag.pageId}-${tag.name}-${tag.timestamp}`}
                            className="flex flex-wrap items-center justify-between gap-2 text-sm"
                          >
                            <span className="font-medium text-neutral-950">
                              {tag.name}
                            </span>
                            <span className="text-neutral-500">
                              {tag.pageId}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-sm text-neutral-600">No page tags</span>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <h4 className="font-medium text-neutral-950">Debug Payload</h4>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setShowDebugPayload((value) => !value)}
                      >
                        {showDebugPayload ? "Hide" : "Show"}
                      </Button>
                    </div>
                    {showDebugPayload ? (
                      <div className="rounded-[1rem] border border-black/10 bg-[var(--panel)] p-4">
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-700">
                          {JSON.stringify(detail.rawContent ?? detail.rawMetadata, null, 2)}
                        </pre>
                      </div>
                    ) : (
                      <p className="text-sm text-neutral-600">
                        Internal sync metadata and content payloads are hidden by default.
                      </p>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
