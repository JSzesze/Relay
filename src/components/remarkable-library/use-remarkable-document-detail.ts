"use client";

import { useEffect, useState } from "react";
import type { RemarkableDocumentDetail } from "@/lib/types";

export function useRemarkableDocumentDetail(
  selectedId: string | null,
  selectedKind: "folder" | "document" | null,
) {
  const [detail, setDetail] = useState<RemarkableDocumentDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  useEffect(() => {
    if (!selectedId || selectedKind !== "document") {
      setIsDetailLoading(false);
      setDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;

    setIsDetailLoading(true);
    setDetail(null);
    setDetailError(null);

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

  return {
    detail,
    detailError,
    isDetailLoading,
  };
}
