"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { RemarkableRmSvgGeometry } from "@/lib/remarkable-rm";

const pdfBufferCache = new Map<string, Promise<ArrayBuffer>>();
const overlayGeometryCache = new Map<string, Promise<RemarkableRmSvgGeometry>>();
const overlaySvgCache = new Map<string, Promise<string>>();
const renderedPdfPageCache = new Map<string, Promise<RenderedPdfPage>>();

interface RenderedPdfPage {
  pageHeight: number;
  pageWidth: number;
  src: string;
}

interface DisplayState {
  overlayGeometry: RemarkableRmSvgGeometry | null;
  overlaySrc: string | null;
  pageHeight: number;
  pageWidth: number;
  pdfSrc: string | null;
}

async function getPdfBuffer(url: string) {
  let promise = pdfBufferCache.get(url);

  if (!promise) {
    promise = fetch(url, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load PDF preview.");
        }

        return response.arrayBuffer();
      })
      .catch((error) => {
        pdfBufferCache.delete(url);
        throw error;
      });
    pdfBufferCache.set(url, promise);
  }

  return promise;
}

async function getOverlayGeometry(url: string) {
  let promise = overlayGeometryCache.get(url);

  if (!promise) {
    promise = fetch(url, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load annotation overlay.");
        }

        const payload = (await response.json()) as {
          geometry?: RemarkableRmSvgGeometry;
        };

        if (!payload.geometry) {
          throw new Error("Unable to load annotation overlay.");
        }

        return payload.geometry;
      })
      .catch((error) => {
        overlayGeometryCache.delete(url);
        throw error;
      });
    overlayGeometryCache.set(url, promise);
  }

  return promise;
}

async function preloadImage(src: string, errorMessage: string) {
  await new Promise<void>((resolve, reject) => {
    const image = new window.Image();

    image.onload = () => {
      resolve();
    };
    image.onerror = () => {
      reject(new Error(errorMessage));
    };
    image.src = src;
  });
}

async function getOverlaySvgSrc(url: string) {
  let promise = overlaySvgCache.get(url);

  if (!promise) {
    promise = fetch(url, { cache: "force-cache" })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("Unable to load annotation overlay.");
        }

        const blob = await response.blob();
        const src = URL.createObjectURL(blob);
        await preloadImage(src, "Unable to load annotation overlay.");
        return src;
      })
      .catch((error) => {
        overlaySvgCache.delete(url);
        throw error;
      });
    overlaySvgCache.set(url, promise);
  }

  return promise;
}

async function getRenderedPdfPage(
  pdfUrl: string,
  sourcePageNumber: number,
  containerWidth: number,
) {
  const devicePixelRatio = window.devicePixelRatio || 1;
  const cacheKey = [
    pdfUrl,
    sourcePageNumber,
    Math.round(containerWidth),
    Math.round(devicePixelRatio * 100),
  ].join(":");
  let promise = renderedPdfPageCache.get(cacheKey);

  if (!promise) {
    promise = (async () => {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();

      if (pdfjs.GlobalWorkerOptions.workerSrc !== workerSrc) {
        pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
      }

      const buffer = await getPdfBuffer(pdfUrl);
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer.slice(0)),
      });

      try {
        const pdfDocument = await loadingTask.promise;
        const targetPage = Math.min(
          Math.max(sourcePageNumber, 1),
          pdfDocument.numPages,
        );
        const pdfPage = await pdfDocument.getPage(targetPage);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const cssScale = containerWidth / baseViewport.width;
        const viewport = pdfPage.getViewport({
          scale: cssScale * devicePixelRatio,
        });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("Unable to create PDF preview context.");
        }

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await pdfPage.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise;

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((value) => {
            if (value) {
              resolve(value);
              return;
            }

            reject(new Error("Unable to cache PDF preview."));
          }, "image/png");
        });
        const src = URL.createObjectURL(blob);
        await preloadImage(src, "Unable to render PDF page.");

        return {
          pageHeight: baseViewport.height,
          pageWidth: baseViewport.width,
          src,
        } satisfies RenderedPdfPage;
      } finally {
        loadingTask.destroy();
      }
    })().catch((error) => {
      renderedPdfPageCache.delete(cacheKey);
      throw error;
    });
    renderedPdfPageCache.set(cacheKey, promise);
  }

  return promise;
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
            ? Promise.resolve<RenderedPdfPage | null>(null)
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

  const previewAspectRatio =
    displayState.pageHeight > 0
      ? displayState.pageWidth / displayState.pageHeight
      : aspectRatio;

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
