/**
 * PPTX Slide Count Extractor
 *
 * PPTX files are ZIP archives. This module scans the ZIP central directory
 * in a pure ArrayBuffer operation — no native modules, no external deps,
 * fully compatible with the Cloudflare Edge Worker runtime.
 *
 * Strategy: Count entries whose filename matches `ppt/slides/slide*.xml`
 * in the ZIP central directory. This is always present in spec-compliant
 * OOXML presentations (PPTX/POTX).
 *
 * Falls back to null for:
 * - Legacy .ppt (CFB/OLE2 format — not a ZIP)
 * - Corrupt or truncated archives
 */

const ZIP_END_OF_CENTRAL_DIR_SIG = 0x06054b50;
const ZIP_CENTRAL_DIR_SIG = 0x02014b50;
const SLIDE_FILE_PATTERN = /^ppt\/slides\/slide\d+\.xml$/;

/**
 * Scan the ZIP central directory and count PPTX slide XML entries.
 *
 * @param buffer - Raw bytes of the PPTX file
 * @returns Number of slides, or null if the format is not recognised
 */
export function estimatePptxSlideCountFromBytes(buffer: ArrayBuffer): number | null {
  if (buffer.byteLength < 22) return null;

  const view = new DataView(buffer);

  // ── 1. Locate the End-of-Central-Directory record ─────────────────────────
  // It lives in the last 65,558 bytes of the file. Scan backwards for its
  // 4-byte signature (0x06054b50, stored little-endian).
  const searchStart = Math.max(0, buffer.byteLength - 65558);
  let eocdOffset = -1;

  for (let i = buffer.byteLength - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === ZIP_END_OF_CENTRAL_DIR_SIG) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null; // Not a ZIP file

  // ── 2. Read the central directory location from the EOCD record ────────────
  const cdSize = view.getUint32(eocdOffset + 12, true);   // Total size of central dir
  const cdOffset = view.getUint32(eocdOffset + 16, true); // Offset of central dir

  if (cdOffset + cdSize > buffer.byteLength) return null; // Truncated

  // ── 3. Walk every central directory entry ─────────────────────────────────
  let pos = cdOffset;
  let slideCount = 0;

  while (pos + 46 <= cdOffset + cdSize) {
    if (view.getUint32(pos, true) !== ZIP_CENTRAL_DIR_SIG) break;

    const fileNameLength = view.getUint16(pos + 28, true);
    const extraFieldLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);

    // Decode the filename (UTF-8)
    if (pos + 46 + fileNameLength > buffer.byteLength) break;
    const fileNameBytes = new Uint8Array(buffer, pos + 46, fileNameLength);
    const fileName = new TextDecoder("utf-8").decode(fileNameBytes);

    if (SLIDE_FILE_PATTERN.test(fileName)) {
      slideCount++;
    }

    pos += 46 + fileNameLength + extraFieldLength + commentLength;
  }

  return slideCount > 0 ? slideCount : null;
}

/**
 * Async wrapper that reads a File/Blob into an ArrayBuffer first.
 */
export async function estimatePptxSlideCountFromBlob(file: File | Blob): Promise<number | null> {
  try {
    return estimatePptxSlideCountFromBytes(await file.arrayBuffer());
  } catch {
    return null;
  }
}
