"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SourceType } from "@/lib/types";

const sourceTypes: { value: SourceType; label: string; hint: string }[] = [
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

export function SendForm({ connected }: { connected: boolean }) {
  const router = useRouter();
  const [sourceType, setSourceType] = useState<SourceType>("markdown");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState(
    "# Reading note\n\nPaste markdown here, then send it to reMarkable as a PDF.",
  );
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");

  const previewPromise = useMemo(() => {
    if (sourceType === "markdown") {
      return Promise.resolve(marked.parse(content)).then((result) =>
        sanitizePreview(result),
      );
    }
    if (sourceType === "html") {
      return Promise.resolve(sanitizePreview(content));
    }
    if (sourceType === "text") {
      return Promise.resolve(
        sanitizePreview(
          content
            .split(/\n{2,}/)
            .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`)
            .join(""),
        ),
      );
    }
    return Promise.resolve("");
  }, [content, sourceType]);

  useEffect(() => {
    let active = true;
    previewPromise.then((result) => {
      if (active) {
        setPreviewHtml(result);
      }
    });
    return () => {
      active = false;
    };
  }, [previewPromise]);

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

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>New send</CardTitle>
          <CardDescription>
            Start with markdown, HTML, text, a URL, or an uploaded PDF. This
            MVP converts everything to a basic PDF before upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
      <form onSubmit={handleSubmit}>

        <div className="grid gap-3 md:grid-cols-2">
          {sourceTypes.map((option) => (
            <Button
              key={option.value}
              type="button"
              onClick={() => setSourceType(option.value)}
              variant={sourceType === option.value ? "default" : "outline"}
              className={`h-auto min-h-24 flex-col items-start rounded-[1.25rem] px-4 py-4 text-left ${
                sourceType === option.value
                  ? "text-white"
                  : "bg-[var(--panel)] text-neutral-800"
              }`}
            >
              <div className="text-sm font-semibold">{option.label}</div>
              <div
                className={`mt-2 text-xs leading-5 ${
                  sourceType === option.value ? "text-white/80" : "text-neutral-600"
                }`}
              >
                {option.hint}
              </div>
            </Button>
          ))}
        </div>

        <div className="mt-6 space-y-4">
          <label className="block text-sm font-medium text-neutral-800">
            Title
            <Input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
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
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                className="mt-2 block w-full cursor-pointer py-2"
              />
            </label>
          ) : (
            <label className="block text-sm font-medium text-neutral-800">
              {sourceType === "url" ? "URL" : "Content"}
              {sourceType === "url" ? (
                <Input
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  placeholder="https://example.com/article"
                  className="mt-2"
                />
              ) : (
                <Textarea
                  value={content}
                  onChange={(event) => setContent(event.target.value)}
                  rows={18}
                  className="mt-2"
                />
              )}
            </label>
          )}

          {!connected ? (
            <p className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/8 px-4 py-3 text-sm font-medium text-[var(--danger)]">
              Connect a reMarkable account in Settings before sending content.
            </p>
          ) : null}

          {error ? (
            <p className="text-sm font-medium text-[var(--danger)]">{error}</p>
          ) : null}

          <Button
            type="submit"
            variant="accent"
            disabled={isPending || !connected}
          >
            {isPending ? "Sending..." : "Convert and Push"}
          </Button>
        </div>
      </form>
        </CardContent>
      </Card>

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
    </div>
  );
}
