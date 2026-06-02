"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { SourceType } from "@/lib/types";

export function PreviewCard({
  content,
  file,
  previewHtml,
  sourceType,
}: {
  content: string;
  file: File | null;
  previewHtml: string;
  sourceType: SourceType;
}) {
  return (
    <Card className="bg-[var(--panel)]">
      <CardHeader>
        <CardTitle>Preview</CardTitle>
        <CardDescription>
          URL and PDF inputs skip the rich preview here. The actual send still
          runs server-side.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sourceType === "url" ? (
          <div className="mt-5 rounded-[1.25rem] border border-dashed border-black/10 bg-white/70 p-5 text-sm leading-6 text-neutral-600">
            URL mode will fetch and normalize:
            <div className="mt-3 font-mono text-xs text-neutral-900">
              {content || "https://example.com/article"}
            </div>
          </div>
        ) : null}
        {sourceType === "pdf" ? (
          <div className="mt-5 rounded-[1.25rem] border border-dashed border-black/10 bg-white/70 p-5 text-sm leading-6 text-neutral-600">
            {file ? `Ready to upload ${file.name}` : "Choose a PDF file to send."}
          </div>
        ) : null}
        {sourceType !== "url" && sourceType !== "pdf" ? (
          <div
            className="prose-copy mt-5 min-h-[28rem] rounded-[1.25rem] border border-black/10 bg-white/70 p-5 text-sm leading-6 text-neutral-700"
            dangerouslySetInnerHTML={{ __html: previewHtml }}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
