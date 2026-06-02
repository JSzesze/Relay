"use client";

import { useEffect, useRef, useState } from "react";
import type { RemarkableRmSvgGeometry } from "@/lib/remarkable-rm";
import {
  getOverlayGeometry,
  getOverlaySvgSrc,
  getRenderedPdfPage,
} from "@/components/pdf-scene-preview/resources";

interface DisplayState {
  overlayGeometry: RemarkableRmSvgGeometry | null;
  overlaySrc: string | null;
  pageHeight: number;
  pageWidth: number;
  pdfSrc: string | null;
}

function getEmptyDisplayState(aspectRatio: number) {
  return {
    overlayGeometry: null,
    overlaySrc: null,
    pageHeight: aspectRatio === 0 ? 792 : 612 / aspectRatio,
    pageWidth: 612,
    pdfSrc: null,
  } satisfies DisplayState;
}

export function usePdfScenePreview({
  overlayGeometryUrl,
  overlaySvgUrl,
  pdfUrl,
  sourcePageNumber,
}: {
  overlayGeometryUrl?: string | null;
  overlaySvgUrl?: string | null;
  pdfUrl: string;
  sourcePageNumber?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [aspectRatio, setAspectRatio] = useState(8.5 / 11);
  const [displayState, setDisplayState] = useState<DisplayState>(() =>
    getEmptyDisplayState(8.5 / 11),
  );
  const [isSwitching, setIsSwitching] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [overlayError, setOverlayError] = useState<string | null>(null);

  useEffect(() => {
    const element = containerRef.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const nextWidth = entries[0]?.contentRect.width ?? 0;
      setContainerWidth((current) =>
        Math.abs(current - nextWidth) > 1 ? nextWidth : current,
      );
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (containerWidth <= 0) {
      return;
    }

    setIsSwitching(true);
    setRenderError(null);
    setOverlayError(null);

    void (async () => {
      let nextRenderError: string | null = null;
      let nextOverlayError: string | null = null;

      try {
        const [pdfLayer, overlayLayer] = await Promise.all([
          sourcePageNumber == null
            ? Promise.resolve<Awaited<ReturnType<typeof getRenderedPdfPage>> | null>(
                null,
              )
            : getRenderedPdfPage(pdfUrl, sourcePageNumber, containerWidth).catch(
                (error) => {
                  nextRenderError =
                    error instanceof Error
                      ? error.message
                      : "Unable to render PDF page.";
                  return null;
                },
              ),
          !overlayGeometryUrl || !overlaySvgUrl
            ? Promise.resolve<{
                geometry: RemarkableRmSvgGeometry | null;
                src: string | null;
              }>({
                geometry: null,
                src: null,
              })
            : Promise.all([
                getOverlayGeometry(overlayGeometryUrl),
                getOverlaySvgSrc(overlaySvgUrl),
              ])
                .then(([geometry, src]) => ({ geometry, src }))
                .catch((error) => {
                  nextOverlayError =
                    error instanceof Error
                      ? error.message
                      : "Unable to load annotation overlay.";
                  return {
                    geometry: null,
                    src: null,
                  };
                }),
        ]);

        if (cancelled) {
          return;
        }

        const pageWidth =
          overlayLayer.geometry?.pageWidth ?? pdfLayer?.pageWidth ?? 612;
        const pageHeight =
          overlayLayer.geometry?.pageHeight ?? pdfLayer?.pageHeight ?? 792;

        setAspectRatio(pageWidth / pageHeight);
        setDisplayState({
          overlayGeometry: overlayLayer.geometry,
          overlaySrc: overlayLayer.src,
          pageHeight,
          pageWidth,
          pdfSrc: pdfLayer?.src ?? null,
        });
        setRenderError(nextRenderError);
        setOverlayError(nextOverlayError);
      } finally {
        if (!cancelled) {
          setIsSwitching(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    containerWidth,
    overlayGeometryUrl,
    overlaySvgUrl,
    pdfUrl,
    sourcePageNumber,
  ]);

  return {
    containerRef,
    displayState,
    isSwitching,
    overlayError,
    previewAspectRatio:
      displayState.pageHeight > 0
        ? displayState.pageWidth / displayState.pageHeight
        : aspectRatio,
    renderError,
  };
}
