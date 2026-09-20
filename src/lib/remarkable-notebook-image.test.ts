import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { crc32c } from "./crc32c";
import {
  buildImagePages,
  buildNotebookBundle,
  summarizeBundleFiles,
} from "./remarkable-notebook-bundle";
import { createMarkerPng, isPngBuffer } from "./remarkable-page-png";
import { parseRemarkableRmPage } from "./remarkable-rm";
import { writeImageRmPage } from "./remarkable-rm-write";
import {
  parseIndexCollection,
  serializeIndexCollection,
} from "./remarkable-sync/types";

const IMAGE_UUID = "11111111-2222-3333-4444-555555555555";
const IMAGE_FILE = `${IMAGE_UUID}.png`;

describe("crc32c", () => {
  it("matches the Castagnoli check value for 123456789", () => {
    assert.equal(crc32c(Buffer.from("123456789")), 0xe3069283);
  });
});

describe("image-in-.rm writer", () => {
  it("embeds a recognizable image blob that the v6 parser can read back", () => {
    const png = createMarkerPng({ label: "RMIMG", height: 96, width: 160 });
    assert.equal(isPngBuffer(png), true);
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");

    const rmBytes = writeImageRmPage({
      images: [
        {
          fileName: IMAGE_FILE,
          height: 2160 - 72,
          uuid: IMAGE_UUID,
          width: 1620 - 72,
          x: 36,
          y: 36,
        },
      ],
      pageSize: { height: 2160, width: 1620 },
    });

    assert.match(rmBytes.subarray(0, 43).toString("ascii"), /reMarkable \.lines file, version=6/);
    assert.equal(rmBytes.includes(Buffer.from(IMAGE_FILE, "utf8")), true);
    assert.equal(
      rmBytes.includes(Buffer.from(IMAGE_UUID.replaceAll("-", ""), "hex")),
      true,
    );
    assert.equal(rmBytes.includes(Buffer.from([0x0e])), true);
    assert.equal(rmBytes.includes(Buffer.from([0x0f])), true);

    const page = parseRemarkableRmPage(rmBytes);
    assert.equal(page.version, 6);
    assert.equal(page.paperSize?.width, 1620);
    assert.equal(page.paperSize?.height, 2160);
    assert.equal(page.images.length, 1);
    assert.equal(page.images[0]?.uuid, IMAGE_UUID);
    assert.equal(page.images[0]?.fileName, IMAGE_FILE);
    assert.ok((page.images[0]?.width ?? 0) > 1000);
    assert.ok((page.images[0]?.height ?? 0) > 1000);
  });
});

describe("notebook bundle", () => {
  it("stores the PNG beside the .rm page using the firmware image path", () => {
    const png = createMarkerPng({ label: "PAGE" });
    const [builtPage] = buildImagePages({
      pages: [{ pngBytes: png }],
    });

    assert.ok(builtPage);
    const page = parseRemarkableRmPage(builtPage.rmBytes);
    assert.equal(page.images[0]?.fileName, builtPage.fileName);
    assert.equal(page.images[0]?.uuid, builtPage.imageUuid);

    const bundle = buildNotebookBundle({
      pages: [builtPage],
      title: "Agent notebook",
    });
    const names = bundle.files.map((file) => file.name);
    const imageFile = bundle.files.find((file) =>
      file.name.endsWith(`/${builtPage.pageId}/${builtPage.fileName}`),
    );
    const rmFile = bundle.files.find((file) =>
      file.name.endsWith(`/${builtPage.pageId}.rm`),
    );
    const contentFile = bundle.files.find((file) => file.name.endsWith(".content"));

    assert.ok(imageFile);
    assert.ok(rmFile);
    assert.ok(contentFile);
    assert.equal(isPngBuffer(imageFile.bytes), true);
    assert.deepEqual(imageFile.bytes, png);
    assert.equal(bundle.content.fileType, "notebook");
    assert.equal(bundle.content.pageCount, 1);
    assert.equal(bundle.content.cPages?.pages?.[0]?.id, builtPage.pageId);
    assert.equal(names.some((name) => name.endsWith(".metadata")), true);

    const summary = summarizeBundleFiles(bundle.files);
    assert.equal(summary.length, bundle.files.length);
    assert.equal(summary[0]?.sha256.length, 64);
  });

  it("appends new image pages onto an existing content page list", () => {
    const first = buildImagePages({
      pages: [{ pngBytes: createMarkerPng({ label: "ONE" }) }],
    });
    const original = buildNotebookBundle({
      pages: first,
      title: "Journal",
    });
    const extra = buildImagePages({
      pages: [{ pngBytes: createMarkerPng({ label: "TWO" }) }],
    });
    const appended = buildNotebookBundle({
      content: original.content,
      documentId: original.documentId,
      existingFiles: original.files,
      metadata: original.metadata,
      pages: extra,
      title: "Journal",
    });

    assert.equal(appended.documentId, original.documentId);
    assert.equal(appended.content.pageCount, 2);
    assert.equal(appended.content.cPages?.pages?.length, 2);
    assert.ok(
      appended.files.some((file) =>
        file.name.endsWith(`/${first[0]!.pageId}.rm`),
      ),
    );
    assert.ok(
      appended.files.some((file) =>
        file.name.endsWith(`/${extra[0]!.pageId}.rm`),
      ),
    );
  });
});

describe("sync index format", () => {
  it("round-trips a schema 4 document collection", () => {
    const serialized = serializeIndexCollection({
      entries: [
        {
          documentId: "doc.metadata",
          hash: "a".repeat(64),
          size: 12,
          subfiles: 0,
          type: 0,
        },
        {
          documentId: "doc.content",
          hash: "b".repeat(64),
          size: 34,
          subfiles: 0,
          type: 0,
        },
      ],
      id: "doc",
    });
    const parsed = parseIndexCollection(serialized.bytes.toString("utf8"));

    assert.equal(parsed.schemaVersion, 4);
    assert.equal(parsed.entries.length, 2);
    assert.equal(parsed.entries[0]?.documentId, "doc.content");
    assert.equal(parsed.entries[1]?.size, 12);
  });
});
