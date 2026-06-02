"use client";

import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import type { SourceType } from "@/lib/types";

function sanitizePreview(input: string) {
  return sanitizeHtml(input, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(["img", "h1", "h2", "h3"]),
    allowedAttributes: {
      a: ["href"],
      img: ["src", "alt"],
      "*": ["class"],
    },
  });
}

export function getPreviewHtml(sourceType: SourceType, content: string) {
  if (sourceType === "markdown") {
    return sanitizePreview(marked.parse(content, { async: false }) as string);
  }

  if (sourceType === "html") {
    return sanitizePreview(content);
  }

  if (sourceType === "text") {
    return sanitizePreview(
      content
        .split(/\n{2,}/)
        .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
        .join(""),
    );
  }

  return "";
}
