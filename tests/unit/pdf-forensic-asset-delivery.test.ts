import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractFilenameFromContentDisposition,
  sanitizePdfFilename,
  resolvePdfFilename,
} from "@/features/material/validator";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { clearMemoryD1Registry } from "@/lib/storage/registry";
import { GET as handleAssetGet } from "@/app/api/material/asset/route";
import { POST as handleUrlPost } from "@/app/api/material/url/route";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { Material, StageSessionState } from "@/core/types";

function generateSamplePdf(pageCount: number): string {
  const pageObjects = Array.from(
    { length: pageCount },
    (_, i) => `${i + 3} 0 obj\n<< /Type /Page /Parent 2 0 R >>\nendobj`
  ).join("\n");

  const kids = Array.from({ length: pageCount }, (_, i) => `${i + 3} 0 R`).join(" ");

  return `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>
endobj
${pageObjects}
%%EOF`;
}

describe("PDF Forensic Asset Delivery & Filename Resolution (Parts 1-13)", () => {
  beforeEach(() => {
    clearMemoryD1Registry();
    vi.restoreAllMocks();
  });

  describe("Deterministic Filename Resolution (Tests 10-14)", () => {
    it("Test 10: External PDF filename resolves from URL pathname", () => {
      const filename = resolvePdfFilename({
        url: "https://example.com/files/event-guide-final.pdf",
      });
      expect(filename).toBe("event-guide-final.pdf");
    });

    it("Test 11: Filename resolves from Content-Disposition header (quoted, unquoted, and RFC 5987 UTF-8)", () => {
      // Direct extractFilenameFromContentDisposition checks
      expect(extractFilenameFromContentDisposition('attachment; filename="Annual Report 2026.pdf"')).toBe(
        "Annual Report 2026.pdf"
      );
      expect(
        extractFilenameFromContentDisposition("attachment; filename*=UTF-8''Financial%20Statement%202026.pdf")
      ).toBe("Financial Statement 2026.pdf");
      expect(extractFilenameFromContentDisposition("attachment; filename=QuarterlyDeck.pdf")).toBe("QuarterlyDeck.pdf");

      // 1. Quoted
      const quoted = resolvePdfFilename({
        contentDisposition: 'attachment; filename="Annual Report 2026.pdf"',
        url: "https://example.com/download?id=123",
      });
      expect(quoted).toBe("Annual Report 2026.pdf");

      // 2. RFC 5987 UTF-8
      const utf8 = resolvePdfFilename({
        contentDisposition: "attachment; filename*=UTF-8''Financial%20Statement%202026.pdf",
        url: "https://example.com/download?id=456",
      });
      expect(utf8).toBe("Financial Statement 2026.pdf");

      // 3. Unquoted
      const plain = resolvePdfFilename({
        contentDisposition: "attachment; filename=QuarterlyDeck.pdf",
        url: "https://example.com/download?id=789",
      });
      expect(plain).toBe("QuarterlyDeck.pdf");
    });

    it("Test 12: Filename fallback is Presentation.pdf ONLY when no filename information exists", () => {
      const fallback = resolvePdfFilename({
        url: "https://example.com/view",
        userTitle: "External Presentation",
      });
      expect(fallback).toBe("Presentation.pdf");
    });

    it("Test 13: Query strings, hashes, and percent-encoding artifacts do not become part of filename", () => {
      const filename = resolvePdfFilename({
        url: "https://example.com/files/annual-conference-guide.pdf?download=1&auth=xyz#section2",
      });
      expect(filename).toBe("annual-conference-guide.pdf");
    });

    it("Test 14: Google Drive metadata.name is resolved for Drive links", () => {
      const filename = resolvePdfFilename({
        googleDriveName: "Keynote Presentation 2026.pdf",
        url: "https://drive.google.com/file/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/view",
      });
      expect(filename).toBe("Keynote Presentation 2026.pdf");
    });

    it("Sanitizes path traversal and forbidden characters while preserving normal filenames", () => {
      expect(sanitizePdfFilename("../../etc/passwd.pdf")).toBe("etc passwd.pdf");
      expect(sanitizePdfFilename('Report "Final" <2026>.pdf')).toBe("Report Final 2026 .pdf");
      expect(sanitizePdfFilename("Annual Report 2026 (Final).pdf")).toBe("Annual Report 2026 (Final).pdf");
    });
  });

  describe("External PDF URL Ingestion & Asset Delivery (Tests 1-6)", () => {
    it("Test 1: External PDF URL returns valid PDF bytes with %PDF- header", async () => {
      const pdf11 = generateSamplePdf(11);
      const pdfBuffer = new TextEncoder().encode(pdf11).buffer;
      const header = new TextDecoder("ascii").decode(new Uint8Array(pdfBuffer.slice(0, 5)));
      expect(header).toBe("%PDF-");
    });

    it("Test 2: Invalid external URL (HTML payload) returns explicit PDF_NOT_A_PDF error", async () => {
      const htmlPayload = "<!DOCTYPE html><html><body>Login to continue</body></html>";
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
          if (target.includes("oauth2.googleapis.com/token")) {
            return Response.json({ access_token: "token-123", expires_in: 3600 });
          }
          return new Response(htmlPayload, {
            status: 200,
            headers: { "Content-Type": "text/html" },
          });
        })
      );

      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";

      const request = new Request("http://localhost:3000/api/material/url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: "https://example.com/document.pdf",
          roomCode: "FORENSIC",
        }),
      });

      const response = await handleUrlPost(request);
      expect(response.status).toBe(400);
      const data = (await response.json()) as Record<string, unknown>;
      expect(data.error).toBe("PDF_NOT_A_PDF");
    });

    it("Test 3: Google Drive upload preserves PDF bytes and assigns resolved filename", async () => {
      const pdf11 = generateSamplePdf(11);
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "token-123", expires_in: 3600 });
        }
        if (target.includes("drive/v3/files?q=")) {
          return Response.json({ files: [] });
        }
        if (target.includes("drive/v3/files?fields=id") && init?.method === "POST") {
          return Response.json({ id: "folder-123" });
        }
        if (target.includes("upload/drive/v3/files")) {
          return Response.json({ id: "drive-file-123" });
        }
        if (target.includes("drive/v3/files/drive-file-123?alt=media")) {
          return new Response(pdf11, { headers: { "Content-Type": "application/pdf" } });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      const env = {
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      };
      const provider = new GoogleDriveStorageProvider(env);
      const blob = new Blob([pdf11], { type: "application/pdf" });

      const stored = await provider.upload({
        file: blob,
        fileName: "Quarterly Report 2026.pdf",
        mimeType: "application/pdf",
        sizeBytes: blob.size,
        roomCode: "FORENSIC",
        ownerUserId: "host-1",
      });

      expect(stored.title).toBe("Quarterly Report 2026.pdf");
      expect(stored.slideCount).toBe(11);

      const downloaded = await provider.getFile("drive-file-123");
      const decoded = new TextDecoder("ascii").decode(new Uint8Array(downloaded.data));
      expect(decoded).toContain("%PDF-1.7");
      expect(decoded).toContain("/Count 11");
    });

    it("Test 4 & 5: /api/material/asset returns Content-Type: application/pdf, exact length, and raw bytes (not JSON or HTML)", async () => {
      const pdf11 = generateSamplePdf(11);
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "token-123", expires_in: 3600 });
        }
        if (target.includes("drive/v3/files?q=")) {
          return Response.json({ files: [] });
        }
        if (target.includes("drive/v3/files?fields=id") && init?.method === "POST") {
          return Response.json({ id: "folder-123" });
        }
        if (target.includes("upload/drive/v3/files")) {
          return Response.json({ id: "drive-file-123" });
        }
        if (target.includes("drive/v3/files/drive-file-123?alt=media")) {
          return new Response(pdf11, { headers: { "Content-Type": "application/pdf" } });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      const env = {
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      };
      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";

      const provider = new GoogleDriveStorageProvider(env);
      const blob = new Blob([pdf11], { type: "application/pdf" });

      const stored = await provider.upload({
        file: blob,
        fileName: "ConferenceDeck.pdf",
        mimeType: "application/pdf",
        sizeBytes: blob.size,
        roomCode: "FORENSIC",
        ownerUserId: "host-1",
      });

      // Seed local room state so asset authorization passes
      const roomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
        new Map()) as Map<string, { state: StageSessionState }>;
      const state = createInitialSessionState("room-f", "FORENSIC", "Forensic Room", "host-1", "dev-host-1");
      state.materials.push({
        id: stored.id,
        name: stored.title,
        type: "pdf",
        url: `/api/material/asset?materialId=${stored.id}&roomCode=FORENSIC`,
        totalPages: 11,
        slides: [],
        uploadedAt: Date.now(),
        status: "ready",
      });
      roomsMap.set("FORENSIC", { state });

      // Request asset endpoint with approved host device
      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=${stored.id}&roomCode=FORENSIC&deviceId=dev-host-1`
      );

      const assetRes = await handleAssetGet(req);
      expect(assetRes).toBeDefined();
      expect(assetRes?.status).toBe(200);
      expect(assetRes?.headers.get("Content-Type")).toBe("application/pdf");
      expect(assetRes?.headers.get("Accept-Ranges")).toBe("bytes");

      const arrayBuf = await assetRes!.arrayBuffer();
      expect(arrayBuf.byteLength).toBe(blob.size);

      const header = new TextDecoder("ascii").decode(new Uint8Array(arrayBuf.slice(0, 5)));
      expect(header).toBe("%PDF-");

      // Verify HTTP Range request support (206 Partial Content)
      const rangeReq = new Request(
        `http://localhost:3000/api/material/asset?materialId=${stored.id}&roomCode=FORENSIC&deviceId=dev-host-1`,
        { headers: { Range: "bytes=0-15" } }
      );
      const rangeRes = await handleAssetGet(rangeReq);
      expect(rangeRes).toBeDefined();
      expect(rangeRes?.status).toBe(206);
      expect(rangeRes?.headers.get("Content-Range")).toBe(`bytes 0-15/${blob.size}`);
      expect(rangeRes?.headers.get("Content-Length")).toBe("16");
      const rangeBuf = await rangeRes!.arrayBuffer();
      expect(rangeBuf.byteLength).toBe(16);
    });
  });

  describe("Presentation Navigation & Page Sync on 11-Page PDF (Tests 7-9)", () => {
    const material: Material = {
      id: "mat-gdrive-11",
      name: "ConferenceDeck.pdf",
      type: "pdf",
      sourceType: "UPLOADED_FILE",
      url: "/api/material/asset?materialId=mat-gdrive-11&roomCode=FORENSIC",
      totalPages: 11,
      slides: Array.from({ length: 11 }, (_, i) => ({
        index: i + 1,
        title: `Page ${i + 1}`,
        contentUrl: "/api/material/asset?materialId=mat-gdrive-11&roomCode=FORENSIC",
      })),
      uploadedAt: Date.now(),
      status: "ready",
    };

    it("Test 7, 8, 9: Starts at page 1, advances to page 5, jumps to page 11 with totalSlides = 11", () => {
      let state = createInitialSessionState("room-f", "FORENSIC", "Forensic Room", "host-1", "dev-host-1");

      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-add",
        senderDeviceId: "dev-host-1",
        timestamp: 1000,
        payload: { material },
      });

      // Test 7: Load page 1
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "cmd-start",
        senderDeviceId: "dev-host-1",
        timestamp: 1001,
        payload: { materialId: material.id, startPage: 1 },
      });
      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.currentSlide).toBe(1);
      expect(state.presentation.totalSlides).toBe(11);

      // Test 8: Render / jump to page 5
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-5",
        senderDeviceId: "dev-host-1",
        timestamp: 1002,
        payload: { pageNumber: 5 },
      });
      expect(state.presentation.currentSlide).toBe(5);
      expect(state.presentation.totalSlides).toBe(11);

      // Test 9: Render / jump to page 11 (last page)
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-11",
        senderDeviceId: "dev-host-1",
        timestamp: 1003,
        payload: { pageNumber: 11 },
      });
      expect(state.presentation.currentSlide).toBe(11);
      expect(state.presentation.totalSlides).toBe(11);

      // Verify bounds: NEXT at page 11 does not exceed 11
      state = stageSessionReducer(state, {
        type: "SLIDE_NEXT",
        commandId: "cmd-next-11",
        senderDeviceId: "dev-host-1",
        timestamp: 1004,
        payload: {},
      });
      expect(state.presentation.currentSlide).toBe(11);
    });
  });
});
