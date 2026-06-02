"use client";

import type { RemarkableRmSvgGeometry } from "@/lib/remarkable-rm";

export interface RenderedPdfPage {
  pageHeight: number;
  pageWidth: number;
  src: string;
}

const pdfBufferCache = new Map<string, Promise<ArrayBuffer>>();
const overlayGeometryCache = new Map<string, Promise<RemarkableRmSvgGeometry>>();
const overlaySvgCache = new Map<string, Promise<string>>();
const renderedPdfPageCache = new Map<string, Promise<RenderedPdfPage>>();

export async function preloadImage(src: string, errorMessage: string) {
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

export async function getPdfBuffer(url: string) {
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

export async function getOverlayGeometry(url: string) {
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

export async function getOverlaySvgSrc(url: string) {
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

export async function getRenderedPdfPage(
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
