import { deflateSync, crc32 } from "node:zlib";

import { htmlToText } from "html-to-text";

import {
  resolveNotebookPageSize,
  type RemarkablePageSize,
} from "@/lib/remarkable-page-size";
import { safeTitle } from "@/lib/utils";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const PAPER = { r: 252, g: 251, b: 247 };
const INK = { r: 23, g: 23, b: 23 };
const MUTED = { r: 70, g: 70, b: 70 };
const RULE = { r: 214, g: 208, b: 196 };

type BlockKind =
  | "heading1"
  | "heading2"
  | "heading3"
  | "paragraph"
  | "listItem"
  | "blockquote"
  | "code"
  | "tableRow";

interface ContentBlock {
  kind: BlockKind;
  text: string;
}

interface Glyph {
  width: number;
  rows: number[];
}

const FONT_ROWS = 7;

// 5x7 columns packed as 7-bit rows for printable ASCII 32-126.
const FONT_PACKED =
  "0000000" +
  "0404040400040" +
  "0a0a000000000" +
  "0a1f0a1f0a00" +
  "0e150e151c00" +
  "12120408121200" +
  "0c12130d191600" +
  "0408000000000" +
  "0408080808040" +
  "0804040404080" +
  "000a040a00000" +
  "0004041f04000" +
  "0000000004080" +
  "0000001f00000" +
  "0000000004040" +
  "0102040810000" +
  "0e111315110e0" +
  "040c0404040e0" +
  "0e11020c101f0" +
  "1e010601011e0" +
  "060a121f02020" +
  "1f101e01011e0" +
  "0608101e111e0" +
  "1f01020408080" +
  "0e111e11110e0" +
  "0e11110f010c0" +
  "0004000004000" +
  "0004000004080" +
  "0204081008040" +
  "00001f001f000" +
  "0804020102040" +
  "0e11020400040" +
  "0e111315100e0" +
  "0e11111f11110" +
  "1e111e11111e0" +
  "0e111010110e0" +
  "1c121111121c0" +
  "1f101e10101f0" +
  "1f101e1010100" +
  "0e111017110e0" +
  "11111f1111110" +
  "0e040404040e0" +
  "07020202120c0" +
  "1112141812110" +
  "10101010101f0" +
  "111b151111110" +
  "1119151311110" +
  "0e111111110e0" +
  "1e111e1010100" +
  "0e111111130f0" +
  "1e111e1211110" +
  "0f101e01011e0" +
  "1f04040404040" +
  "11111111110e0" +
  "111111110a040" +
  "111111151b110" +
  "11110a040a110" +
  "11110a0404040" +
  "1f010204081f0" +
  "0e080808080e0" +
  "1008040201000" +
  "0e020202020e0" +
  "040a110000000" +
  "000000000001f" +
  "0804000000000" +
  "000e011f110f0" +
  "10101e11111e0" +
  "000e1110110e0" +
  "01010f11110f0" +
  "000e111f100e0" +
  "0608170404040" +
  "000f11110f011e" +
  "10101e1111110" +
  "04000404040e0" +
  "0200020202120c" +
  "10101214181210" +
  "0c040404040e0" +
  "0001a15151110" +
  "001e111111110" +
  "000e1111110e0" +
  "001e11111e1010" +
  "000f11110f0101" +
  "001a141010100" +
  "000e100e011e0" +
  "040e040404030" +
  "00111111110f0" +
  "001111110a040" +
  "001111151b110" +
  "00110a040a110" +
  "001111110f011e" +
  "001f0204081f0" +
  "0604081008040" +
  "0404040404040" +
  "0c020102020c0" +
  "0008091600000";

function parsePackedGlyph(packed: string): Glyph {
  const rows: number[] = [];
  for (let index = 0; index < packed.length; index += 2) {
    rows.push(Number.parseInt(packed.slice(index, index + 2) || "00", 16) || 0);
  }
  while (rows.length < FONT_ROWS) {
    rows.push(0);
  }
  return {
    rows: rows.slice(0, FONT_ROWS),
    width: 5,
  };
}

const GLYPHS = new Map<string, Glyph>();

for (let code = 32; code <= 126; code += 1) {
  const start = (code - 32) * 7;
  GLYPHS.set(
    String.fromCharCode(code),
    parsePackedGlyph(FONT_PACKED.slice(start * 2, start * 2 + 14)),
  );
}

function pngChunk(type: string, data: Buffer) {
  const typeBuffer = Buffer.from(type, "ascii");
  const header = Buffer.alloc(4);
  header.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuffer, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput) >>> 0, 0);
  return Buffer.concat([header, typeBuffer, data, crc]);
}

export function encodeRgbPng(
  width: number,
  height: number,
  pixels: Uint8Array,
) {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    raw.set(pixels.subarray(y * stride, y * stride + stride), dest + 1);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

class RasterCanvas {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.pixels = new Uint8Array(width * height * 3);
    this.fill(PAPER);
  }

  fill(color: { r: number; g: number; b: number }) {
    for (let index = 0; index < this.pixels.length; index += 3) {
      this.pixels[index] = color.r;
      this.pixels[index + 1] = color.g;
      this.pixels[index + 2] = color.b;
    }
  }

  setPixel(
    x: number,
    y: number,
    color: { r: number; g: number; b: number },
  ) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }

    const index = (y * this.width + x) * 3;
    this.pixels[index] = color.r;
    this.pixels[index + 1] = color.g;
    this.pixels[index + 2] = color.b;
  }

  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    color: { r: number; g: number; b: number },
  ) {
    const minX = Math.max(0, Math.floor(x));
    const minY = Math.max(0, Math.floor(y));
    const maxX = Math.min(this.width, Math.ceil(x + width));
    const maxY = Math.min(this.height, Math.ceil(y + height));

    for (let py = minY; py < maxY; py += 1) {
      for (let px = minX; px < maxX; px += 1) {
        this.setPixel(px, py, color);
      }
    }
  }

  drawGlyph(
    glyph: Glyph,
    x: number,
    y: number,
    scale: number,
    color: { r: number; g: number; b: number },
  ) {
    for (let row = 0; row < glyph.rows.length; row += 1) {
      const bits = glyph.rows[row] ?? 0;
      for (let column = 0; column < glyph.width; column += 1) {
        if (((bits >> (glyph.width - 1 - column)) & 1) === 1) {
          this.fillRect(
            x + column * scale,
            y + row * scale,
            scale,
            scale,
            color,
          );
        }
      }
    }
  }

  measureText(text: string, scale: number) {
    return Array.from(text).reduce((width, character) => {
      const glyph = GLYPHS.get(character) ?? GLYPHS.get("?")!;
      return width + (glyph.width + 1) * scale;
    }, 0);
  }

  drawText(
    text: string,
    x: number,
    y: number,
    scale: number,
    color: { r: number; g: number; b: number },
  ) {
    let cursor = x;
    for (const character of text) {
      const glyph = GLYPHS.get(character) ?? GLYPHS.get("?")!;
      this.drawGlyph(glyph, cursor, y, scale, color);
      cursor += (glyph.width + 1) * scale;
    }
    return cursor;
  }

  wrapText(text: string, scale: number, maxWidth: number) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";

    const fits = (value: string) => this.measureText(value, scale) <= maxWidth;

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (fits(next)) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      if (fits(word)) {
        current = word;
        continue;
      }

      let segment = "";
      for (const character of word) {
        const test = `${segment}${character}`;
        if (fits(test)) {
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

    return lines.length > 0 ? lines : [""];
  }

  toPng() {
    return encodeRgbPng(this.width, this.height, this.pixels);
  }
}

const BLOCK_PATTERN =
  /<(pre|blockquote|h1|h2|h3|p|li|tr)\b[^>]*>([\s\S]*?)<\/\1>/gi;

function toPrintableText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/•/g, "*")
    .replace(/…/g, "...")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

function extractBlocks(normalizedHtml: string, title: string) {
  const source = normalizedHtml
    .replace(/^<article[^>]*>/i, "")
    .replace(/<\/article>\s*$/i, "")
    .trim();
  const blocks: ContentBlock[] = [];

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
    const text = toPrintableText(
      htmlToText(innerHtml, {
        wordwrap: 10_000,
        selectors: [
          { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
          { selector: "img", format: "skip" },
        ],
      }),
    ).trim();

    if (!text || !kind) {
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

function blockStyle(kind: BlockKind) {
  switch (kind) {
    case "heading1":
      return { scale: 5, gap: 28, indent: 0, prefix: "", color: INK };
    case "heading2":
      return { scale: 4, gap: 22, indent: 0, prefix: "", color: INK };
    case "heading3":
      return { scale: 4, gap: 18, indent: 0, prefix: "", color: INK };
    case "listItem":
      return { scale: 3, gap: 14, indent: 28, prefix: "* ", color: INK };
    case "blockquote":
      return { scale: 3, gap: 16, indent: 24, prefix: "", color: MUTED };
    case "code":
      return { scale: 3, gap: 16, indent: 16, prefix: "", color: INK };
    case "tableRow":
      return { scale: 3, gap: 12, indent: 8, prefix: "", color: INK };
    default:
      return { scale: 3, gap: 18, indent: 0, prefix: "", color: INK };
  }
}

export interface RenderedContentPage {
  height: number;
  pngBytes: Buffer;
  width: number;
}

export function renderHtmlPagesToPng(input: {
  normalizedHtml: string;
  pageSize?: Partial<RemarkablePageSize>;
  plainText?: string;
  title: string;
}): RenderedContentPage[] {
  const pageSize = resolveNotebookPageSize(input.pageSize);
  const margin = 72;
  const usableWidth = pageSize.width - margin * 2;
  const blocks = extractBlocks(input.normalizedHtml, input.title);
  const fallback =
    blocks.length > 0
      ? blocks
      : (input.plainText ?? "")
          .split(/\n{2,}/)
          .map((text) => text.trim())
          .filter(Boolean)
          .map((text) => ({ kind: "paragraph" as const, text: toPrintableText(text) }));

  const pages: RenderedContentPage[] = [];
  let canvas = new RasterCanvas(pageSize.width, pageSize.height);
  let cursorY = margin;

  canvas.fillRect(margin, margin - 18, usableWidth, 3, RULE);
  canvas.drawText(toPrintableText(safeTitle(input.title)), margin, cursorY, 5, INK);
  cursorY += 5 * FONT_ROWS + 36;

  const flushPage = () => {
    pages.push({
      height: pageSize.height,
      pngBytes: canvas.toPng(),
      width: pageSize.width,
    });
    canvas = new RasterCanvas(pageSize.width, pageSize.height);
    cursorY = margin;
  };

  const ensureRoom = (needed: number) => {
    if (cursorY + needed > pageSize.height - margin) {
      flushPage();
    }
  };

  for (const block of fallback) {
    const style = blockStyle(block.kind);
    const text = `${style.prefix}${block.text}`;
    const lines =
      block.kind === "code"
        ? text.split("\n").map((line) => toPrintableText(line))
        : canvas.wrapText(text, style.scale, usableWidth - style.indent);
    const lineHeight = style.scale * FONT_ROWS + 8;
    ensureRoom(lineHeight * Math.max(lines.length, 1) + style.gap);

    if (block.kind === "blockquote") {
      canvas.fillRect(margin, cursorY, 6, lineHeight * Math.max(lines.length, 1), RULE);
    }

    for (const line of lines) {
      ensureRoom(lineHeight);
      canvas.drawText(
        line,
        margin + style.indent,
        cursorY,
        style.scale,
        style.color,
      );
      cursorY += lineHeight;
    }
    cursorY += style.gap;
  }

  if (pages.length === 0 || cursorY > margin) {
    flushPage();
  }

  return pages;
}

export function createMarkerPng(input: {
  height?: number;
  label: string;
  width?: number;
}) {
  const width = input.width ?? 64;
  const height = input.height ?? 64;
  const canvas = new RasterCanvas(width, height);
  canvas.fill({ r: 255, g: 237, b: 117 });
  canvas.fillRect(4, 4, width - 8, height - 8, { r: 23, g: 23, b: 23 });
  canvas.fillRect(8, 8, width - 16, height - 16, { r: 255, g: 237, b: 117 });
  canvas.drawText(toPrintableText(input.label), 12, 20, 2, INK);
  return canvas.toPng();
}

export function pngContainsChunk(png: Buffer, type: string) {
  return png.includes(Buffer.from(type, "ascii"));
}

export function isPngBuffer(bytes: Buffer | Uint8Array) {
  return Buffer.from(bytes.subarray(0, 8)).equals(PNG_SIGNATURE);
}
