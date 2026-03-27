import "server-only";

import { htmlToText } from "html-to-text";
import { marked } from "marked";
import sanitizeHtml from "sanitize-html";
import { z } from "zod";
import { safeTitle } from "@/lib/utils";
import type { SourceType } from "@/lib/types";

const URLSchema = z.string().url();

export interface PreparedContent {
  title: string;
  sourceType: SourceType;
  rawSource: string;
  normalizedHtml: string;
  plainText: string;
}

function sanitize(input: string) {
  return sanitizeHtml(input, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "h3",
      "pre",
      "code",
      "blockquote",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ]),
    allowedAttributes: {
      a: ["href", "name", "target"],
      img: ["src", "alt"],
      "*": ["class"],
    },
  });
}

function toPlainText(html: string) {
  return htmlToText(html, {
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
    wordwrap: 100,
  }).trim();
}

function extractTitleFromHtml(html: string) {
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch?.[1]) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/i);
  if (h1Match?.[1]) {
    return h1Match[1].replace(/<[^>]+>/g, "").trim();
  }
  return undefined;
}

async function prepareUrlContent(url: string, explicitTitle?: string) {
  URLSchema.parse(url);
  const response = await fetch(url, {
    headers: {
      "User-Agent": "RemarkableSend/0.1 (+https://remarkable.com/)",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL (${response.status})`);
  }

  const rawHtml = await response.text();
  const sanitized = sanitize(rawHtml);
  const title = safeTitle(explicitTitle ?? extractTitleFromHtml(rawHtml), url);

  return {
    title,
    sourceType: "url" as const,
    rawSource: url,
    normalizedHtml: `<article><h1>${title}</h1>${sanitized}</article>`,
    plainText: toPlainText(sanitized),
  };
}

async function prepareMarkdownContent(markdown: string, explicitTitle?: string) {
  const rendered = await marked.parse(markdown);
  const sanitized = sanitize(rendered);
  const firstLine = markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const title = safeTitle(explicitTitle ?? firstLine, "Markdown send");

  return {
    title,
    sourceType: "markdown" as const,
    rawSource: markdown,
    normalizedHtml: `<article><h1>${title}</h1>${sanitized}</article>`,
    plainText: toPlainText(sanitized),
  };
}

function prepareHtmlContent(html: string, explicitTitle?: string) {
  const sanitized = sanitize(html);
  const title = safeTitle(explicitTitle ?? extractTitleFromHtml(html), "HTML send");
  return {
    title,
    sourceType: "html" as const,
    rawSource: html,
    normalizedHtml: `<article><h1>${title}</h1>${sanitized}</article>`,
    plainText: toPlainText(sanitized),
  };
}

function prepareTextContent(text: string, explicitTitle?: string) {
  const title = safeTitle(explicitTitle, "Text send");
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${part.replace(/\n/g, "<br />")}</p>`)
    .join("");

  return {
    title,
    sourceType: "text" as const,
    rawSource: text,
    normalizedHtml: `<article><h1>${title}</h1>${paragraphs}</article>`,
    plainText: text.trim(),
  };
}

export async function prepareContent(input: {
  sourceType: Exclude<SourceType, "pdf">;
  title?: string;
  content: string;
}): Promise<PreparedContent> {
  switch (input.sourceType) {
    case "url":
      return prepareUrlContent(input.content, input.title);
    case "markdown":
      return prepareMarkdownContent(input.content, input.title);
    case "html":
      return prepareHtmlContent(input.content, input.title);
    case "text":
      return prepareTextContent(input.content, input.title);
  }

  const exhaustiveCheck: never = input.sourceType;
  throw new Error(`Unsupported source type: ${exhaustiveCheck}`);
}
