"use client";

import { BookOpen, FolderClosed, FolderOpen, Pin, RefreshCw } from "lucide-react";
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
import type { RemarkableSkeletonStore } from "@/lib/types";
import type { TreeNode } from "@/components/remarkable-library/types";

export function LibraryTreeCard({
  isSyncPending,
  onSelect,
  onSync,
  selectedId,
  store,
  tree,
}: {
  isSyncPending: boolean;
  onSelect: (node: TreeNode | undefined) => void;
  onSync: () => void;
  selectedId: string | null;
  store: RemarkableSkeletonStore | null;
  tree: ReturnType<typeof import("@headless-tree/react").useTree<TreeNode>>;
}) {
  return (
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
          onClick={onSync}
          disabled={isSyncPending}
        >
          <RefreshCw className={isSyncPending ? "animate-spin" : undefined} />
          Sync
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-neutral-600">
          <Badge variant="muted">{store?.folders.length ?? 0} folders</Badge>
          <Badge variant="muted">{store?.documents.length ?? 0} documents</Badge>
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
                    onClick={() => onSelect(node)}
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
  );
}
