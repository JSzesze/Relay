"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageNavigation({
  activePageNumber,
  annotationPageCount,
  currentPageIndex,
  onNext,
  onPrevious,
  previewPageCount,
}: {
  activePageNumber: number;
  annotationPageCount: number;
  currentPageIndex: number;
  onNext: () => void;
  onPrevious: () => void;
  previewPageCount: number;
}) {
  if (previewPageCount <= 1) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1rem] border border-black/10 bg-[var(--panel)] p-3">
      <div>
        <h4 className="font-medium text-neutral-950">Page</h4>
        <p className="mt-1 text-sm text-neutral-600">
          Page {activePageNumber} of {previewPageCount}
        </p>
        {annotationPageCount > 0 && annotationPageCount < previewPageCount ? (
          <p className="mt-1 text-xs text-neutral-500">
            Annotation scenes are available on {annotationPageCount} of{" "}
            {previewPageCount} pages.
          </p>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPrevious}
          disabled={currentPageIndex === 0}
        >
          <ChevronLeft className="size-4" />
          Previous
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onNext}
          disabled={currentPageIndex >= previewPageCount - 1}
        >
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
