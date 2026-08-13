import { describe, it, expect, vi, beforeEach } from "vitest";
import { estimatePptxSlideCountFromBytes, estimatePptxSlideCountFromBlob } from "@/features/material/pptx-slide-count";
import { PptxMaterialProvider } from "@/features/material/providers/pptx";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { clearMemoryD1Registry } from "@/lib/storage/registry";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal PPTX (ZIP) binary factory
//
// A PPTX is a ZIP archive. This builder constructs a minimal but spec-compliant
// ZIP binary with a configurable number of ppt/slides/slideN.xml entries in the
// central directory. The entry data is intentionally empty (not a real slide XML)
// since the scanner only reads filenames from the central directory.
// ─────────────────────────────────────────────────────────────────────────────

function le16(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff];
}
function le32(n: number): number[] {
  return [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
}

/**
 * Build a syntactically valid ZIP ArrayBuffer with `slideCount` local files
 * named `ppt/slides/slide1.xml` through `ppt/slides/slideN.xml`, plus one
 * extra entry `[Content_Types].xml` to simulate a real PPTX structure.
 */
function buildMinimalPptxZip(slideCount: number): ArrayBuffer {
  const encoder = new TextEncoder();

  // Each "file" has empty content (0 bytes).
  // We need to track the local file header offset for the central directory.

  const localHeaders: Uint8Array[] = [];
  const localOffsets: number[] = [];
  const fileNames: string[] = [
    "[Content_Types].xml",
    ...Array.from({ length: slideCount }, (_, i) => `ppt/slides/slide${i + 1}.xml`),
  ];

  // ── 1. Build local file headers ───────────────────────────────────────────
  let offset = 0;

  for (const fileName of fileNames) {
    const nameBytes = encoder.encode(fileName);
    // Local file header signature: 0x04034b50
    const header = new Uint8Array([
      0x50, 0x4b, 0x03, 0x04,  // Local file header signature
      ...le16(20),              // Version needed to extract (2.0)
      ...le16(0),               // General purpose bit flag
      ...le16(0),               // Compression method (stored)
      ...le16(0), ...le16(0),   // Last mod time / date
      ...le32(0),               // CRC-32 (empty)
      ...le32(0),               // Compressed size
      ...le32(0),               // Uncompressed size
      ...le16(nameBytes.length),// File name length
      ...le16(0),               // Extra field length
      ...Array.from(nameBytes), // File name
      // No extra field, no data
    ]);
    localOffsets.push(offset);
    localHeaders.push(header);
    offset += header.length;
  }

  // ── 2. Build central directory entries ───────────────────────────────────
  const centralDirEntries: Uint8Array[] = [];

  for (let i = 0; i < fileNames.length; i++) {
    const nameBytes = encoder.encode(fileNames[i]);
    const entry = new Uint8Array([
      0x50, 0x4b, 0x01, 0x02,   // Central directory signature
      ...le16(20),               // Version made by
      ...le16(20),               // Version needed
      ...le16(0),                // General purpose bit flag
      ...le16(0),                // Compression method
      ...le16(0), ...le16(0),    // Last mod time / date
      ...le32(0),                // CRC-32
      ...le32(0),                // Compressed size
      ...le32(0),                // Uncompressed size
      ...le16(nameBytes.length), // File name length
      ...le16(0),                // Extra field length
      ...le16(0),                // File comment length
      ...le16(0),                // Disk number start
      ...le16(0),                // Internal file attributes
      ...le32(0),                // External file attributes
      ...le32(localOffsets[i]),  // Relative offset of local header
      ...Array.from(nameBytes),  // File name
    ]);
    centralDirEntries.push(entry);
  }

  const cdOffset = offset;
  const cdSize = centralDirEntries.reduce((acc, e) => acc + e.length, 0);

  // ── 3. Build End of Central Directory record ──────────────────────────────
  const eocd = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06,           // EOCD signature
    ...le16(0),                        // Disk number
    ...le16(0),                        // Start disk
    ...le16(fileNames.length),         // Entries on this disk
    ...le16(fileNames.length),         // Total entries
    ...le32(cdSize),                   // Central dir size
    ...le32(cdOffset),                 // Central dir offset
    ...le16(0),                        // Comment length
  ]);

  // ── 4. Assemble the final buffer ──────────────────────────────────────────
  const totalSize =
    localHeaders.reduce((a, h) => a + h.length, 0) +
    centralDirEntries.reduce((a, e) => a + e.length, 0) +
    eocd.length;

  const result = new Uint8Array(totalSize);
  let pos = 0;

  for (const h of localHeaders) {
    result.set(h, pos);
    pos += h.length;
  }
  for (const e of centralDirEntries) {
    result.set(e, pos);
    pos += e.length;
  }
  result.set(eocd, pos);

  return result.buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Drive mock factory (reused from 3.3A tests, extended for PPTX)
// ─────────────────────────────────────────────────────────────────────────────

function buildPptxBuffer(slideCount: number): ArrayBuffer {
  return buildMinimalPptxZip(slideCount);
}

function createGoogleFetchMockForPptx(slideCount: number) {
  const pptxBytes = buildPptxBuffer(slideCount);

  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url;

    if (target.includes("oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "access-token", expires_in: 3600 });
    }
    if (target.includes("drive/v3/files?q=")) {
      return Response.json({ files: [] });
    }
    if (target.includes("drive/v3/files?fields=id") && init?.method === "POST") {
      return Response.json({ id: `folder-${Math.random().toString(36).slice(2, 6)}` });
    }
    if (target.includes("upload/drive/v3/files")) {
      return Response.json({ id: "drive-file-pptx-1" });
    }
    if (target.includes("drive/v3/files/drive-file-pptx-1?alt=media")) {
      return new Response(pptxBytes, {
        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        },
      });
    }
    // Simulate Drive PDF export endpoint
    if (target.includes("drive/v3/files/drive-file-pptx-1/export")) {
      const fakePdf = new TextEncoder().encode(
        "%PDF-1.4\n1 0 obj\n<</Type/Catalog/Pages 2 0 R>>endobj\n%%EOF"
      );
      return new Response(fakePdf, { headers: { "Content-Type": "application/pdf" } });
    }
    return new Response("not found", { status: 404 });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Phase 3.3B PPTX Presentation Engine", () => {
  beforeEach(() => {
    clearMemoryD1Registry();
    vi.restoreAllMocks();
  });

  // ── Slide count extractor ─────────────────────────────────────────────────

  it("estimatePptxSlideCountFromBytes counts slide XML entries in ZIP central dir", () => {
    expect(estimatePptxSlideCountFromBytes(buildMinimalPptxZip(1))).toBe(1);
    expect(estimatePptxSlideCountFromBytes(buildMinimalPptxZip(5))).toBe(5);
    expect(estimatePptxSlideCountFromBytes(buildMinimalPptxZip(12))).toBe(12);
    expect(estimatePptxSlideCountFromBytes(buildMinimalPptxZip(30))).toBe(30);
  });

  it("estimatePptxSlideCountFromBytes returns null for non-ZIP data", () => {
    const garbage = new TextEncoder().encode("This is not a ZIP file").buffer;
    expect(estimatePptxSlideCountFromBytes(garbage)).toBeNull();
  });

  it("estimatePptxSlideCountFromBytes returns null for empty buffer", () => {
    expect(estimatePptxSlideCountFromBytes(new ArrayBuffer(0))).toBeNull();
  });

  it("estimatePptxSlideCountFromBlob works with a Blob", async () => {
    const buf = buildMinimalPptxZip(7);
    const blob = new Blob([buf]);
    const count = await estimatePptxSlideCountFromBlob(blob);
    expect(count).toBe(7);
  });

  // ── PptxMaterialProvider ──────────────────────────────────────────────────

  it("PptxMaterialProvider supports 'pptx' type only", () => {
    const p = new PptxMaterialProvider();
    expect(p.supports("pptx")).toBe(true);
    expect(p.supports("pdf")).toBe(false);
    expect(p.supports("image")).toBe(false);
  });

  it("PptxMaterialProvider.parse uses server-supplied slideCount", async () => {
    const p = new PptxMaterialProvider();
    const mat = await p.parse("https://example.com/deck.pptx", "Keynote.pptx", 8);
    expect(mat.type).toBe("pptx");
    expect(mat.totalPages).toBe(8);
    expect(mat.slides).toHaveLength(8);
    expect(mat.slides[0].index).toBe(1);
    expect(mat.slides[7].index).toBe(8);
    expect(mat.status).toBe("ready");
  });

  it("PptxMaterialProvider.parse falls back to 1 slide when slideCount is omitted", async () => {
    const p = new PptxMaterialProvider();
    const mat = await p.parse("https://example.com/deck.pptx", "NoCount.pptx");
    expect(mat.totalPages).toBe(1);
    expect(mat.slides).toHaveLength(1);
  });

  it("PptxMaterialProvider.parse produces no fake speaker notes", async () => {
    const p = new PptxMaterialProvider();
    const mat = await p.parse("https://example.com/deck.pptx", "Clean.pptx", 3);
    for (const slide of mat.slides) {
      expect(slide.notes).toBeUndefined();
    }
  });

  it("PptxMaterialProvider.getSlide returns correct slide metadata", async () => {
    const p = new PptxMaterialProvider();
    const mat = await p.parse("https://example.com/deck.pptx", "Deck.pptx", 5);
    const slide3 = await p.getSlide(mat, 3);
    expect(slide3.index).toBe(3);
    expect(slide3.title).toBe("Slide 3");
  });

  it("PptxMaterialProvider.getSlide throws for out-of-range page", async () => {
    const p = new PptxMaterialProvider();
    const mat = await p.parse("https://example.com/deck.pptx", "Short.pptx", 2);
    await expect(p.getSlide(mat, 5)).rejects.toThrow("Slide 5 out of range");
  });

  // ── GoogleDriveStorageProvider — PPTX upload ─────────────────────────────

  it("GoogleDriveStorageProvider.upload extracts real slide count from PPTX binary", async () => {
    const slideCount = 6;
    vi.stubGlobal("fetch", createGoogleFetchMockForPptx(slideCount));

    const env = {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    };
    const provider = new GoogleDriveStorageProvider(env);

    // Create a real minimal PPTX blob with 6 slides
    const pptxBuf = buildMinimalPptxZip(slideCount);
    const file = new File(
      [pptxBuf],
      "seminar.pptx",
      { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }
    );

    const stored = await provider.upload({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      roomCode: "ROOMA",
      ownerUserId: "host-1",
    });

    expect(stored).toMatchObject({
      materialType: "pptx",
      storageProvider: "google_drive",
      storageReference: "drive-file-pptx-1",
      slideCount: 6,
      status: "ready",
      objectKey: null,
      externalUrl: null,
    });
  });

  // ── GoogleDriveStorageProvider.getFileAsPdf ───────────────────────────────

  it("getFileAsPdf calls the Drive /export?mimeType=application/pdf endpoint", async () => {
    const mockFetch = createGoogleFetchMockForPptx(3);
    vi.stubGlobal("fetch", mockFetch);

    const env = {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    };
    const provider = new GoogleDriveStorageProvider(env);
    const result = await provider.getFileAsPdf("drive-file-pptx-1");

    expect(result.mimeType).toBe("application/pdf");
    expect(result.data.byteLength).toBeGreaterThan(0);

    // Verify the export URL was called with the correct mimeType parameter
    const calls = mockFetch.mock.calls.map(([url]) =>
      typeof url === "string" ? url : url instanceof URL ? url.toString() : (url as Request).url
    );
    const exportCall = calls.find((u) => u.includes("/export") && u.includes("application%2Fpdf"));
    expect(exportCall).toBeDefined();
  });

  it("getFileAsPdf throws a descriptive error when Drive export fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com/token")) {
        return Response.json({ access_token: "tok", expires_in: 3600 });
      }
      if (url.includes("/export")) {
        return new Response("Service Unavailable", { status: 503 });
      }
      return new Response("not found", { status: 404 });
    }));

    const provider = new GoogleDriveStorageProvider({
      GOOGLE_CLIENT_ID: "c",
      GOOGLE_CLIENT_SECRET: "s",
      GOOGLE_REFRESH_TOKEN: "r",
    });

    await expect(provider.getFileAsPdf("bad-file-id")).rejects.toThrow(
      "Konversi PPTX ke PDF di Google Drive gagal"
    );
  });
});
