export function estimatePdfPageCountFromBytes(buffer: ArrayBuffer): number | null {
  if (!buffer.byteLength) return null;

  const text = new TextDecoder("latin1").decode(new Uint8Array(buffer));

  const pageObjectMatches = text.match(/\/Type\s*\/Page\b(?!s)/g);
  if (pageObjectMatches?.length) {
    return pageObjectMatches.length;
  }

  const countMatches = Array.from(text.matchAll(/\/Count\s+(\d+)/g))
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (countMatches.length > 0) {
    return Math.max(...countMatches);
  }

  return null;
}

export async function estimatePdfPageCountFromBlob(file: File | Blob): Promise<number | null> {
  try {
    return estimatePdfPageCountFromBytes(await file.arrayBuffer());
  } catch {
    return null;
  }
}
