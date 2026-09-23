// Minimal ZIP reader — pulls a single named entry (`content.xml`) out of an
// .ods file (which is just a ZIP container) without a general-purpose zip
// library. Reads the End of Central Directory + Central Directory records
// rather than walking local file headers sequentially: ODF writers
// routinely mark other entries in the archive (e.g. `manifest.rdf` in a
// real-world sample this was tested against) with the "sizes unknown,
// check the data descriptor after the compressed bytes" flag, which local
// headers alone can't be trusted through — the central directory (written
// once, after all entries, at the very end of the file) always carries the
// real compressed size for every entry regardless of that flag, which is
// exactly what a real zip library relies on too. Decompression uses the
// browser/Node native DecompressionStream, so this needs no bundled
// inflate code. See business/odsTable.ts's file comment for why this
// detour around the `xlsx` package's own ODS support exists at all.
const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIR_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const MAX_EOCD_COMMENT_LEN = 65535;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEndOfCentralDirectory(view: DataView, length: number): number | null {
  const searchStart = Math.max(0, length - 22 - MAX_EOCD_COMMENT_LEN);
  for (let i = length - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) return i;
  }
  return null;
}

export async function readZipEntry(bytes: Uint8Array, entryName: string): Promise<Uint8Array | null> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view, bytes.length);
  if (eocdOffset === null) return null;

  const entryCount = view.getUint16(eocdOffset + 10, true);
  let cdOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder();

  for (let i = 0; i < entryCount; i++) {
    if (cdOffset + 46 > bytes.length || view.getUint32(cdOffset, true) !== CENTRAL_DIR_SIGNATURE) return null;
    const method = view.getUint16(cdOffset + 10, true);
    const compSize = view.getUint32(cdOffset + 20, true);
    const nameLen = view.getUint16(cdOffset + 28, true);
    const extraLen = view.getUint16(cdOffset + 30, true);
    const commentLen = view.getUint16(cdOffset + 32, true);
    const localHeaderOffset = view.getUint32(cdOffset + 42, true);
    const nameStart = cdOffset + 46;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));

    if (name === entryName) {
      // The central directory's compressed size above is always correct
      // (unlike the local header's, which can be zeroed for a streamed
      // entry) — only the local header's filename/extra lengths are still
      // needed here, to find where its data actually starts.
      if (view.getUint32(localHeaderOffset, true) !== LOCAL_FILE_HEADER_SIGNATURE) return null;
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const data = bytes.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      return null;
    }
    cdOffset = nameStart + nameLen + extraLen + commentLen;
  }
  return null;
}

export async function readOdsContentXml(bytes: Uint8Array): Promise<string | null> {
  const xmlBytes = await readZipEntry(bytes, 'content.xml');
  return xmlBytes ? new TextDecoder('utf-8').decode(xmlBytes) : null;
}
