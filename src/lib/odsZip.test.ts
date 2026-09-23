import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { readOdsContentXml, readZipEntry } from './odsZip';

interface ZipEntryInput {
  name: string;
  content: string;
  /** Sets the "sizes unknown, check data descriptor" flag (bit 3) and
   * zeroes the local header's own size fields — reproducing exactly what
   * broke the first version of this reader against a real .ods sample,
   * where `manifest.rdf` (an entry before `content.xml`) was written this
   * way. A robust reader must still find later entries via the central
   * directory, which always has the real sizes regardless of this flag. */
  streamed?: boolean;
}

/** Builds a complete, valid ZIP (local headers + central directory + EOCD)
 * with one or more entries — exercises the exact structure readZipEntry
 * parses, not just its happy path. */
function buildZip(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const centralDirEntries: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const contentBytes = encoder.encode(entry.content);
    const compressed = deflateRawSync(Buffer.from(contentBytes));
    const localHeaderOffset = offset;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, entry.streamed ? 0x0008 : 0, true);
    lv.setUint16(8, 8, true); // deflate
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0, true);
    lv.setUint32(14, 0, true); // crc32 unchecked
    lv.setUint32(18, entry.streamed ? 0 : compressed.length, true);
    lv.setUint32(22, entry.streamed ? 0 : contentBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    parts.push(local, compressed);
    offset += local.length + compressed.length;

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, entry.streamed ? 0x0008 : 0, true);
    cv.setUint16(10, 8, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0, true);
    cv.setUint32(16, 0, true);
    cv.setUint32(20, compressed.length, true); // always the real size
    cv.setUint32(24, contentBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, localHeaderOffset, true);
    central.set(nameBytes, 46);
    centralDirEntries.push(central);
  }

  const centralDirStart = offset;
  for (const c of centralDirEntries) {
    parts.push(c);
    offset += c.length;
  }
  const centralDirSize = offset - centralDirStart;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirStart, true);
  ev.setUint16(20, 0, true);
  parts.push(eocd);

  const total = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}

describe('readZipEntry / readOdsContentXml', () => {
  it('extracts and inflates a named entry from a real deflate-compressed zip', async () => {
    const xml = '<table:table><table:table-row/></table:table>';
    const zip = buildZip([{ name: 'content.xml', content: xml }]);
    expect(await readOdsContentXml(zip)).toBe(xml);
  });

  it('returns null for a missing entry', async () => {
    const zip = buildZip([{ name: 'content.xml', content: '<x/>' }]);
    expect(await readZipEntry(zip, 'meta.xml')).toBeNull();
  });

  it('finds content.xml after an earlier entry marked with unknown sizes (bit 3) — the exact real-world .ods case', async () => {
    const xml = '<table:table><table:table-row/></table:table>';
    const zip = buildZip([
      { name: 'mimetype', content: 'application/vnd.oasis.opendocument.spreadsheet' },
      { name: 'manifest.rdf', content: '<rdf/>', streamed: true },
      { name: 'content.xml', content: xml },
    ]);
    expect(await readOdsContentXml(zip)).toBe(xml);
  });
});
