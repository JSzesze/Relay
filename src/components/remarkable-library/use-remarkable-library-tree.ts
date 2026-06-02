"use client";

import { useMemo } from "react";
import {
  hotkeysCoreFeature,
  selectionFeature,
  syncDataLoaderFeature,
} from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import type { RemarkableSkeletonStore } from "@/lib/types";
import type { TreeNode } from "@/components/remarkable-library/types";

export function useRemarkableLibraryTree(store: RemarkableSkeletonStore | null) {
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

        if (!left || !right) {
          return 0;
        }

        if (left.kind !== right.kind) {
          return left.kind === "folder" ? -1 : 1;
        }

        return left.name.localeCompare(right.name);
      });

      map.set(parentId, childIds);
    }

    return map;
  }, [nodeMap, store]);

  const tree = useTree<TreeNode>({
    rootItemId: "root",
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind === "folder",
    dataLoader: {
      getChildren: (itemId) => childrenMap.get(itemId) ?? [],
      getItem: (itemId) => {
        const node = nodeMap.get(itemId);

        if (!node) {
          throw new Error(`Missing tree node for item "${itemId}"`);
        }

        return node;
      },
    },
    initialState: {
      expandedItems: ["root"],
    },
    features: [syncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  });

  return {
    nodeMap,
    tree,
  };
}
