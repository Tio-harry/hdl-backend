const zlib = require('zlib');

function makeCrc32Table() {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  return table;
}

const CRC32_TABLE = makeCrc32Table();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = CRC32_TABLE[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function toDosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980);
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

function buildZip(entries, createdAt = new Date()) {
  const fileEntries = entries.map((entry) => {
    const fileName = String(entry.name);
    const nameBuffer = Buffer.from(fileName, 'utf8');
    const contentBuffer = Buffer.isBuffer(entry.content)
      ? entry.content
      : Buffer.from(String(entry.content), 'utf8');
    const compressed = zlib.deflateRawSync(contentBuffer, { level: 9 });
    const checksum = crc32(contentBuffer);
    return {
      fileName,
      nameBuffer,
      contentBuffer,
      compressed,
      checksum,
    };
  });

  const { dosTime, dosDate } = toDosDateTime(createdAt);
  const localFileParts = [];
  const centralDirectoryParts = [];
  let offset = 0;

  for (const fileEntry of fileEntries) {
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(fileEntry.checksum, 14);
    localHeader.writeUInt32LE(fileEntry.compressed.length, 18);
    localHeader.writeUInt32LE(fileEntry.contentBuffer.length, 22);
    localHeader.writeUInt16LE(fileEntry.nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localFileParts.push(localHeader, fileEntry.nameBuffer, fileEntry.compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(fileEntry.checksum, 16);
    centralHeader.writeUInt32LE(fileEntry.compressed.length, 20);
    centralHeader.writeUInt32LE(fileEntry.contentBuffer.length, 24);
    centralHeader.writeUInt16LE(fileEntry.nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralDirectoryParts.push(centralHeader, fileEntry.nameBuffer);

    offset += localHeader.length + fileEntry.nameBuffer.length + fileEntry.compressed.length;
  }

  const centralDirectory = Buffer.concat(centralDirectoryParts);
  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(fileEntries.length, 8);
  endOfCentralDirectory.writeUInt16LE(fileEntries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfCentralDirectory.writeUInt32LE(offset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localFileParts, centralDirectory, endOfCentralDirectory]);
}

module.exports = {
  buildZip,
};
