"use client";

import Image from "next/image";
import { usePdfScenePreview } from "@/components/pdf-scene-preview/use-pdf-scene-preview";

export function PdfScenePreview({
  pdfUrl,
  overlayGeometryUrl,
  overlaySvgUrl,
  sourcePageNumber,
  title,
}: {
  pdfUrl: string;
  overlayGeometryUrl?: string | null;
  overlaySvgUrl?: string | null;
  sourcePageNumber?: number | null;
  title: string;
}) {
  const {
    containerRef,
    displayState,
    isSwitching,
    overlayError,
    previewAspectRatio,
    renderError,
  } = usePdfScenePreview({
    overlayGeometryUrl,
    overlaySvgUrl,
    pdfUrl,
    sourcePageNumber,
  });

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-[1rem] border border-black/10 bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.02)]"
        style={{ aspectRatio: previewAspectRatio }}
      >
        {displayState.pdfSrc ? (
          <Image
            src={displayState.pdfSrc}
            alt={`${title} preview`}
            fill
            unoptimized
            sizes="100vw"
            className="object-fill"
          />
        ) : (
          <div
            aria-label={`${title} preview`}
            className="absolute inset-0 bg-white"
          />
        )}
        {displayState.overlayGeometry && displayState.overlaySrc ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 overflow-hidden"
          >
            <Image
              src={displayState.overlaySrc}
              alt=""
              aria-hidden="true"
              fill
              unoptimized
              sizes="100vw"
              className="object-fill"
            />
          </div>
        ) : null}
        {isSwitching ? (
          <div className="absolute inset-0 flex items-center justify-center bg-white/72 text-sm text-neutral-600 backdrop-blur-[1px]">
            <div className="rounded-full border border-black/10 bg-white/95 px-4 py-2 shadow-sm">
              Loading page and notes…
            </div>
          </div>
        ) : null}
      </div>

      {renderError ? (
        <p className="text-sm font-medium text-[var(--danger)]">{renderError}</p>
      ) : overlayError ? (
        <p className="text-sm font-medium text-[var(--danger)]">{overlayError}</p>
      ) : (
        <p className="text-sm text-neutral-600">
          PDF-backed pages now swap once the next PDF page and annotation layer
          are both ready, and repeated pages reuse in-memory preview caches.
        </p>
      )}
    </div>
  );
}
