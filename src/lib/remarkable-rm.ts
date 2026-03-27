import "server-only";

const RM_HEADER_PREFIX = "reMarkable .lines file, version=";
const RM_HEADER_LENGTH = 43;
const DEFAULT_PAGE_WIDTH = 1404;
const DEFAULT_PAGE_HEIGHT = 1872;
const PAPER_BACKGROUND = "#fcfbf7";
const TEXT_TOP_Y = -88;
const TEXT_DOCUMENT_TOP_Y_CRDT_ID = 0xfffffffffffe;
const TEXT_DOCUMENT_BOTTOM_Y_CRDT_ID = 0xffffffffffff;

const END_MARKER_KEY = "__end__";
const START_MARKER_KEY = "__start__";

enum TagType {
  Id = 0x0f,
  Length4 = 0x0c,
  Byte8 = 0x08,
  Byte4 = 0x04,
  Byte1 = 0x01,
}

interface CrdtId {
  part1: number;
  part2: number;
}

interface LwwValue<T> {
  timestamp: CrdtId;
  value: T;
}

interface SequenceItem<T> {
  itemId: CrdtId;
  leftId: CrdtId;
  rightId: CrdtId;
  deletedLength: number;
  value: T;
}

interface RemarkableRmGlyphRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RemarkableRmHighlight {
  color: number;
  length: number;
  start?: number;
  text: string;
  rectangles: RemarkableRmGlyphRectangle[];
}

export interface RemarkableRmPoint {
  x: number;
  y: number;
  speed: number;
  direction: number;
  width: number;
  pressure: number;
}

export interface RemarkableRmPath {
  pen: number;
  color: number;
  baseWidth: number;
  points: RemarkableRmPoint[];
}

export interface RemarkableRmLayer {
  index: number;
  paths: RemarkableRmPath[];
}

export interface RemarkableRmTextParagraph {
  startId: CrdtId;
  style: number;
  text: string;
}

export interface RemarkableRmTextBlock {
  posX: number;
  posY: number;
  width: number;
  paragraphs: RemarkableRmTextParagraph[];
  text: string;
}

export interface RemarkableRmGroupAnchor {
  id: CrdtId;
  originX: number;
  threshold?: number;
  type?: number;
}

export interface RemarkableRmRenderGroup {
  id: CrdtId;
  anchor?: RemarkableRmGroupAnchor;
  children: RemarkableRmRenderGroup[];
  highlights: RemarkableRmHighlight[];
  label?: string;
  paths: RemarkableRmPath[];
  visible: boolean;
}

export interface RemarkableRmPage {
  version: number;
  layers: RemarkableRmLayer[];
  groups?: RemarkableRmRenderGroup[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  paperSize?: {
    height: number;
    width: number;
  };
  text: RemarkableRmTextBlock | null;
}

export interface RenderRemarkableRmSvgOptions {
  viewport?: "content" | "page";
}

interface V6TreeNodeMeta {
  anchor?: RemarkableRmGroupAnchor;
  label?: string;
  visible: boolean;
}

interface V6TextCharacter {
  id: CrdtId;
  value: string;
}

interface V6TextLayoutLine {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  startId: CrdtId;
  text: string;
  x: number;
  y: number;
}

interface V6TextLayoutData {
  anchorSoftOffsets: Map<string, number>;
  anchorXPositions: Map<string, number>;
  anchors: Map<string, { x: number; y: number }>;
  bottomY: number;
  lines: V6TextLayoutLine[];
  newlineOffsets: Map<string, number>;
}

interface SvgBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

class V6Reader {
  private readonly view: DataView;
  private readonly buffer: Buffer;
  private offset = 0;

  constructor(input: Buffer) {
    this.buffer = input;
    this.view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  }

  tell() {
    return this.offset;
  }

  seek(offset: number) {
    this.offset = offset;
  }

  readHeader() {
    const header = this.readBytes(RM_HEADER_LENGTH).toString("ascii");
    if (header !== "reMarkable .lines file, version=6          ") {
      throw new Error("Unsupported v6 .rm page header.");
    }
  }

  readBytes(length: number) {
    const end = this.offset + length;
    if (end > this.buffer.length) {
      throw new Error("Unexpected end of .rm page.");
    }

    const value = this.buffer.subarray(this.offset, end);
    this.offset = end;
    return value;
  }

  readBool() {
    return this.readUint8() !== 0;
  }

  readUint8() {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  readUint16() {
    const value = this.view.getUint16(this.offset, true);
    this.offset += 2;
    return value;
  }

  readUint32() {
    const value = this.view.getUint32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat32() {
    const value = this.view.getFloat32(this.offset, true);
    this.offset += 4;
    return value;
  }

  readFloat64() {
    const value = this.view.getFloat64(this.offset, true);
    this.offset += 8;
    return value;
  }

  readVarUint() {
    let shift = 0;
    let result = 0;

    while (true) {
      const value = this.readUint8();
      result |= (value & 0x7f) << shift;
      shift += 7;

      if ((value & 0x80) === 0) {
        break;
      }
    }

    return result;
  }

  readCrdtId() {
    return {
      part1: this.readUint8(),
      part2: this.readVarUint(),
    } satisfies CrdtId;
  }

  private readTagValues() {
    const value = this.readVarUint();
    return {
      index: value >> 4,
      type: value & 0x0f,
    };
  }

  checkTag(index: number, type: TagType) {
    const position = this.tell();

    try {
      const tag = this.readTagValues();
      return tag.index === index && tag.type === type;
    } catch {
      return false;
    } finally {
      this.seek(position);
    }
  }

  readTag(index: number, type: TagType) {
    const position = this.tell();
    const tag = this.readTagValues();

    if (tag.index !== index || tag.type !== type) {
      this.seek(position);
      throw new Error(
        `Unexpected v6 tag at ${position}: expected ${index}/${type}, got ${tag.index}/${tag.type}`,
      );
    }
  }

  readId(index: number) {
    this.readTag(index, TagType.Id);
    return this.readCrdtId();
  }

  readBoolValue(index: number) {
    this.readTag(index, TagType.Byte1);
    return this.readBool();
  }

  readByte(index: number) {
    this.readTag(index, TagType.Byte1);
    return this.readUint8();
  }

  readInt(index: number) {
    this.readTag(index, TagType.Byte4);
    return this.readUint32();
  }

  readFloat(index: number) {
    this.readTag(index, TagType.Byte4);
    return this.readFloat32();
  }

  readDouble(index: number) {
    this.readTag(index, TagType.Byte8);
    return this.readFloat64();
  }

  readIntPair(index: number) {
    return this.readSubblock(index, () => ({
      width: this.readUint32(),
      height: this.readUint32(),
    }));
  }

  readString(index: number) {
    return this.readSubblock(index, (end) => {
      const stringLength = this.readVarUint();
      if (this.tell() >= end) {
        return "";
      }

      this.readBool();
      return this.readBytes(stringLength).toString("utf8");
    });
  }

  readStringWithFormat(index: number) {
    return this.readSubblock(index, (end) => {
      const stringLength = this.readVarUint();
      if (this.tell() >= end) {
        return { format: undefined, text: "" };
      }

      this.readBool();
      const text = this.readBytes(stringLength).toString("utf8");
      const format =
        this.tell() < end && this.checkTag(2, TagType.Byte4)
          ? this.readInt(2)
          : undefined;

      return { format, text };
    });
  }

  readLwwBool(index: number) {
    return this.readSubblock(index, () => ({
      timestamp: this.readId(1),
      value: this.readBoolValue(2),
    })) satisfies LwwValue<boolean>;
  }

  readLwwByte(index: number) {
    return this.readSubblock(index, () => ({
      timestamp: this.readId(1),
      value: this.readByte(2),
    })) satisfies LwwValue<number>;
  }

  readLwwFloat(index: number) {
    return this.readSubblock(index, () => ({
      timestamp: this.readId(1),
      value: this.readFloat(2),
    })) satisfies LwwValue<number>;
  }

  readLwwId(index: number) {
    return this.readSubblock(index, () => ({
      timestamp: this.readId(1),
      value: this.readId(2),
    })) satisfies LwwValue<CrdtId>;
  }

  readLwwString(index: number) {
    return this.readSubblock(index, () => ({
      timestamp: this.readId(1),
      value: this.readString(2),
    })) satisfies LwwValue<string>;
  }

  readSubblock<T>(index: number, reader: (end: number) => T) {
    this.readTag(index, TagType.Length4);
    const length = this.readUint32();
    const end = this.tell() + length;
    const value = reader(end);
    this.seek(end);
    return value;
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function createEmptyBounds(): SvgBounds {
  return {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
}

function hasBounds(bounds: SvgBounds) {
  return Number.isFinite(bounds.minX) &&
    Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) &&
    Number.isFinite(bounds.maxY);
}

function includePoint(bounds: SvgBounds, x: number, y: number) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function includeRect(
  bounds: SvgBounds,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  includePoint(bounds, x, y);
  includePoint(bounds, x + width, y + height);
}

function mergeBounds(target: SvgBounds, source: SvgBounds) {
  if (!hasBounds(source)) {
    return;
  }

  includePoint(target, source.minX, source.minY);
  includePoint(target, source.maxX, source.maxY);
}

function getStrokeColor(color: number) {
  switch (color) {
    case 1:
      return "#7b7b7b";
    case 2:
      return "#ffffff";
    case 3:
      return "#f3d24f";
    case 4:
      return "#4ba66d";
    case 5:
      return "#d76b6b";
    case 6:
      return "#4b85d1";
    case 7:
      return "#d76b6b";
    case 8:
      return "#7b7b7b";
    case 9:
      return "#f3d24f";
    case 10:
      return "#4ba66d";
    case 11:
      return "#4b85d1";
    case 12:
      return "#d76bb6";
    case 13:
      return "#f3d24f";
    default:
      return "#111111";
  }
}

function getHighlightColor(color: number) {
  switch (color) {
    case 4:
    case 10:
      return "#7bd88f";
    case 5:
    case 12:
      return "#f0a8c7";
    case 6:
    case 11:
      return "#8dc1ff";
    default:
      return "#f6e27a";
  }
}

function getStrokeOpacity(pen: number) {
  if (pen === 5 || pen === 18 || pen === 23) {
    return 0.28;
  }

  return 1;
}

function getPenWidthMultiplier(pen: number) {
  switch (pen) {
    case 4:
    case 17:
      return 0.5;
    case 2:
    case 15:
      return 0.58;
    case 1:
    case 14:
      return 0.62;
    case 7:
    case 13:
      return 0.52;
    case 3:
    case 16:
      return 0.72;
    case 0:
    case 12:
      return 0.8;
    case 5:
    case 18:
    case 23:
      return 0.9;
    default:
      return 0.6;
  }
}

function getStrokeWidth(path: RemarkableRmPath) {
  const averagePressure =
    path.points.length > 0
      ? path.points.reduce((sum, point) => sum + point.pressure, 0) /
        path.points.length
      : 255;
  const averagePointWidth =
    path.points.length > 0
      ? path.points.reduce((sum, point) => sum + point.width, 0) /
        path.points.length
      : 1;

  const normalizedPressure =
    averagePressure > 1 ? averagePressure / 255 : averagePressure;
  const normalizedWidth =
    averagePointWidth > 4 ? averagePointWidth / 4 : averagePointWidth;
  const width = path.baseWidth *
    getPenWidthMultiplier(path.pen) *
    Math.max(0.35, normalizedWidth * 0.85) *
    (0.6 + normalizedPressure * 0.22);

  return clamp(width, 0.45, 14);
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function crdtIdKey(value: CrdtId) {
  return `${value.part1}:${value.part2}`;
}

function compareCrdtIds(left: CrdtId, right: CrdtId) {
  if (left.part1 !== right.part1) {
    return left.part1 - right.part1;
  }

  return left.part2 - right.part2;
}

function parseLegacyRemarkableRmPage(buffer: Buffer, version: number) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = RM_HEADER_LENGTH;
  const layerCount = view.getUint32(offset, true);
  offset += 4;

  const layers: RemarkableRmLayer[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxY = 0;

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const pathCount = view.getUint32(offset, true);
    offset += 4;

    const paths: RemarkableRmPath[] = [];

    for (let pathIndex = 0; pathIndex < pathCount; pathIndex += 1) {
      const pen = view.getUint32(offset, true);
      const color = view.getUint32(offset + 4, true);
      const baseWidth = view.getFloat32(offset + 12, true);
      const pointCount = view.getUint32(offset + 20, true);
      offset += 24;

      const points: RemarkableRmPoint[] = [];

      for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
        const point = {
          x: view.getFloat32(offset, true),
          y: view.getFloat32(offset + 4, true),
          speed: view.getFloat32(offset + 8, true),
          direction: view.getFloat32(offset + 12, true),
          width: view.getFloat32(offset + 16, true),
          pressure: view.getFloat32(offset + 20, true),
        } satisfies RemarkableRmPoint;

        offset += 24;
        points.push(point);
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }

      paths.push({ pen, color, baseWidth, points });
    }

    layers.push({ index: layerIndex, paths });
  }

  return {
    version,
    layers,
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    maxX,
    maxY,
    text: null,
  } satisfies RemarkableRmPage;
}

function readV6Point(reader: V6Reader, version: number) {
  const x = reader.readFloat32();
  const y = reader.readFloat32();

  if (version === 1) {
    return {
      x,
      y,
      speed: reader.readFloat32() * 4,
      direction: (255 * reader.readFloat32()) / (Math.PI * 2),
      width: Math.round(reader.readFloat32() * 4),
      pressure: reader.readFloat32() * 255,
    } satisfies RemarkableRmPoint;
  }

  return {
    x,
    y,
    speed: reader.readUint16(),
    width: reader.readUint16(),
    direction: reader.readUint8(),
    pressure: reader.readUint8(),
  } satisfies RemarkableRmPoint;
}

function parseV6Line(reader: V6Reader, version: number) {
  const pen = reader.readInt(1);
  const color = reader.readInt(2);
  const baseWidth = reader.readDouble(3);
  reader.readFloat(4);
  const points = reader.readSubblock(5, (end) => {
    const values: RemarkableRmPoint[] = [];
    while (reader.tell() < end) {
      values.push(readV6Point(reader, version));
    }
    return values;
  });
  reader.readId(6);

  if (reader.checkTag(7, TagType.Id)) {
    reader.readId(7);
  }

  return {
    pen,
    color,
    baseWidth,
    points,
  } satisfies RemarkableRmPath;
}

function parseV6GlyphRange(reader: V6Reader) {
  const start = reader.checkTag(2, TagType.Byte4) ? reader.readInt(2) : undefined;
  const length = reader.checkTag(3, TagType.Byte4) ? reader.readInt(3) : undefined;
  const color = reader.readInt(4);
  const text = reader.readString(5);
  const rectangles = reader.readSubblock(6, () => {
    const count = reader.readVarUint();
    const values: RemarkableRmGlyphRectangle[] = [];

    for (let index = 0; index < count; index += 1) {
      values.push({
        x: reader.readFloat64(),
        y: reader.readFloat64(),
        width: reader.readFloat64(),
        height: reader.readFloat64(),
      });
    }

    return values;
  });

  return {
    color,
    length: length ?? Array.from(text).length,
    rectangles,
    start,
    text,
  } satisfies RemarkableRmHighlight;
}

function parseV6TextItem(reader: V6Reader) {
  return reader.readSubblock(0, () => {
    const itemId = reader.readId(2);
    const leftId = reader.readId(3);
    const rightId = reader.readId(4);
    const deletedLength = reader.readInt(5);
    let value: string | number = "";

    if (reader.checkTag(6, TagType.Length4)) {
      const result = reader.readStringWithFormat(6);
      value = result.format ?? result.text;
    }

    return {
      deletedLength,
      itemId,
      leftId,
      rightId,
      value,
    } satisfies SequenceItem<string | number>;
  });
}

function parseV6TextStyles(reader: V6Reader) {
  const charId = reader.readCrdtId();
  reader.readId(1);
  const style = reader.readSubblock(2, () => {
    reader.readUint8();
    return reader.readUint8();
  });

  return [charId, style] as const;
}

function toposortItems<T>(items: Array<SequenceItem<T>>) {
  if (items.length === 0) {
    return [] as Array<SequenceItem<T>>;
  }

  const itemMap = new Map(items.map((item) => [crdtIdKey(item.itemId), item]));

  function resolveSideId(id: CrdtId, side: "left" | "right") {
    const key = crdtIdKey(id);

    if (id.part1 === 0 && id.part2 === 0) {
      return side === "left" ? START_MARKER_KEY : END_MARKER_KEY;
    }

    if (!itemMap.has(key)) {
      return side === "left" ? START_MARKER_KEY : END_MARKER_KEY;
    }

    return key;
  }

  const deps = new Map<string, Set<string>>();

  for (const item of items) {
    const itemKey = crdtIdKey(item.itemId);
    const leftKey = resolveSideId(item.leftId, "left");
    const rightKey = resolveSideId(item.rightId, "right");

    if (!deps.has(itemKey)) {
      deps.set(itemKey, new Set());
    }
    deps.get(itemKey)!.add(leftKey);

    if (!deps.has(rightKey)) {
      deps.set(rightKey, new Set());
    }
    deps.get(rightKey)!.add(itemKey);
  }

  for (const depSet of deps.values()) {
    for (const dep of depSet) {
      if (!deps.has(dep)) {
        deps.set(dep, new Set());
      }
    }
  }

  const ordered: Array<SequenceItem<T>> = [];

  while (true) {
    const next = [...deps.entries()]
      .filter(([, value]) => value.size === 0)
      .map(([key]) => key);

    if (next.length === 1 && next[0] === END_MARKER_KEY) {
      break;
    }

    if (next.length === 0) {
      throw new Error("Invalid v6 CRDT ordering.");
    }

    next
      .filter((key) => itemMap.has(key))
      .sort((left, right) =>
        compareCrdtIds(itemMap.get(left)!.itemId, itemMap.get(right)!.itemId),
      )
      .forEach((key) => {
        ordered.push(itemMap.get(key)!);
      });

    const nextSet = new Set(next);
    for (const key of next) {
      deps.delete(key);
    }
    for (const value of deps.values()) {
      for (const key of nextSet) {
        value.delete(key);
      }
    }
  }

  return ordered;
}

function buildV6TextBlock(
  items: Array<SequenceItem<string | number>>,
  styles: Map<string, number>,
  posX: number,
  posY: number,
  width: number,
) {
  const characters: V6TextCharacter[] = [];

  for (const item of toposortItems(items)) {
    if (item.deletedLength > 0 || typeof item.value !== "string") {
      continue;
    }

    const valueCharacters = Array.from(item.value);
    valueCharacters.forEach((value, offset) => {
      characters.push({
        id: {
          part1: item.itemId.part1,
          part2: item.itemId.part2 + offset,
        },
        value,
      });
    });
  }

  if (characters.length === 0) {
    return null;
  }

  const paragraphs: RemarkableRmTextParagraph[] = [];
  let currentStartId: CrdtId | null = null;
  let currentText = "";

  function pushParagraph() {
    if (!currentStartId) {
      return;
    }

    paragraphs.push({
      startId: currentStartId,
      style: styles.get(crdtIdKey(currentStartId)) ?? 1,
      text: currentText,
    });
    currentStartId = null;
    currentText = "";
  }

  for (const character of characters) {
    if (!currentStartId) {
      currentStartId = character.id;
    }

    if (character.value === "\n") {
      pushParagraph();
      continue;
    }

    currentText += character.value;
  }

  pushParagraph();

  return {
    paragraphs,
    posX,
    posY,
    text: paragraphs.map((paragraph) => paragraph.text).join("\n"),
    width,
  } satisfies RemarkableRmTextBlock;
}

function getParagraphMetrics(style: number) {
  switch (style) {
    case 2:
      return {
        fontFamily: "ui-serif, Georgia, serif",
        fontSize: 52,
        fontWeight: 600,
        lineHeight: 139,
        prefix: "",
        softLineHeight: 60,
        spaceAfter: 24,
        xOffset: 0,
      };
    case 4:
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 28,
        fontWeight: 450,
        lineHeight: 34.75,
        prefix: "• ",
        softLineHeight: 40,
        spaceAfter: 8,
        xOffset: 34,
      };
    case 5:
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 26,
        fontWeight: 450,
        lineHeight: 34.75,
        prefix: "– ",
        softLineHeight: 40,
        spaceAfter: 8,
        xOffset: 58,
      };
    case 6:
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 28,
        fontWeight: 450,
        lineHeight: 34.75,
        prefix: "☐ ",
        softLineHeight: 40,
        spaceAfter: 10,
        xOffset: 40,
      };
    case 7:
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 28,
        fontWeight: 450,
        lineHeight: 34.75,
        prefix: "☑ ",
        softLineHeight: 40,
        spaceAfter: 10,
        xOffset: 40,
      };
    case 3:
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 31,
        fontWeight: 700,
        lineHeight: 69.5,
        prefix: "",
        softLineHeight: 40,
        spaceAfter: 0,
        xOffset: 0,
      };
    default:
      return {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 30,
        fontWeight: 450,
        lineHeight: 69.5,
        prefix: "",
        softLineHeight: 60,
        spaceAfter: 0,
        xOffset: 0,
      };
  }
}

function buildTextLayout(text: RemarkableRmTextBlock | null) {
  const lines: V6TextLayoutLine[] = [];
  const anchors = new Map<string, { x: number; y: number }>();
  const anchorXPositions = new Map<string, number>();
  const anchorSoftOffsets = new Map<string, number>();
  const newlineOffsets = new Map<string, number>();

  if (!text || text.paragraphs.length === 0) {
    return {
      anchors,
      anchorSoftOffsets,
      anchorXPositions,
      bottomY: 0,
      lines,
      newlineOffsets,
    } satisfies V6TextLayoutData;
  }

  let yOffset = TEXT_TOP_Y;
  let firstAnchorY = 0;
  let lastY = 0;
  let previousMetrics: ReturnType<typeof getParagraphMetrics> | null = null;

  function estimateCharacterAdvance(character: string, fontSize: number) {
    if (character === " ") {
      return fontSize * 0.34;
    }

    if (/[.,;:'"()]/.test(character)) {
      return fontSize * 0.28;
    }

    if (/[A-Z]/.test(character)) {
      return fontSize * 0.62;
    }

    return fontSize * 0.52;
  }

  text.paragraphs.forEach((paragraph, paragraphIndex) => {
    const metrics = getParagraphMetrics(paragraph.style);
    const segments = paragraph.text.split("\u2028");
    const anchorY = text.posY + yOffset + metrics.lineHeight;
    const anchorX = text.posX + metrics.xOffset;

    if (paragraphIndex === 0) {
      firstAnchorY = anchorY;
    }

    anchors.set(crdtIdKey(paragraph.startId), {
      x: anchorX,
      y: anchorY,
    });
    anchorXPositions.set(crdtIdKey(paragraph.startId), anchorX);
    anchorSoftOffsets.set(crdtIdKey(paragraph.startId), 0);

    if (paragraphIndex > 0 && previousMetrics) {
      newlineOffsets.set(
        crdtIdKey(paragraph.startId),
        metrics.lineHeight + previousMetrics.spaceAfter,
      );
    }

    segments.forEach((segment, segmentIndex) => {
      const y = anchorY + segmentIndex * metrics.softLineHeight;
      lines.push({
        fontFamily: metrics.fontFamily,
        fontSize: metrics.fontSize,
        fontWeight: metrics.fontWeight,
        startId: paragraph.startId,
        text: `${segmentIndex === 0 ? metrics.prefix : ""}${segment}`,
        x: anchorX,
        y,
      });
      lastY = y;
    });

    let currentX = anchorX;
    let currentY = anchorY;
    let currentSoftOffset = 0;
    const characters = Array.from(paragraph.text);

    characters.forEach((character, characterIndex) => {
      const id = {
        part1: paragraph.startId.part1,
        part2: paragraph.startId.part2 + characterIndex,
      } satisfies CrdtId;
      const key = crdtIdKey(id);

      anchors.set(key, { x: currentX, y: currentY });
      anchorXPositions.set(key, currentX);
      anchorSoftOffsets.set(key, currentSoftOffset);

      if (character === "\u2028") {
        currentSoftOffset += metrics.softLineHeight;
        currentY = anchorY + currentSoftOffset;
        currentX = anchorX;
        return;
      }

      currentX += estimateCharacterAdvance(character, metrics.fontSize);
    });

    yOffset +=
      metrics.lineHeight +
      Math.max(0, segments.length - 1) * metrics.softLineHeight +
      metrics.spaceAfter;
    previousMetrics = metrics;
  });

  anchors.set(
    crdtIdKey({ part1: 0, part2: TEXT_DOCUMENT_TOP_Y_CRDT_ID }),
    {
      x: text.posX,
      y: firstAnchorY,
    },
  );
  anchors.set(
    crdtIdKey({ part1: 0, part2: TEXT_DOCUMENT_BOTTOM_Y_CRDT_ID }),
    {
      x: text.posX,
      y: lastY,
    },
  );

  return {
    anchors,
    anchorSoftOffsets,
    anchorXPositions,
    bottomY: lastY,
    lines,
    newlineOffsets,
  };
}

function buildRenderGroup(
  nodeId: CrdtId,
  childGroupsByParent: Map<string, Array<SequenceItem<CrdtId>>>,
  glyphsByParent: Map<string, Array<SequenceItem<RemarkableRmHighlight>>>,
  linesByParent: Map<string, Array<SequenceItem<RemarkableRmPath>>>,
  nodeMeta: Map<string, V6TreeNodeMeta>,
): RemarkableRmRenderGroup {
  const nodeKey = crdtIdKey(nodeId);
  const meta = nodeMeta.get(nodeKey);

  return {
    anchor: meta?.anchor,
    children: toposortItems(childGroupsByParent.get(nodeKey) ?? []).map((item) =>
      buildRenderGroup(
        item.value,
        childGroupsByParent,
        glyphsByParent,
        linesByParent,
        nodeMeta,
      ),
    ),
    highlights: toposortItems(glyphsByParent.get(nodeKey) ?? []).map(
      (item) => item.value,
    ),
    id: nodeId,
    label: meta?.label,
    paths: toposortItems(linesByParent.get(nodeKey) ?? []).map((item) => item.value),
    visible: meta?.visible ?? true,
  };
}

function parseV6RemarkableRmPage(buffer: Buffer) {
  const reader = new V6Reader(buffer);
  reader.readHeader();

  const childGroupsByParent = new Map<string, Array<SequenceItem<CrdtId>>>();
  const glyphsByParent = new Map<string, Array<SequenceItem<RemarkableRmHighlight>>>();
  const linesByParent = new Map<string, Array<SequenceItem<RemarkableRmPath>>>();
  const nodeMeta = new Map<string, V6TreeNodeMeta>();
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = 0;
  let maxY = 0;
  let paperSize: RemarkableRmPage["paperSize"];
  let text: RemarkableRmTextBlock | null = null;

  while (reader.tell() < buffer.length) {
    if (reader.tell() + 8 > buffer.length) {
      break;
    }

    const blockSize = reader.readUint32();
    reader.readUint8();
    reader.readUint8();
    const currentVersion = reader.readUint8();
    const blockType = reader.readUint8();
    const blockEnd = reader.tell() + blockSize;

    try {
      if (blockType === 0x0d) {
        reader.readLwwId(1);

        if (reader.tell() < blockEnd && reader.checkTag(2, TagType.Length4)) {
          reader.readLwwBool(2);
        }
        if (reader.tell() < blockEnd && reader.checkTag(3, TagType.Length4)) {
          reader.readLwwBool(3);
        }
        if (reader.tell() < blockEnd && reader.checkTag(5, TagType.Length4)) {
          paperSize = reader.readIntPair(5);
        }
        continue;
      }

      if (blockType === 0x01) {
        const treeId = reader.readId(1);
        reader.readId(2);
        reader.readBoolValue(3);
        reader.readSubblock(4, () => {
          reader.readId(1);
        });

        if (!nodeMeta.has(crdtIdKey(treeId))) {
          nodeMeta.set(crdtIdKey(treeId), { visible: true });
        }
        continue;
      }

      if (blockType === 0x02) {
        const nodeId = reader.readId(1);
        const label = reader.readLwwString(2).value;
        const visible = reader.readLwwBool(3).value;
        const anchor =
          reader.tell() < blockEnd && reader.checkTag(7, TagType.Length4)
            ? {
                id: reader.readLwwId(7).value,
                originX:
                  reader.tell() < blockEnd && reader.checkTag(10, TagType.Length4)
                    ? reader.readLwwFloat(10).value
                    : 0,
                threshold:
                  reader.tell() < blockEnd && reader.checkTag(9, TagType.Length4)
                    ? reader.readLwwFloat(9).value
                    : undefined,
                type:
                  reader.tell() < blockEnd && reader.checkTag(8, TagType.Length4)
                    ? reader.readLwwByte(8).value
                    : undefined,
              }
            : undefined;

        nodeMeta.set(crdtIdKey(nodeId), {
          anchor,
          label,
          visible,
        });
        continue;
      }

      if (blockType === 0x07) {
        reader.readId(1);

        const textItems: Array<SequenceItem<string | number>> = [];
        const styles = new Map<string, number>();

        reader.readSubblock(2, () => {
          reader.readSubblock(1, () => {
            reader.readSubblock(1, () => {
              const count = reader.readVarUint();
              for (let index = 0; index < count; index += 1) {
                textItems.push(parseV6TextItem(reader));
              }
            });
          });

          reader.readSubblock(2, () => {
            reader.readSubblock(1, () => {
              const count = reader.readVarUint();
              for (let index = 0; index < count; index += 1) {
                const [charId, style] = parseV6TextStyles(reader);
                styles.set(crdtIdKey(charId), style);
              }
            });
          });
        });

        const position = reader.readSubblock(3, () => ({
          posX: reader.readFloat64(),
          posY: reader.readFloat64(),
        }));
        const width = reader.readFloat(4);
        text = buildV6TextBlock(
          textItems,
          styles,
          position.posX,
          position.posY,
          width,
        );
        continue;
      }

      if (blockType === 0x06 || blockType === 0x08) {
        continue;
      }

      if (blockType === 0x03 || blockType === 0x04 || blockType === 0x05) {
        const parentId = reader.readId(1);
        const itemId = reader.readId(2);
        const leftId = reader.readId(3);
        const rightId = reader.readId(4);
        const deletedLength = reader.readInt(5);

        if (!reader.checkTag(6, TagType.Length4)) {
          continue;
        }

        const sceneItem = reader.readSubblock(6, () => {
          const itemType = reader.readUint8();

          if (blockType === 0x03 && itemType === 0x01) {
            return {
              kind: "glyph",
              itemType,
              value: parseV6GlyphRange(reader),
            } as const;
          }

          if (blockType === 0x04 && itemType === 0x02) {
            return {
              kind: "group",
              itemType,
              value: reader.readId(2),
            } as const;
          }

          if (blockType === 0x05 && itemType === 0x03) {
            return {
              kind: "line",
              itemType,
              value: parseV6Line(reader, currentVersion),
            } as const;
          }

          return {
            kind: "unsupported",
            itemType,
          } as const;
        });

        if (deletedLength !== 0) {
          continue;
        }

        if (sceneItem.kind === "unsupported") {
          continue;
        }

        if (sceneItem.kind === "glyph") {
          const parentKey = crdtIdKey(parentId);
          if (!glyphsByParent.has(parentKey)) {
            glyphsByParent.set(parentKey, []);
          }
          glyphsByParent.get(parentKey)!.push({
            deletedLength,
            itemId,
            leftId,
            rightId,
            value: sceneItem.value,
          });

          for (const rectangle of sceneItem.value.rectangles) {
            minX = Math.min(minX, rectangle.x);
            minY = Math.min(minY, rectangle.y);
            maxX = Math.max(maxX, rectangle.x + rectangle.width);
            maxY = Math.max(maxY, rectangle.y + rectangle.height);
          }
          continue;
        }

        if (sceneItem.kind === "group") {
          const parentKey = crdtIdKey(parentId);
          if (!childGroupsByParent.has(parentKey)) {
            childGroupsByParent.set(parentKey, []);
          }
          childGroupsByParent.get(parentKey)!.push({
            deletedLength,
            itemId,
            leftId,
            rightId,
            value: sceneItem.value,
          });
          continue;
        }

        const parentKey = crdtIdKey(parentId);
        if (!linesByParent.has(parentKey)) {
          linesByParent.set(parentKey, []);
        }
        linesByParent.get(parentKey)!.push({
          deletedLength,
          itemId,
          leftId,
          rightId,
          value: sceneItem.value,
        });

        for (const point of sceneItem.value.points) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
      }
    } finally {
      reader.seek(blockEnd);
    }
  }

  const rootKey = crdtIdKey({ part1: 0, part2: 1 });
  const rootGroups = toposortItems(childGroupsByParent.get(rootKey) ?? []);
  const groups =
    rootGroups.length > 0
      ? rootGroups.map((group) =>
          buildRenderGroup(
            group.value,
            childGroupsByParent,
            glyphsByParent,
            linesByParent,
            nodeMeta,
          ),
        )
      : [
          {
            children: toposortItems(childGroupsByParent.get(rootKey) ?? []).map(
              (group) =>
                buildRenderGroup(
                  group.value,
                  childGroupsByParent,
                  glyphsByParent,
                  linesByParent,
                  nodeMeta,
                ),
            ),
            highlights: toposortItems(glyphsByParent.get(rootKey) ?? []).map(
              (item) => item.value,
            ),
            id: { part1: 0, part2: 1 },
            paths: toposortItems(linesByParent.get(rootKey) ?? []).map(
              (item) => item.value,
            ),
            visible: true,
          } satisfies RemarkableRmRenderGroup,
        ];

  const textLayout = buildTextLayout(text);
  const textMaxX = text ? text.posX + text.width : 0;
  const textMaxY = textLayout.bottomY;
  const textMinX = text ? text.posX : Number.POSITIVE_INFINITY;
  const textMinY =
    textLayout.lines.length > 0
      ? textLayout.lines.reduce((lowest, line) => Math.min(lowest, line.y), Number.POSITIVE_INFINITY)
      : Number.POSITIVE_INFINITY;

  return {
    groups,
    layers: [],
    minX: Number.isFinite(Math.min(minX, textMinX))
      ? Math.min(minX, textMinX)
      : 0,
    minY: Number.isFinite(Math.min(minY, textMinY))
      ? Math.min(minY, textMinY)
      : 0,
    maxX: Math.max(maxX, textMaxX),
    maxY: Math.max(maxY, textMaxY),
    paperSize,
    text,
    version: 6,
  } satisfies RemarkableRmPage;
}

function renderPath(path: RemarkableRmPath) {
  if (path.points.length === 0) {
    return "";
  }

  const points = path.points
    .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
    .join(" ");

  return `<polyline fill="none" stroke="${getStrokeColor(path.color)}" stroke-opacity="${getStrokeOpacity(
    path.pen,
  )}" stroke-width="${getStrokeWidth(path).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" points="${escapeXml(
    points,
  )}" />`;
}

function renderHighlight(highlight: RemarkableRmHighlight) {
  return highlight.rectangles
    .map(
      (rectangle) =>
        `<rect x="${rectangle.x.toFixed(2)}" y="${rectangle.y.toFixed(
          2,
        )}" width="${rectangle.width.toFixed(2)}" height="${rectangle.height.toFixed(
          2,
        )}" rx="6" fill="${getHighlightColor(
          highlight.color,
        )}" fill-opacity="0.32" />`,
    )
    .join("");
}

function renderTextBlock(text: RemarkableRmTextBlock | null) {
  const { lines } = buildTextLayout(text);

  return lines
    .map(
      (line) =>
        `<text x="${line.x.toFixed(2)}" y="${line.y.toFixed(2)}" font-family="${escapeXml(
          line.fontFamily,
        )}" font-size="${line.fontSize}" font-weight="${line.fontWeight}" fill="#171717">${escapeXml(
          line.text,
        )}</text>`,
    )
    .join("");
}

function getTextLineWidth(line: V6TextLayoutLine) {
  return Math.max(line.fontSize * 0.55 * Array.from(line.text).length, line.fontSize * 0.6);
}

function getTextBounds(textLayout: V6TextLayoutData) {
  const bounds = createEmptyBounds();

  for (const line of textLayout.lines) {
    const width = getTextLineWidth(line);
    includeRect(
      bounds,
      line.x,
      line.y - line.fontSize * 0.9,
      width,
      line.fontSize * 1.25,
    );
  }

  return bounds;
}

function getGroupTransform(
  group: RemarkableRmRenderGroup,
  text: RemarkableRmTextBlock | null,
  textLayout: V6TextLayoutData,
) {
  if (!group.anchor) {
    return { x: 0, y: 0 };
  }

  const key = crdtIdKey(group.anchor.id);
  const anchor = textLayout.anchors.get(key);
  const x =
    group.anchor.type === 1 && group.anchor.originX === 0
      ? textLayout.anchorXPositions.get(key) ?? anchor?.x ?? text?.posX ?? 0
      : group.anchor.originX;
  let y = anchor?.y ?? 0;

  if (group.anchor.type === 1) {
    const softOffset = textLayout.anchorSoftOffsets.get(key) ?? 0;
    const firstContentLineOffset = 60;
    if (softOffset > firstContentLineOffset) {
      y -= softOffset - firstContentLineOffset;
    }
  }

  if (textLayout.newlineOffsets.has(key)) {
    y -= textLayout.newlineOffsets.get(key) ?? 0;
  }

  return {
    x,
    y,
  };
}

function getPathBounds(path: RemarkableRmPath, offsetX = 0, offsetY = 0) {
  const bounds = createEmptyBounds();
  const strokePadding = getStrokeWidth(path) * 0.75;

  for (const point of path.points) {
    includePoint(bounds, point.x + offsetX, point.y + offsetY);
  }

  if (hasBounds(bounds)) {
    bounds.minX -= strokePadding;
    bounds.minY -= strokePadding;
    bounds.maxX += strokePadding;
    bounds.maxY += strokePadding;
  }

  return bounds;
}

function getHighlightBounds(
  highlight: RemarkableRmHighlight,
  offsetX = 0,
  offsetY = 0,
) {
  const bounds = createEmptyBounds();

  for (const rectangle of highlight.rectangles) {
    includeRect(
      bounds,
      rectangle.x + offsetX,
      rectangle.y + offsetY,
      rectangle.width,
      rectangle.height,
    );
  }

  return bounds;
}

function getGroupBounds(
  group: RemarkableRmRenderGroup,
  text: RemarkableRmTextBlock | null,
  textLayout: V6TextLayoutData,
  parentOffsetX = 0,
  parentOffsetY = 0,
) {
  const bounds = createEmptyBounds();

  if (!group.visible) {
    return bounds;
  }

  const transform = getGroupTransform(group, text, textLayout);
  const offsetX = parentOffsetX + transform.x;
  const offsetY = parentOffsetY + transform.y;

  for (const path of group.paths) {
    mergeBounds(bounds, getPathBounds(path, offsetX, offsetY));
  }

  for (const highlight of group.highlights) {
    mergeBounds(bounds, getHighlightBounds(highlight, offsetX, offsetY));
  }

  for (const child of group.children) {
    mergeBounds(bounds, getGroupBounds(child, text, textLayout, offsetX, offsetY));
  }

  return bounds;
}

function renderGroup(
  group: RemarkableRmRenderGroup,
  text: RemarkableRmTextBlock | null,
  textLayout: V6TextLayoutData,
): string {
  if (!group.visible) {
    return "";
  }

  const transform = getGroupTransform(group, text, textLayout);
  const children = group.children
    .map((child) => renderGroup(child, text, textLayout))
    .join("");
  const highlights = group.highlights.map(renderHighlight).join("");
  const paths = group.paths.map(renderPath).join("");

  return `<g data-group="${escapeXml(
    crdtIdKey(group.id),
  )}" transform="translate(${transform.x.toFixed(2)} ${transform.y.toFixed(2)})">${highlights}${paths}${children}</g>`;
}

export function parseRemarkableRmPage(input: Buffer | ArrayBuffer) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);

  if (buffer.byteLength < RM_HEADER_LENGTH + 4) {
    throw new Error("Invalid .rm page: file is too small.");
  }

  const header = buffer.subarray(0, RM_HEADER_LENGTH).toString("ascii");
  if (!header.startsWith(RM_HEADER_PREFIX)) {
    throw new Error(
      "Unsupported .rm page: header does not match reMarkable lines format.",
    );
  }

  const versionMatch = header.match(/version=(\d+)/);
  const version = versionMatch ? Number.parseInt(versionMatch[1], 10) : NaN;
  if (!Number.isFinite(version) || version < 3 || version > 6) {
    throw new Error(
      `Unsupported .rm page version: ${versionMatch?.[1] ?? "unknown"}.`,
    );
  }

  if (version === 6) {
    return parseV6RemarkableRmPage(buffer);
  }

  return parseLegacyRemarkableRmPage(buffer, version);
}

export function renderRemarkableRmPageToSvg(
  page: RemarkableRmPage,
  options: RenderRemarkableRmSvgOptions = {},
) {
  const textLayout = buildTextLayout(page.text);
  const viewport = options.viewport ?? "content";
  const contentBounds = createEmptyBounds();

  if (page.groups) {
    for (const group of page.groups) {
      mergeBounds(contentBounds, getGroupBounds(group, page.text, textLayout));
    }
  } else {
    for (const layer of page.layers) {
      for (const path of layer.paths) {
        mergeBounds(contentBounds, getPathBounds(path));
      }
    }
  }

  mergeBounds(contentBounds, getTextBounds(textLayout));

  const contentPadding = 28;
  const minX = viewport === "page"
    ? 0
    : hasBounds(contentBounds)
      ? Math.floor(contentBounds.minX - contentPadding)
      : Math.floor(page.minX - contentPadding);
  const minY = viewport === "page"
    ? 0
    : hasBounds(contentBounds)
      ? Math.floor(contentBounds.minY - contentPadding)
      : Math.floor(page.minY - contentPadding);
  const maxX = viewport === "page"
    ? Math.max(page.paperSize?.width ?? DEFAULT_PAGE_WIDTH, DEFAULT_PAGE_WIDTH)
    : hasBounds(contentBounds)
      ? Math.ceil(contentBounds.maxX + contentPadding)
      : Math.ceil(page.maxX + contentPadding);
  const maxY = viewport === "page"
    ? Math.max(page.paperSize?.height ?? DEFAULT_PAGE_HEIGHT, DEFAULT_PAGE_HEIGHT)
    : hasBounds(contentBounds)
      ? Math.ceil(contentBounds.maxY + contentPadding)
      : Math.ceil(page.maxY + contentPadding);
  const width = maxX - minX;
  const height = maxY - minY;

  const body = page.groups
    ? page.groups
        .map((group) => renderGroup(group, page.text, textLayout))
        .join("")
    : page.layers
        .map((layer) => {
          const paths = layer.paths.map(renderPath).join("");
          return `<g data-layer="${layer.index}">${paths}</g>`;
        })
        .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX} ${minY} ${width} ${height}" width="${width}" height="${height}">
  <rect x="${minX}" y="${minY}" width="${width}" height="${height}" fill="${PAPER_BACKGROUND}" />
  <g data-root-text="1">${renderTextBlock(page.text)}</g>
  ${body}
</svg>`;
}
