"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SourceType } from "@/lib/types";

export function InputPanel({
  content,
  onContentChange,
  onFileChange,
  onTitleChange,
  sourceType,
  title,
}: {
  content: string;
  onContentChange: (nextContent: string) => void;
  onFileChange: (nextFile: File | null) => void;
  onTitleChange: (nextTitle: string) => void;
  sourceType: SourceType;
  title: string;
}) {
  return (
    <div className="mt-6 space-y-4">
      <label className="block text-sm font-medium text-neutral-800">
        Title
        <Input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          placeholder="Document title"
          className="mt-2"
        />
      </label>

      {sourceType === "pdf" ? (
        <label className="block text-sm font-medium text-neutral-800">
          PDF file
          <Input
            type="file"
            accept="application/pdf"
            onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
            className="mt-2 block w-full cursor-pointer py-2"
          />
        </label>
      ) : (
        <label className="block text-sm font-medium text-neutral-800">
          {sourceType === "url" ? "URL" : "Content"}
          {sourceType === "url" ? (
            <Input
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              placeholder="https://example.com/article"
              className="mt-2"
            />
          ) : (
            <Textarea
              value={content}
              onChange={(event) => onContentChange(event.target.value)}
              rows={18}
              className="mt-2"
            />
          )}
        </label>
      )}
    </div>
  );
}
