#!/usr/bin/env tsx

import { writeNotebookPages } from "@/lib/notebook-pages";
import type { NotebookSourceType, NotebookWriteMode } from "@/lib/notebook-pages";

function readFlag(args: string[], name: string) {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return args[index + 1];
}

function hasFlag(args: string[], name: string) {
  return args.includes(name);
}

async function main() {
  const args = process.argv.slice(2);
  const mode = (args[0] ?? "") as NotebookWriteMode;

  if (mode !== "append" && mode !== "create") {
    console.error(
      [
        "Usage:",
        "  pnpm notebook create --title \"Notes\" --markdown \"# Hello\"",
        "  pnpm notebook append --name \"Journal\" --html \"<h1>Hi</h1>\"",
        "  pnpm notebook append --id <uuid> --text \"More notes\" --dry-run",
      ].join("\n"),
    );
    process.exit(1);
  }

  const markdown = readFlag(args, "--markdown");
  const html = readFlag(args, "--html");
  const text = readFlag(args, "--text");
  const sourceType: NotebookSourceType | undefined = markdown
    ? "markdown"
    : html
      ? "html"
      : text
        ? "text"
        : undefined;
  const content = markdown ?? html ?? text;

  if (!sourceType || !content) {
    throw new Error("Provide --markdown, --html, or --text.");
  }

  const result = await writeNotebookPages({
    content,
    dryRun: hasFlag(args, "--dry-run"),
    mode,
    parentId: readFlag(args, "--parent"),
    sourceType,
    target: {
      id: readFlag(args, "--id"),
      name: readFlag(args, "--name"),
      path: readFlag(args, "--path"),
    },
    title: readFlag(args, "--title"),
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
