import "server-only";

import { htmlToText } from "html-to-text";
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  rgb,
} from "pdf-lib";
import { safeTitle } from "@/lib/utils";

const PDF_TEXT_REPLACEMENTS: Record<string, string> = {
  "\u00A0": " ",
  "\u00B5": "u",
  "\u03BC": "u",
  "\u2013": "-",
  "\u2014": "-",
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2022": "*",
  "\u2026": "...",
  "\u2190": "<-",
  "\u2192": "->",
  "\u2212": "-",
};

type BlockKind =
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "listItem"
  | "blockquote"
  | "code"
  | "tableRow";

interface PdfBlock {
  kind: BlockKind;
  text: string;
}

interface BlockStyle {
  font: PDFFont;
  size: number;
  lineHeight: number;
  spacingBefore: number;
  spacingAfter: number;
  color: ReturnType<typeof rgb>;
  indent?: number;
  bullet?: string;
  box?: boolean;
  quote?: boolean;
}

const BLOCK_PATTERN =
  /<(pre|blockquote|h1|h2|h3|p|li|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;

function toPdfText(text: string) {
  return text
    .replace(
      /[\u00A0\u00B5\u03BC\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u2190\u2192\u2212]/g,
      (character) => PDF_TEXT_REPLACEMENTS[character] ?? character,
    )
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function stripContainerTags(html: string) {
  return html
    .replace(/^<article[^>]*>/i, "")
    .replace(/<\/article>\s*$/i, "")
    .trim();
}

function blockText(html: string) {
  return toPdfText(
    htmlToText(html, {
      wordwrap: 10_000,
      selectors: [
        { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
        { selector: "img", format: "skip" },
      ],
    }),
  ).trim();
}

function extractBlocks(normalizedHtml: string, title: string) {
  const source = stripContainerTags(normalizedHtml);
  const blocks: PdfBlock[] = [];

  for (const match of source.matchAll(BLOCK_PATTERN)) {
    const [, tag, innerHtml] = match;
    const kindMap: Record<string, BlockKind> = {
      h1: "heading1",
      h2: "heading2",
      h3: "heading3",
      p: "paragraph",
      li: "listItem",
      blockquote: "blockquote",
      pre: "code",
      tr: "tableRow",
    };

    const kind = kindMap[tag.toLowerCase()];
    const text = blockText(innerHtml);

    if (!text) {
      continue;
    }

    blocks.push({ kind, text });
  }

  if (
    blocks[0]?.kind === "heading1" &&
    blocks[0].text.localeCompare(safeTitle(title), undefined, {
      sensitivity: "accent",
    }) === 0
  ) {
    blocks.shift();
  }

  return blocks;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const rawLines = text.split("\n");
  const lines: string[] = [];

  for (const rawLine of rawLines) {
    const line = rawLine.trimEnd();
    if (!line) {
      lines.push("");
      continue;
    }

    const words = line.split(/\s+/).filter(Boolean);
    let current = "";

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
        current = word;
        continue;
      }

      let segment = "";
      for (const character of word) {
        const test = `${segment}${character}`;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
          segment = test;
        } else {
          if (segment) {
            lines.push(segment);
          }
          segment = character;
        }
      }
      current = segment;
    }

    if (current) {
      lines.push(current);
    }
  }

  return lines;
}

function wrapCodeText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
) {
  const lines: string[] = [];

  for (const rawLine of text.split("\n")) {
    if (!rawLine) {
      lines.push("");
      continue;
    }

    let current = "";
    for (const character of rawLine) {
      const test = `${current}${character}`;
      if (font.widthOfTextAtSize(test, size) <= maxWidth) {
        current = test;
        continue;
      }

      lines.push(current);
      current = character;
    }

    lines.push(current);
  }

  return lines;
}

export async function createPdfFromText(title: string, plainText: string) {
  const paragraphs = plainText
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${part.replace(/\n/g, "<br />")}</p>`)
    .join("");

  return createPdfFromHtml(title, `<article>${paragraphs}</article>`, plainText);
}

export async function createPdfFromHtml(
  title: string,
  normalizedHtml: string,
  plainTextFallback = "",
) {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);
  const mono = await doc.embedFont(StandardFonts.Courier);

  const pageWidth = 595;
  const pageHeight = 842;
  const margin = 56;
  const usableWidth = pageWidth - margin * 2;

  let page = doc.addPage([pageWidth, pageHeight]);
  let cursorY = pageHeight - margin;

  const ensureRoom = (requiredHeight: number) => {
    if (cursorY - requiredHeight < margin) {
      page = doc.addPage([pageWidth, pageHeight]);
      cursorY = pageHeight - margin;
    }
  };

  const styles: Record<BlockKind, BlockStyle> = {
    heading1: {
      font: bold,
      size: 18,
      lineHeight: 24,
      spacingBefore: 12,
      spacingAfter: 6,
      color: rgb(0.08, 0.08, 0.08),
    },
    heading2: {
      font: bold,
      size: 15,
      lineHeight: 20,
      spacingBefore: 12,
      spacingAfter: 4,
      color: rgb(0.1, 0.1, 0.1),
    },
    heading3: {
      font: bold,
      size: 13,
      lineHeight: 18,
      spacingBefore: 10,
      spacingAfter: 4,
      color: rgb(0.14, 0.14, 0.14),
    },
    paragraph: {
      font: regular,
      size: 11,
      lineHeight: 16,
      spacingBefore: 4,
      spacingAfter: 8,
      color: rgb(0.16, 0.16, 0.16),
    },
    listItem: {
      font: regular,
      size: 11,
      lineHeight: 16,
      spacingBefore: 2,
      spacingAfter: 4,
      color: rgb(0.16, 0.16, 0.16),
      indent: 18,
      bullet: "\u2022",
    },
    blockquote: {
      font: italic,
      size: 11,
      lineHeight: 16,
      spacingBefore: 6,
      spacingAfter: 8,
      color: rgb(0.28, 0.28, 0.28),
      indent: 18,
      quote: true,
    },
    code: {
      font: mono,
      size: 9,
      lineHeight: 12,
      spacingBefore: 8,
      spacingAfter: 10,
      color: rgb(0.14, 0.14, 0.14),
      indent: 12,
      box: true,
    },
    tableRow: {
      font: regular,
      size: 10,
      lineHeight: 14,
      spacingBefore: 2,
      spacingAfter: 4,
      color: rgb(0.18, 0.18, 0.18),
      indent: 8,
    },
  };

  page.drawText(toPdfText(safeTitle(title)), {
    x: margin,
    y: cursorY,
    font: bold,
    size: 20,
    color: rgb(0.08, 0.08, 0.08),
  });
  cursorY -= 30;

  const blocks = extractBlocks(normalizedHtml, title);
  const fallbackBlocks =
    blocks.length > 0
      ? blocks
      : plainTextFallback
          .split(/\n{2,}/)
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ kind: "paragraph" as const, text }));

  for (const block of fallbackBlocks) {
    const style = styles[block.kind];
    const indent = style.indent ?? 0;
    const blockWidth = usableWidth - indent - (style.bullet ? 12 : 0);
    const lines =
      block.kind === "code"
        ? wrapCodeText(block.text, style.font, style.size, blockWidth)
        : wrapText(block.text, style.font, style.size, blockWidth);
    const textHeight =
      Math.max(lines.length, 1) * style.lineHeight +
      style.spacingBefore +
      style.spacingAfter;
    const boxPadding = style.box ? 10 : 0;

    ensureRoom(textHeight + boxPadding * 2);
    cursorY -= style.spacingBefore;

    if (style.box) {
      const boxHeight = Math.max(lines.length, 1) * style.lineHeight + boxPadding * 2;
      page.drawRectangle({
        x: margin,
        y: cursorY - boxHeight + 6,
        width: usableWidth,
        height: boxHeight,
        color: rgb(0.96, 0.96, 0.94),
        borderColor: rgb(0.86, 0.86, 0.82),
        borderWidth: 1,
      });
    }

    if (style.quote) {
      page.drawLine({
        start: { x: margin + 4, y: cursorY + 4 },
        end: {
          x: margin + 4,
          y:
            cursorY -
            Math.max(lines.length, 1) * style.lineHeight -
            style.spacingAfter +
            6,
        },
        thickness: 2,
        color: rgb(0.72, 0.72, 0.72),
      });
    }

    const textX = margin + indent + (style.box ? boxPadding : 0) + (style.bullet ? 12 : 0);

    if (style.bullet) {
      page.drawText(toPdfText(style.bullet), {
        x: margin + indent,
        y: cursorY,
        font: bold,
        size: style.size,
        color: style.color,
      });
    }

    for (const line of lines) {
      ensureRoom(style.lineHeight + style.spacingAfter);
      page.drawText(line, {
        x: textX,
        y: cursorY,
        font: style.font,
        size: style.size,
        color: style.color,
      });
      cursorY -= style.lineHeight;
    }

    cursorY -= style.spacingAfter;
  }

  return doc.save();
}
