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
  const searchStart = Math.max(0, buffer.byteLength - 65558);
  let eocdOffset = -1;

  for (let i = buffer.byteLength - 22; i >= searchStart; i--) {
    if (view.getUint32(i, true) === ZIP_END_OF_CENTRAL_DIR_SIG) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) return null;

  // ── 2. Read central directory location ────────────────────────────────────
  const cdSize = view.getUint32(eocdOffset + 12, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  if (cdOffset + cdSize > buffer.byteLength) return null;

  // ── 3. Fast Byte-level Matching for "ppt/slides/slide" ────────────────────
  // ASCII bytes: 'p'=112, 'p'=112, 't'=116, '/'=47, 's'=115, 'l'=108, 'i'=105, 'd'=100, 'e'=101, 's'=115, '/'=47, 's'=115, 'l'=108, 'i'=105, 'd'=100, 'e'=101
  const PREFIX_BYTES = [112, 112, 116, 47, 115, 108, 105, 100, 101, 115, 47, 115, 108, 105, 100, 101];

  let pos = cdOffset;
  let slideCount = 0;
  const uint8View = new Uint8Array(buffer);

  while (pos + 46 <= cdOffset + cdSize) {
    if (view.getUint32(pos, true) !== ZIP_CENTRAL_DIR_SIG) break;

    const fileNameLength = view.getUint16(pos + 28, true);
    const extraFieldLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);

    if (fileNameLength >= 20 && pos + 46 + fileNameLength <= buffer.byteLength) {
      const nameStart = pos + 46;
      let matchesPrefix = true;
      for (let k = 0; k < 16; k++) {
        if (uint8View[nameStart + k] !== PREFIX_BYTES[k]) {
          matchesPrefix = false;
          break;
        }
      }
      if (matchesPrefix) {
        // Check if ends with ".xml"
        if (
          uint8View[nameStart + fileNameLength - 4] === 46 && // '.'
          uint8View[nameStart + fileNameLength - 3] === 120 && // 'x'
          uint8View[nameStart + fileNameLength - 2] === 109 && // 'm'
          uint8View[nameStart + fileNameLength - 1] === 108 // 'l'
        ) {
          slideCount++;
        }
      }
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
