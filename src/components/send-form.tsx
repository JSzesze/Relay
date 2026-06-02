"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputPanel } from "@/components/send-form/input-panel";
import { PreviewCard } from "@/components/send-form/preview-card";
import { SourceTypePicker } from "@/components/send-form/source-type-picker";
import { useSendForm } from "@/components/send-form/use-send-form";

export function SendForm({ connected }: { connected: boolean }) {
  const {
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
  } = useSendForm();

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>New send</CardTitle>
          <CardDescription>
            Start with markdown, HTML, text, a URL, or an uploaded PDF. This MVP
            converts everything to a basic PDF before upload.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit}>
            <SourceTypePicker
              sourceType={sourceType}
              onSelect={handleSourceTypeChange}
            />

            <InputPanel
              content={content}
              onContentChange={setContent}
              onFileChange={setFile}
              onTitleChange={setTitle}
              sourceType={sourceType}
              title={title}
            />

            <div className="space-y-4">
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

      <PreviewCard
        content={content}
        file={file}
        previewHtml={previewHtml}
        sourceType={sourceType}
      />
    </div>
  );
}
