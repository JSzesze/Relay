import { randomUUID } from "node:crypto";

import {
  DEFAULT_NOTEBOOK_PAGE_SIZE,
  resolveNotebookPageSize,
  type RemarkablePageSize,
} from "@/lib/remarkable-page-size";

const RM_HEADER = Buffer.from(
  "reMarkable .lines file, version=6          ",
  "ascii",
);

const DEFAULT_AUTHOR_BYTES = Buffer.from(
  "9fa55b4943c95c2bb4553682f6948906",
  "hex",
);

const IMAGE_FLAGS = [17, 0];
const IMAGE_TRIANGLE_INDICES = [0, 1, 2, 2, 3, 0];

enum TagType {
  Id = 0x0f,
  Length4 = 0x0c,
  Byte8 = 0x08,
  Byte4 = 0x04,
  Byte1 = 0x01,
}

export interface RemarkableImagePlacement {
  fileName: string;
  height: number;
  uuid: string;
  width: number;
  x: number;
  y: number;
}

export interface WriteImageRmPageInput {
  authorBytes?: Buffer;
  images: Array<
    Omit<RemarkableImagePlacement, "uuid"> & {
      flags?: number[];
      uuid?: string;
    }
  >;
  pageSize?: Partial<RemarkablePageSize>;
}

class V6Writer {
  private readonly chunks: Buffer[] = [];

  writeBytes(value: Buffer | Uint8Array) {
    this.chunks.push(Buffer.from(value));
  }

  writeUint8(value: number) {
    this.chunks.push(Buffer.from([value & 0xff]));
  }

  writeUint16(value: number) {
    const buffer = Buffer.alloc(2);
    buffer.writeUInt16LE(value, 0);
    this.chunks.push(buffer);
  }

  writeUint32(value: number) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32LE(value >>> 0, 0);
    this.chunks.push(buffer);
  }

  writeFloat32(value: number) {
    const buffer = Buffer.alloc(4);
    buffer.writeFloatLE(value, 0);
    this.chunks.push(buffer);
  }

  writeFloat64(value: number) {
    const buffer = Buffer.alloc(8);
    buffer.writeDoubleLE(value, 0);
    this.chunks.push(buffer);
  }

  writeVarUint(value: number) {
    let remaining = value >>> 0;

    while (true) {
      const byte = remaining & 0x7f;
      remaining >>>= 7;
      if (remaining === 0) {
        this.writeUint8(byte);
        return;
      }
      this.writeUint8(byte | 0x80);
    }
  }

  writeTag(index: number, type: TagType) {
    this.writeVarUint((index << 4) | type);
  }

  writeTaggedBool(index: number, value: boolean) {
    this.writeTag(index, TagType.Byte1);
    this.writeUint8(value ? 1 : 0);
  }

  writeTaggedId(index: number, author: number, id: number) {
    this.writeTag(index, TagType.Id);
    this.writeUint8(author);
    this.writeVarUint(id);
  }

  writeTaggedInt(index: number, value: number) {
    this.writeTag(index, TagType.Byte4);
    this.writeUint32(value);
  }

  writeSubblock(index: number, payload: Buffer) {
    this.writeTag(index, TagType.Length4);
    this.writeUint32(payload.length);
    this.writeBytes(payload);
  }

  toBuffer() {
    return Buffer.concat(this.chunks);
  }
}

function withWriter(write: (writer: V6Writer) => void) {
  const writer = new V6Writer();
  write(writer);
  return writer.toBuffer();
}

function writeBlock(
  blockType: number,
  minVersion: number,
  currentVersion: number,
  payload: Buffer,
) {
  return withWriter((writer) => {
    writer.writeUint32(payload.length);
    writer.writeUint8(0);
    writer.writeUint8(minVersion);
    writer.writeUint8(currentVersion);
    writer.writeUint8(blockType);
    writer.writeBytes(payload);
  });
}

function writeUuidBytes(uuid: string) {
  const hex = uuid.replaceAll("-", "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) {
    throw new Error(`Invalid image UUID: ${uuid}`);
  }

  return Buffer.from(hex, "hex");
}

function writeTaggedString(index: number, value: string) {
  const bytes = Buffer.from(value, "utf8");
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      withWriter((inner) => {
        inner.writeVarUint(bytes.length);
        inner.writeUint8(1);
        inner.writeBytes(bytes);
      }),
    );
  });
}

function writeLwwString(
  index: number,
  author: number,
  valueId: number,
  value: string,
) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      Buffer.concat([
        withWriter((inner) => inner.writeTaggedId(1, author, valueId)),
        writeTaggedString(2, value),
      ]),
    );
  });
}

function writeLwwBool(
  index: number,
  author: number,
  valueId: number,
  value: boolean,
) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      withWriter((inner) => {
        inner.writeTaggedId(1, author, valueId);
        inner.writeTaggedBool(2, value);
      }),
    );
  });
}

function writeLwwBytes(
  index: number,
  author: number,
  valueId: number,
  bytes: number[],
) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      Buffer.concat([
        withWriter((inner) => inner.writeTaggedId(1, author, valueId)),
        withWriter((inner) => inner.writeSubblock(2, Buffer.from(bytes))),
      ]),
    );
  });
}

function writeLwwUuid(
  index: number,
  author: number,
  valueId: number,
  uuid: string,
) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      Buffer.concat([
        withWriter((inner) => inner.writeTaggedId(1, author, valueId)),
        withWriter((inner) => inner.writeSubblock(2, writeUuidBytes(uuid))),
      ]),
    );
  });
}

function writeLwwId(
  index: number,
  timestampAuthor: number,
  timestampId: number,
  valueAuthor: number,
  valueId: number,
) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      withWriter((inner) => {
        inner.writeTaggedId(1, timestampAuthor, timestampId);
        inner.writeTaggedId(2, valueAuthor, valueId);
      }),
    );
  });
}

function writeFloatSequence(index: number, values: number[]) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      withWriter((inner) => {
        inner.writeVarUint(values.length);
        for (const value of values) {
          inner.writeFloat32(value);
        }
      }),
    );
  });
}

function writeIntSequence(index: number, values: number[]) {
  return withWriter((writer) => {
    writer.writeSubblock(
      index,
      withWriter((inner) => {
        inner.writeVarUint(values.length);
        for (const value of values) {
          inner.writeUint32(value);
        }
      }),
    );
  });
}

function writeAuthorIdsBlock(authorBytes: Buffer) {
  return writeBlock(
    0x09,
    1,
    1,
    withWriter((writer) => {
      writer.writeVarUint(1);
      writer.writeSubblock(
        0,
        withWriter((inner) => {
          inner.writeVarUint(authorBytes.length);
          inner.writeBytes(authorBytes);
          inner.writeUint16(1);
        }),
      );
    }),
  );
}

function writeMigrationInfoBlock() {
  return writeBlock(
    0x00,
    1,
    1,
    withWriter((writer) => {
      writer.writeTaggedId(1, 1, 1);
      writer.writeTaggedBool(2, true);
    }),
  );
}

function writePageInfoBlock() {
  return writeBlock(
    0x0a,
    0,
    1,
    withWriter((writer) => {
      writer.writeTaggedInt(1, 1);
      writer.writeTaggedInt(2, 0);
      writer.writeTaggedInt(3, 0);
      writer.writeTaggedInt(4, 0);
    }),
  );
}

function writeSceneInfoBlock(pageSize: RemarkablePageSize) {
  return writeBlock(
    0x0d,
    1,
    1,
    Buffer.concat([
      writeLwwId(1, 1, 1, 0, 0),
      withWriter((writer) => {
        writer.writeSubblock(
          5,
          withWriter((inner) => {
            inner.writeUint32(pageSize.width);
            inner.writeUint32(pageSize.height);
          }),
        );
      }),
    ]),
  );
}

function writeSceneTreeBlock() {
  return writeBlock(
    0x01,
    1,
    1,
    withWriter((writer) => {
      writer.writeTaggedId(1, 0, 11);
      writer.writeTaggedId(2, 0, 0);
      writer.writeTaggedBool(3, true);
      writer.writeSubblock(
        4,
        withWriter((inner) => inner.writeTaggedId(1, 0, 1)),
      );
    }),
  );
}

function writeTreeNodeBlock(
  nodeAuthor: number,
  nodeId: number,
  label: string,
  labelTimestamp: number,
) {
  return writeBlock(
    0x02,
    1,
    1,
    Buffer.concat([
      withWriter((writer) => writer.writeTaggedId(1, nodeAuthor, nodeId)),
      writeLwwString(2, 0, labelTimestamp, label),
      writeLwwBool(3, 0, labelTimestamp, true),
    ]),
  );
}

function writeSceneGroupItemBlock() {
  return writeBlock(
    0x04,
    1,
    1,
    withWriter((writer) => {
      writer.writeTaggedId(1, 0, 1);
      writer.writeTaggedId(2, 0, 13);
      writer.writeTaggedId(3, 0, 0);
      writer.writeTaggedId(4, 0, 0);
      writer.writeTaggedInt(5, 0);
      writer.writeSubblock(
        6,
        withWriter((inner) => {
          inner.writeUint8(0x02);
          inner.writeTaggedId(2, 0, 11);
        }),
      );
    }),
  );
}

function sceneX(x: number, pageWidth: number) {
  return x - pageWidth / 2;
}

function imageVertices(
  image: RemarkableImagePlacement,
  pageWidth: number,
) {
  const left = sceneX(image.x, pageWidth);
  const right = sceneX(image.x + image.width, pageWidth);
  const top = image.y;
  const bottom = image.y + image.height;

  return [
    left,
    top,
    0,
    0,
    right,
    top,
    1,
    0,
    right,
    bottom,
    1,
    1,
    left,
    bottom,
    0,
    1,
  ];
}

function writeImageInfoBlock(
  images: Array<RemarkableImagePlacement & { flags: number[]; timestampId: number }>,
) {
  return writeBlock(
    0x0e,
    3,
    3,
    withWriter((writer) => {
      writer.writeSubblock(
        1,
        withWriter((list) => {
          list.writeVarUint(images.length);
          for (const image of images) {
            list.writeSubblock(
              0,
              Buffer.concat([
                writeUuidBytes(image.uuid),
                writeLwwString(1, 1, image.timestampId, image.fileName),
                writeLwwBytes(2, 0, 0, image.flags),
              ]),
            );
          }
        }),
      );
    }),
  );
}

function writeImageItemBlock(
  image: RemarkableImagePlacement,
  itemId: number,
  leftId: number,
  pageWidth: number,
) {
  return writeBlock(
    0x0f,
    2,
    2,
    withWriter((writer) => {
      writer.writeTaggedId(1, 0, 11);
      writer.writeTaggedId(2, 1, itemId);
      writer.writeTaggedId(3, leftId === 0 ? 0 : 1, leftId);
      writer.writeTaggedId(4, 0, 0);
      writer.writeTaggedInt(5, 0);
      writer.writeSubblock(
        6,
        Buffer.concat([
          Buffer.from([0x07]),
          writeLwwUuid(1, 1, itemId + 2, image.uuid),
          withWriter((inner) => inner.writeTaggedId(2, 1, itemId + 1)),
          writeFloatSequence(3, imageVertices(image, pageWidth)),
          writeIntSequence(4, IMAGE_TRIANGLE_INDICES),
        ]),
      );
    }),
  );
}

export function normalizeImageUuid(uuid?: string) {
  const value = uuid ?? randomUUID();
  const hex = value.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) {
    throw new Error(`Invalid image UUID: ${value}`);
  }

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

export function writeImageRmPage(input: WriteImageRmPageInput) {
  if (input.images.length === 0) {
    throw new Error("An image page requires at least one PNG placement.");
  }

  const pageSize = resolveNotebookPageSize(input.pageSize);
  const images = input.images.map((image, index) => {
    if (image.width <= 0 || image.height <= 0) {
      throw new Error("Image width and height must be positive.");
    }

    return {
      fileName: image.fileName,
      flags: image.flags ?? IMAGE_FLAGS,
      height: image.height,
      timestampId: 14 + index * 4 + 3,
      uuid: normalizeImageUuid(image.uuid),
      width: image.width,
      x: image.x,
      y: image.y,
    };
  });

  const parts = [
    RM_HEADER,
    writeAuthorIdsBlock(input.authorBytes ?? DEFAULT_AUTHOR_BYTES),
    writeMigrationInfoBlock(),
    writePageInfoBlock(),
    writeSceneInfoBlock(pageSize),
    writeImageInfoBlock(images),
    writeSceneTreeBlock(),
    writeTreeNodeBlock(0, 1, "", 12),
    writeTreeNodeBlock(0, 11, "Layer 1", 14),
    writeSceneGroupItemBlock(),
  ];

  let previousItemId = 0;
  let itemId = 14;
  for (const image of images) {
    parts.push(writeImageItemBlock(image, itemId, previousItemId, pageSize.width));
    previousItemId = itemId;
    itemId += 4;
  }

  return Buffer.concat(parts);
}

export function fullPageImagePlacement(
  fileName: string,
  pageSize: RemarkablePageSize = DEFAULT_NOTEBOOK_PAGE_SIZE,
  inset = 36,
): Omit<RemarkableImagePlacement, "uuid"> {
  return {
    fileName,
    height: Math.max(1, pageSize.height - inset * 2),
    width: Math.max(1, pageSize.width - inset * 2),
    x: inset,
    y: inset,
  };
}
