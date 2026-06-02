"use client";

import type {
  RemarkableDocumentSkeleton,
  RemarkableFolderSkeleton,
} from "@/lib/types";

export type TreeNode =
  | RemarkableFolderSkeleton
  | RemarkableDocumentSkeleton
  | {
      id: "root";
      kind: "folder";
      name: "reMarkable";
      parentId: null;
      pinned: false;
    };
