"use client";

import { Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import type { RemarkableDocumentDetail } from "@/lib/types";

export function DocumentMetadataSections({
  detail,
  onToggleDebugPayload,
  showDebugPayload,
}: {
  detail: RemarkableDocumentDetail;
  onToggleDebugPayload: () => void;
  showDebugPayload: boolean;
}) {
  return (
    <>
      {detail.downloadAsset ? (
        <div className="flex justify-start">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/remarkable/items/${detail.id}/download`}>
              Download Original
            </a>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Badge variant="muted">{detail.fileType ?? "document"}</Badge>
        {detail.pinned ? <Badge variant="success">Pinned</Badge> : null}
        {typeof detail.pageCount === "number" ? (
          <Badge variant="muted">{detail.pageCount} pages</Badge>
        ) : null}
        {detail.notebookPages.length > 0 ? (
          <Badge variant="muted">
            {detail.notebookPages.length} notebook pages
          </Badge>
        ) : null}
      </div>

      <dl className="grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-neutral-500">Document ID</dt>
          <dd className="mt-1 break-all font-mono text-xs text-neutral-950">
            {detail.id}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Title</dt>
          <dd className="mt-1 text-neutral-950">{detail.title ?? detail.name}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Authors</dt>
          <dd className="mt-1 text-neutral-950">
            {detail.authors?.join(", ") || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Last Modified</dt>
          <dd className="mt-1 text-neutral-950">
            {formatDate(detail.lastModified)}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Last Opened</dt>
          <dd className="mt-1 text-neutral-950">
            {formatDate(detail.lastOpened)}
          </dd>
        </div>
      </dl>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-neutral-500" />
          <h4 className="font-medium text-neutral-950">Document Tags</h4>
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.tags.length > 0 ? (
            detail.tags.map((tag) => (
              <Badge key={`${tag.name}-${tag.timestamp}`} variant="muted">
                {tag.name}
              </Badge>
            ))
          ) : (
            <span className="text-sm text-neutral-600">No document tags</span>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Tag className="size-4 text-neutral-500" />
          <h4 className="font-medium text-neutral-950">Page Tags</h4>
        </div>
        {detail.pageTags.length > 0 ? (
          <div className="space-y-2 rounded-[1rem] border border-black/10 bg-[var(--panel)] p-4">
            {detail.pageTags.map((tag) => (
              <div
                key={`${tag.pageId}-${tag.name}-${tag.timestamp}`}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span className="font-medium text-neutral-950">{tag.name}</span>
                <span className="text-neutral-500">{tag.pageId}</span>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-sm text-neutral-600">No page tags</span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-medium text-neutral-950">Debug Payload</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onToggleDebugPayload}
          >
            {showDebugPayload ? "Hide" : "Show"}
          </Button>
        </div>
        {showDebugPayload ? (
          <div className="rounded-[1rem] border border-black/10 bg-[var(--panel)] p-4">
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-neutral-700">
              {JSON.stringify(detail.rawContent ?? detail.rawMetadata, null, 2)}
            </pre>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">
            Internal sync metadata and content payloads are hidden by default.
          </p>
        )}
      </div>
    </>
  );
}
