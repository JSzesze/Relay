"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getPreviewHtml } from "@/components/send-form/preview";
import type { SourceType } from "@/lib/types";

export function useSendForm() {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceType>("markdown");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(
    "# Reading note\n\nPaste markdown here, then send it to reMarkable as a PDF.",
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const previewHtml = useMemo(
    () => getPreviewHtml(sourceType, content),
    [content, sourceType],
  );

  function handleSourceTypeChange(nextSourceType: SourceType) {
    setSourceType(nextSourceType);
    setError(null);

    if (nextSourceType !== "pdf") {
      setFile(null);
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    setError(null);

    try {
      const body = new FormData();
      body.set("sourceType", sourceType);
      body.set("title", title);

      if (sourceType === "pdf") {
        if (!file) {
          throw new Error("Choose a PDF file first.");
        }

        body.set("file", file);
      } else {
        body.set("content", content);
      }

      const response = await fetch("/api/send", {
        method: "POST",
        body,
      });
      const json = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(json.error ?? "Unable to send content.");
      }

      router.push("/dashboard/jobs");
      router.refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to send.");
    } finally {
      setIsPending(false);
    }
  }

  return {
    content,
    error,
    file,
    handleSourceTypeChange,
    handleSubmit,
    isPending,
    previewHtml,
    setContent,
    setFile,
    setTitle,
    sourceType,
    title,
  };
}
