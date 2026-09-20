const CASTAGNOLI = 0x82f63b78;
const TABLE = new Uint32Array(256);

for (let index = 0; index < 256; index += 1) {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? CASTAGNOLI ^ (crc >>> 1) : crc >>> 1;
  }
  TABLE[index] = crc >>> 0;
}

export function crc32c(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const value of bytes) {
    crc = TABLE[(crc ^ value) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

export function crc32cBase64(bytes: Uint8Array) {
  const digest = crc32c(bytes);
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(digest);
  return buffer.toString("base64");
}
