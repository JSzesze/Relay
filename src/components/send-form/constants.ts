"use client";

import type { SourceType } from "@/lib/types";

export const sourceTypes: { value: SourceType; label: string; hint: string }[] = [
  { value: "url", label: "URL", hint: "Fetch a page and turn it into a PDF." },
  {
    value: "markdown",
    label: "Markdown",
    hint: "Paste markdown and keep the authoring flow markdown-friendly.",
  },
  { value: "html", label: "HTML", hint: "Paste raw HTML and sanitize it." },
  { value: "text", label: "Text", hint: "Paste plain text content." },
  { value: "pdf", label: "PDF upload", hint: "Upload an existing PDF directly." },
];
