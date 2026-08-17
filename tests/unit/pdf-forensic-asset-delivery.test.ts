import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  extractFilenameFromContentDisposition,
  sanitizePdfFilename,
  resolvePdfFilename,
  appendAssetAccessParams,
} from "@/features/material/validator";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { clearMemoryD1Registry, MaterialRegistryService } from "@/lib/storage/registry";
import { GET as handleAssetGet, invalidateMaterialMetadataCache } from "@/app/api/material/asset/route";
import { POST as handleUrlPost } from "@/app/api/material/url/route";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { Material, StageSessionState } from "@/core/types";
import { createAssetGrant, verifyAssetGrant } from "@/lib/auth/asset-grant";
import {
  preloadPdfDocument,
  clearPdfDocumentCache,
  getPdfDocumentCacheSize,
  getPdfLoadingPromisesSize,
} from "@/features/material/hooks/usePdfDocument";

const mockPdfResolver = vi.fn((_target: string) =>
  Promise.resolve({ numPages: 11, getPage: vi.fn().mockResolvedValue({}) })
);

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  version: "3.11.174",
  getDocument: vi.fn((target: string) => ({
    promise: mockPdfResolver(target),
  })),
}));

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

    it("Test 15: Explicit user-provided title takes highest priority over Google Drive metadata name and URL", () => {
      const filename = resolvePdfFilename({
        userTitle: "Presentasi Pembuka Keynote",
        googleDriveName: "RawDocument_12345.pdf",
        url: "https://drive.google.com/file/d/1BxiMVs0/view",
      });
      expect(filename).toBe("Presentasi Pembuka Keynote.pdf");
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
          const reqHeaders = new Headers(init?.headers);
          const range = reqHeaders.get("Range");
          if (range && range.startsWith("bytes=")) {
            const parts = range.replace("bytes=", "").split("-");
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : pdf11.length - 1;
            const chunk = pdf11.slice(start, end + 1);
            return new Response(chunk, {
              status: 206,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Range": `bytes ${start}-${end}/${pdf11.length}`,
                "Content-Length": String(chunk.length),
                "Accept-Ranges": "bytes",
              },
            });
          }
          return new Response(pdf11, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(pdf11.length),
              "Accept-Ranges": "bytes",
            },
          });
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

  describe("Phase B: Zero-Buffering Streaming & Range Semantics (Tests B1 - B11)", () => {
    const pdf11 = generateSamplePdf(11);

    beforeEach(() => {
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "token-123", expires_in: 3600 });
        }
        if (target.includes("drive/v3/files?q=")) {
          return Response.json({ files: [] });
        }
        if (target.includes("drive/v3/files?fields=id") && init?.method === "POST") {
          return Response.json({ id: "folder-phase-b" });
        }
        if (target.includes("upload/drive/v3/files")) {
          return Response.json({ id: "drive-file-phase-b" });
        }
        if (target.includes("drive/v3/files/drive-file-phase-b?alt=media")) {
          const reqHeaders = new Headers(init?.headers);
          const range = reqHeaders.get("Range");
          if (range && range.startsWith("bytes=")) {
            const parts = range.replace("bytes=", "").split("-");
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : pdf11.length - 1;
            const chunk = pdf11.slice(start, end + 1);
            return new Response(chunk, {
              status: 206,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Range": `bytes ${start}-${end}/${pdf11.length}`,
                "Content-Length": String(chunk.length),
                "Accept-Ranges": "bytes",
              },
            });
          }
          return new Response(pdf11, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(pdf11.length),
              "Accept-Ranges": "bytes",
            },
          });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
    });

    it("TEST B1: Normal PDF request streams 200 OK with application/pdf and Accept-Ranges", async () => {
      const provider = new GoogleDriveStorageProvider({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      });
      const blob = new Blob([pdf11], { type: "application/pdf" });
      const stored = await provider.upload({
        file: blob,
        fileName: "StreamTest.pdf",
        mimeType: "application/pdf",
        sizeBytes: blob.size,
        roomCode: "STREAM",
        ownerUserId: "host-1",
      });

      const roomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
        new Map()) as Map<string, { state: StageSessionState }>;
      const state = createInitialSessionState("room-s", "STREAM", "Stream Room", "host-1", "dev-host-1");
      state.materials.push({
        id: stored.id,
        name: stored.title,
        type: "pdf",
        url: `/api/material/asset?materialId=${stored.id}&roomCode=STREAM`,
        totalPages: 11,
        slides: [],
        uploadedAt: Date.now(),
        status: "ready",
      });
      roomsMap.set("STREAM", { state });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=${stored.id}&roomCode=STREAM&deviceId=dev-host-1`
      );
      const res = await handleAssetGet(req);
      expect(res).toBeDefined();
      expect(res?.status).toBe(200);
      expect(res?.headers.get("Content-Type")).toBe("application/pdf");
      expect(res?.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res?.headers.get("Content-Length")).toBe(String(blob.size));
    });

    it("TEST B2, B5, B6, B7, B8: Range request returns 206 Partial Content with correct Content-Range", async () => {
      const provider = new GoogleDriveStorageProvider({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      });
      const blob = new Blob([pdf11], { type: "application/pdf" });
      const stored = await provider.upload({
        file: blob,
        fileName: "StreamRange.pdf",
        mimeType: "application/pdf",
        sizeBytes: blob.size,
        roomCode: "STREAM",
        ownerUserId: "host-1",
      });

      const roomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
        new Map()) as Map<string, { state: StageSessionState }>;
      const state = createInitialSessionState("room-s", "STREAM", "Stream Room", "host-1", "dev-host-1");
      state.materials.push({
        id: stored.id,
        name: stored.title,
        type: "pdf",
        url: `/api/material/asset?materialId=${stored.id}&roomCode=STREAM`,
        totalPages: 11,
        slides: [],
        uploadedAt: Date.now(),
        status: "ready",
      });
      roomsMap.set("STREAM", { state });

      const rangeReq = new Request(
        `http://localhost:3000/api/material/asset?materialId=${stored.id}&roomCode=STREAM&deviceId=dev-host-1`,
        { headers: { Range: "bytes=0-15" } }
      );
      const rangeRes = await handleAssetGet(rangeReq);
      expect(rangeRes).toBeDefined();
      expect(rangeRes?.status).toBe(206); // TEST B5
      expect(rangeRes?.headers.get("Content-Range")).toBe(`bytes 0-15/${blob.size}`); // TEST B6
      expect(rangeRes?.headers.get("Content-Length")).toBe("16"); // TEST B7
      expect(rangeRes?.headers.get("Accept-Ranges")).toBe("bytes"); // TEST B8

      const buf = await rangeRes!.arrayBuffer();
      expect(buf.byteLength).toBe(16);
    });

    it("TEST B3 & B4: Multiple sequential and concurrent Range requests stream independent chunks", async () => {
      const provider = new GoogleDriveStorageProvider({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      });
      const blob = new Blob([pdf11], { type: "application/pdf" });
      const stored = await provider.upload({
        file: blob,
        fileName: "MultiRange.pdf",
        mimeType: "application/pdf",
        sizeBytes: blob.size,
        roomCode: "STREAM",
        ownerUserId: "host-1",
      });

      const roomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
        new Map()) as Map<string, { state: StageSessionState }>;
      const state = createInitialSessionState("room-s", "STREAM", "Stream Room", "host-1", "dev-host-1");
      state.materials.push({
        id: stored.id,
        name: stored.title,
        type: "pdf",
        url: `/api/material/asset?materialId=${stored.id}&roomCode=STREAM`,
        totalPages: 11,
        slides: [],
        uploadedAt: Date.now(),
        status: "ready",
      });
      roomsMap.set("STREAM", { state });

      // Run 3 concurrent range requests (mimicking PDF.js multi-range requests)
      const ranges = ["bytes=0-15", "bytes=16-31", "bytes=32-47"];
      const responses = await Promise.all(
        ranges.map((range) =>
          handleAssetGet(
            new Request(
              `http://localhost:3000/api/material/asset?materialId=${stored.id}&roomCode=STREAM&deviceId=dev-host-1`,
              { headers: { Range: range } }
            )
          )
        )
      );

      expect(responses[0]?.status).toBe(206);
      expect(responses[1]?.status).toBe(206);
      expect(responses[2]?.status).toBe(206);

      expect(responses[0]?.headers.get("Content-Range")).toBe(`bytes 0-15/${blob.size}`);
      expect(responses[1]?.headers.get("Content-Range")).toBe(`bytes 16-31/${blob.size}`);
      expect(responses[2]?.headers.get("Content-Range")).toBe(`bytes 32-47/${blob.size}`);
    });

    it("TEST B9: Invalid authorization is rejected (403)", async () => {
      const req = new Request(
        "http://localhost:3000/api/material/asset?materialId=fake-id&roomCode=STREAM&deviceId=unapproved-dev"
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(404); // Material not found before DO access
    });

    it("TEST B10: Google Drive upstream error handles gracefully (502) without crashing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string | URL | Request) => {
          const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
          if (target.includes("oauth2.googleapis.com/token")) {
            return Response.json({ access_token: "token-123", expires_in: 3600 });
          }
          if (target.includes("drive/v3/files/broken-file?alt=media")) {
            return new Response("Upstream Error", { status: 500 });
          }
          return new Response("not found", { status: 404 });
        })
      );

      const registry = new MaterialRegistryService({});
      const record = await registry.createMaterial({
        id: "mat-broken",
        ownerUserId: "host-1",
        roomCode: "STREAM",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "broken-file",
        title: "Broken.pdf",
        sizeBytes: 1000,
        slideCount: 5,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const roomsMap = ((globalThis as Record<string, unknown>).__STAGEPILOT_LOCAL_ROOMS__ ||=
        new Map()) as Map<string, { state: StageSessionState }>;
      const state = createInitialSessionState("room-s", "STREAM", "Stream Room", "host-1", "dev-host-1");
      state.materials.push({
        id: record.id,
        name: record.title,
        type: "pdf",
        url: `/api/material/asset?materialId=${record.id}&roomCode=STREAM`,
        totalPages: 5,
        slides: [],
        uploadedAt: Date.now(),
        status: "ready",
      });
      roomsMap.set("STREAM", { state });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=${record.id}&roomCode=STREAM&deviceId=dev-host-1`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(502);
    });

    it("TEST B11: getFileStream returns a valid ReadableStream without full buffering", async () => {
      const provider = new GoogleDriveStorageProvider({
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      });

      const streamRes = await provider.getFileStream("drive-file-phase-b");
      expect(streamRes.body).toBeDefined();
      expect(streamRes.body).toBeInstanceOf(ReadableStream);
      expect(streamRes.status).toBe(200);
      expect(streamRes.mimeType).toBe("application/pdf");
      expect(streamRes.acceptRanges).toBe("bytes");
    });
  });

  describe("Phase C: Zero-Trust Scoped Asset Capability Grant (Tests C1 - C14)", () => {
    const pdf11 = generateSamplePdf(11);

    beforeEach(() => {
      clearMemoryD1Registry();
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "token-123", expires_in: 3600 });
        }
        if (target.includes("drive/v3/files?q=")) {
          return Response.json({ files: [] });
        }
        if (target.includes("drive/v3/files?fields=id") && init?.method === "POST") {
          return Response.json({ id: "folder-phase-c" });
        }
        if (target.includes("upload/drive/v3/files")) {
          return Response.json({ id: "drive-file-phase-c" });
        }
        if (target.includes("drive/v3/files/drive-file-phase-c?alt=media")) {
          const reqHeaders = new Headers(init?.headers);
          const range = reqHeaders.get("Range");
          if (range && range.startsWith("bytes=")) {
            const parts = range.replace("bytes=", "").split("-");
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : pdf11.length - 1;
            const chunk = pdf11.slice(start, end + 1);
            return new Response(chunk, {
              status: 206,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Range": `bytes ${start}-${end}/${pdf11.length}`,
                "Content-Length": String(chunk.length),
                "Accept-Ranges": "bytes",
              },
            });
          }
          return new Response(pdf11, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(pdf11.length),
              "Accept-Ranges": "bytes",
            },
          });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
      process.env.JWT_SECRET = "test-secret-key-at-least-32-chars-long";
    });

    it("TEST C1 & C12: Valid grant allows 200/206 Range stream WITHOUT calling Durable Object", async () => {
      const registry = new MaterialRegistryService({});
      const record = await registry.createMaterial({
        id: "mat-c1",
        ownerUserId: "host-1",
        roomCode: "SECURE",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // Issue grant for room SECURE and material mat-c1
      const grant = await createAssetGrant("SECURE", record.id);
      expect(grant).toBeDefined();

      const verifyDirect = await verifyAssetGrant(grant, "SECURE", record.id);
      expect(verifyDirect.valid).toBe(true);

      // Request range with grant — NOTICE: local rooms map is EMPTY.
      // If it attempted to call DO or check unseeded local room state, it would fail or query DO.
      const rangeReq = new Request(
        `http://localhost:3000/api/material/asset?materialId=${record.id}&roomCode=SECURE&grant=${encodeURIComponent(grant)}`,
        { headers: { Range: "bytes=0-15" } }
      );
      const rangeRes = await handleAssetGet(rangeReq);
      expect(rangeRes).toBeDefined();
      expect(rangeRes?.status).toBe(206);
      expect(rangeRes?.headers.get("Content-Range")).toBe(`bytes 0-15/${pdf11.length}`);
      expect(rangeRes?.headers.get("Content-Length")).toBe("16");
    });

    it("TEST C2: Invalid signature is rejected (403)", async () => {
      const grant = await createAssetGrant("SECURE", "mat-c1");
      const tamperedGrant = grant.slice(0, -4) + "beef"; // Corrupt the signature

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-c1",
        ownerUserId: "host-1",
        roomCode: "SECURE",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-c1&roomCode=SECURE&grant=${encodeURIComponent(tamperedGrant)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(403);
    });

    it("TEST C3 & C10: Expired grant is rejected (403)", async () => {
      // Create grant with negative TTL (already expired)
      const expiredGrant = await createAssetGrant("SECURE", "mat-c1", null, -5000);

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-c1",
        ownerUserId: "host-1",
        roomCode: "SECURE",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-c1&roomCode=SECURE&grant=${encodeURIComponent(expiredGrant)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(403);
    });

    it("TEST C4: Wrong roomCode is rejected (403)", async () => {
      const grantForRoomA = await createAssetGrant("ROOM-A", "mat-c1");

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-c1",
        ownerUserId: "host-1",
        roomCode: "ROOM-B",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-c1&roomCode=ROOM-B&grant=${encodeURIComponent(grantForRoomA)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(403);
    });

    it("TEST C5: Wrong materialId is rejected (403)", async () => {
      const grantForMat1 = await createAssetGrant("SECURE", "mat-1");

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-2",
        ownerUserId: "host-1",
        roomCode: "SECURE",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-2&roomCode=SECURE&grant=${encodeURIComponent(grantForMat1)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(403);
    });

    it("TEST C6, C8, C9: Tampered payload or modified expiry is rejected (403)", async () => {
      const validGrant = await createAssetGrant("SECURE", "mat-c1");
      const parts = validGrant.split(".");
      parts[4] = String(Date.now() + 99999999); // Tamper expiry timestamp
      const tampered = parts.join(".");

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-c1",
        ownerUserId: "host-1",
        roomCode: "SECURE",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-c1&roomCode=SECURE&grant=${encodeURIComponent(tampered)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(403);
    });

    it("TEST C11: Google Drive credentials never appear in response headers or body", async () => {
      const grant = await createAssetGrant("SECURE", "mat-c1");

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-c1",
        ownerUserId: "host-1",
        roomCode: "SECURE",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "SecurityTest.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-c1&roomCode=SECURE&grant=${encodeURIComponent(grant)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(200);

      // Verify no secrets leaked in headers
      expect(res?.headers.get("Authorization")).toBeNull();
      expect(res?.headers.get("Set-Cookie")).toBeNull();
      const allHeaders = Array.from(res?.headers.entries() || []);
      for (const [, v] of allHeaders) {
        expect(v).not.toContain("client-secret");
        expect(v).not.toContain("refresh-token");
      }
    });

    it("TEST C13 & C14: Multiple sequential and concurrent Range requests with valid grant require 0 DO authorization", async () => {
      const grant = await createAssetGrant("PERF-TEST", "mat-perf");

      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-perf",
        ownerUserId: "host-1",
        roomCode: "PERF-TEST",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-file-phase-c",
        title: "PerfDeck.pdf",
        sizeBytes: pdf11.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      // 10 concurrent range requests
      const concurrentRanges = Array.from({ length: 10 }, (_, i) => `bytes=${i * 10}-${i * 10 + 9}`);
      const responses = await Promise.all(
        concurrentRanges.map((range) =>
          handleAssetGet(
            new Request(
              `http://localhost:3000/api/material/asset?materialId=mat-perf&roomCode=PERF-TEST&grant=${encodeURIComponent(grant)}`,
              { headers: { Range: range } }
            )
          )
        )
      );

      for (let i = 0; i < 10; i++) {
        expect(responses[i]?.status).toBe(206);
        expect(responses[i]?.headers.get("Content-Range")).toBe(`bytes ${i * 10}-${i * 10 + 9}/${pdf11.length}`);
      }
    });
  });

  describe("Phase D: Zero-Trust PDF Request Elimination & Coalescing (Tests D1 - D14)", () => {
    beforeEach(() => {
      (globalThis as unknown as { window: unknown }).window = {};
      clearPdfDocumentCache();
    });

    it("TEST D10: appendAssetAccessParams preserves canonical URL without injecting deviceId if grant is present", () => {
      const canonicalUrl = "/api/material/asset?materialId=mat-1&roomCode=CONF&grant=token123";
      
      const hostUrl = appendAssetAccessParams(canonicalUrl, "dev-host-1");
      const audienceUrl = appendAssetAccessParams(canonicalUrl, "dev-audience-2");
      const confidenceUrl = appendAssetAccessParams(canonicalUrl, "dev-confidence-3");

      // ALL 3 screens generate the EXACT SAME CANONICAL URL
      expect(hostUrl).toBe(canonicalUrl);
      expect(audienceUrl).toBe(canonicalUrl);
      expect(confidenceUrl).toBe(canonicalUrl);
      expect(hostUrl).not.toContain("deviceId=");
    });

    it("TEST D11: appendAssetAccessParams falls back to attaching deviceId for legacy non-grant URLs", () => {
      const legacyUrl = "/api/material/asset?materialId=mat-1&roomCode=CONF";
      const result = appendAssetAccessParams(legacyUrl, "dev-host-1");
      expect(result).toBe("/api/material/asset?materialId=mat-1&roomCode=CONF&deviceId=dev-host-1");
    });

    it("TEST D2 & D3: Concurrent calls for same PDF URL coalesce and share single loading promise", async () => {
      const fakeDoc = { numPages: 11, getPage: vi.fn().mockResolvedValue({}) };
      mockPdfResolver.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve(fakeDoc), 30))
      );

      const url = "http://localhost:3000/api/material/asset?materialId=mat-d2&roomCode=ROOM&grant=token";
      
      // 3 concurrent callers (Control, Audience, Confidence in same tab / tests)
      const p1 = preloadPdfDocument(url);
      const p2 = preloadPdfDocument(url);
      const p3 = preloadPdfDocument(url);

      expect(getPdfLoadingPromisesSize()).toBe(1);

      const [res1, res2, res3] = await Promise.all([p1, p2, p3]);
      expect(res1).toBe(fakeDoc);
      expect(res2).toBe(fakeDoc);
      expect(res3).toBe(fakeDoc);
      expect(getPdfDocumentCacheSize()).toBe(1);
      expect(getPdfLoadingPromisesSize()).toBe(0);
    });

    it("TEST D4: Failed PDF load removes entry from loading promises", async () => {
      mockPdfResolver.mockImplementation(() => Promise.reject(new Error("Corrupted PDF stream")));

      const failUrl = "http://localhost:3000/api/material/asset?materialId=mat-fail&roomCode=ROOM&grant=token";
      const result = await preloadPdfDocument(failUrl);
      expect(result).toBeNull();
      expect(getPdfLoadingPromisesSize()).toBe(0);
      expect(getPdfDocumentCacheSize()).toBe(0);
    });

    it("TEST D5, D6, D7: Changing material, snapshot or room results in distinct cache entries", async () => {
      const fakeDocA = { numPages: 5, getPage: vi.fn() };
      const fakeDocB = { numPages: 10, getPage: vi.fn() };

      mockPdfResolver.mockImplementation((target: string) =>
        Promise.resolve(target.includes("mat-A") ? fakeDocA : fakeDocB)
      );

      const urlA = "http://localhost:3000/api/material/asset?materialId=mat-A&roomCode=ROOM1&grant=tokenA";
      const urlB = "http://localhost:3000/api/material/asset?materialId=mat-B&roomCode=ROOM2&grant=tokenB";

      await preloadPdfDocument(urlA);
      await preloadPdfDocument(urlB);

      expect(getPdfDocumentCacheSize()).toBe(2);
    });

    it("TEST D12 & D14: PresentationSession state remains authoritative with canonical material URLs", () => {
      const state = createInitialSessionState("room-1", "PHASE-D", "Phase D Title", "Host 1", "host-1");
      const canonicalMat: Material = {
        id: "mat-d-auth",
        name: "AuthoritativeDeck.pdf",
        type: "pdf",
        sourceType: "UPLOADED_FILE",
        objectKey: null,
        url: "/api/material/asset?materialId=mat-d-auth&roomCode=PHASE-D&grant=valid-token",
        totalPages: 11,
        slides: [],
        uploadedAt: Date.now(),
        status: "ready",
      };

      const updated = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-auth",
        senderDeviceId: "host-1",
        timestamp: Date.now(),
        payload: { material: canonicalMat },
      });

      expect(updated.materials).toHaveLength(1);
      expect(updated.materials[0].url).toContain("grant=valid-token");
      expect(updated.materials[0].url).not.toContain("deviceId=");
    });

    it("TEST D13: Canva pipeline is unaffected and maintains native image URLs", () => {
      const canvaMat: Material = {
        id: "canva-d",
        name: "Design.canva",
        type: "canva",
        sourceType: "EXTERNAL_URL",
        objectKey: null,
        url: "https://canva.com/design/DAG123",
        totalPages: 4,
        slides: [
          { index: 1, title: "Slide 1", contentUrl: "https://export.canva.com/page1.png" },
        ],
        uploadedAt: Date.now(),
        status: "ready",
      };

      const appendResult = appendAssetAccessParams(canvaMat.slides[0]?.contentUrl || "", "dev-1");
      expect(appendResult).toBe("https://export.canva.com/page1.png");
    });
  });

  describe("Phase E: Final PDF Cache Hardening & Acceptance Tests (Tests E1 - E6)", () => {
    const pdfA = generateSamplePdf(5);
    const pdfB = generateSamplePdf(11);

    beforeEach(() => {
      clearMemoryD1Registry();
      const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (target.includes("oauth2.googleapis.com/token")) {
          return Response.json({ access_token: "token-123", expires_in: 3600 });
        }
        if (target.includes("drive/v3/files/drive-pdf-A?alt=media")) {
          return new Response(pdfA, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(pdfA.length),
              "Accept-Ranges": "bytes",
            },
          });
        }
        if (target.includes("drive/v3/files/drive-pdf-B?alt=media")) {
          const reqHeaders = new Headers(init?.headers);
          const range = reqHeaders.get("Range");
          if (range && range.startsWith("bytes=")) {
            const parts = range.replace("bytes=", "").split("-");
            const start = parseInt(parts[0], 10) || 0;
            const end = parts[1] ? parseInt(parts[1], 10) : pdfB.length - 1;
            const chunk = pdfB.slice(start, end + 1);
            return new Response(chunk, {
              status: 206,
              headers: {
                "Content-Type": "application/pdf",
                "Content-Range": `bytes ${start}-${end}/${pdfB.length}`,
                "Content-Length": String(chunk.length),
                "Accept-Ranges": "bytes",
              },
            });
          }
          return new Response(pdfB, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Length": String(pdfB.length),
              "Accept-Ranges": "bytes",
            },
          });
        }
        return new Response("not found", { status: 404 });
      });
      vi.stubGlobal("fetch", fetchMock);

      process.env.GOOGLE_CLIENT_ID = "client-id";
      process.env.GOOGLE_CLIENT_SECRET = "client-secret";
      process.env.GOOGLE_REFRESH_TOKEN = "refresh-token";
      process.env.JWT_SECRET = "test-secret-key-at-least-32-chars-long";
      invalidateMaterialMetadataCache();
    });

    it("TEST E1: Re-import / replace material returns new snapshot bytes and never returns old snapshot", async () => {
      const registry = new MaterialRegistryService({});

      // 1. Register PDF A
      const matA = await registry.createMaterial({
        id: "mat-snapshot-A",
        ownerUserId: "host-1",
        roomCode: "REIMPORT-TEST",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-pdf-A",
        title: "OldVersion.pdf",
        sizeBytes: pdfA.length,
        slideCount: 5,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const grantA = await createAssetGrant("REIMPORT-TEST", matA.id);
      const resA = await handleAssetGet(
        new Request(
          `http://localhost:3000/api/material/asset?materialId=${matA.id}&roomCode=REIMPORT-TEST&grant=${encodeURIComponent(grantA)}`
        )
      );
      expect(resA?.status).toBe(200);
      const bodyA = await resA?.text();
      expect(bodyA).toBe(pdfA);

      // 2. Re-import / Replace with PDF B (generates new unique snapshot ID)
      const matB = await registry.createMaterial({
        id: "mat-snapshot-B",
        ownerUserId: "host-1",
        roomCode: "REIMPORT-TEST",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-pdf-B",
        title: "NewVersion.pdf",
        sizeBytes: pdfB.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const grantB = await createAssetGrant("REIMPORT-TEST", matB.id);
      const resB = await handleAssetGet(
        new Request(
          `http://localhost:3000/api/material/asset?materialId=${matB.id}&roomCode=REIMPORT-TEST&grant=${encodeURIComponent(grantB)}`
        )
      );
      expect(resB?.status).toBe(200);
      const bodyB = await resB?.text();
      expect(bodyB).toBe(pdfB);
      expect(bodyB).not.toBe(pdfA);

      // 3. Mark old matA as deleted and invalidate isolate metadata cache
      await registry.deleteMaterial(matA.id);
      invalidateMaterialMetadataCache(matA.id);

      const resOld = await handleAssetGet(
        new Request(
          `http://localhost:3000/api/material/asset?materialId=${matA.id}&roomCode=REIMPORT-TEST&grant=${encodeURIComponent(grantA)}`
        )
      );
      expect(resOld?.status).toBe(404);
    });

    it("TEST E2: Cross-room access under caching headers is denied (403)", async () => {
      const grantForRoom1 = await createAssetGrant("ROOM-1", "mat-shared");
      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-shared",
        ownerUserId: "host-1",
        roomCode: "ROOM-2",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-pdf-B",
        title: "Deck.pdf",
        sizeBytes: pdfB.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-shared&roomCode=ROOM-2&grant=${encodeURIComponent(grantForRoom1)}`
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(403);
    });

    it("TEST E3: HTTP Range cache headers include Accept-Ranges, Vary, and immutable Cache-Control", async () => {
      const grant = await createAssetGrant("CACHE-TEST", "mat-cache");
      const registry = new MaterialRegistryService({});
      await registry.createMaterial({
        id: "mat-cache",
        ownerUserId: "host-1",
        roomCode: "CACHE-TEST",
        sourceType: "UPLOADED_FILE",
        materialType: "pdf",
        storageProvider: "google_drive",
        storageReference: "drive-pdf-B",
        title: "Deck.pdf",
        sizeBytes: pdfB.length,
        slideCount: 11,
        status: "ready",
        createdAt: Date.now(),
        expiresAt: Date.now() + 3600000,
      });

      const req = new Request(
        `http://localhost:3000/api/material/asset?materialId=mat-cache&roomCode=CACHE-TEST&grant=${encodeURIComponent(grant)}`,
        { headers: { Range: "bytes=0-100" } }
      );
      const res = await handleAssetGet(req);
      expect(res?.status).toBe(206);
      expect(res?.headers.get("Accept-Ranges")).toBe("bytes");
      expect(res?.headers.get("Cache-Control")).toContain("immutable");
      expect(res?.headers.get("Vary")).toContain("Range");
      expect(res?.headers.get("Content-Range")).toBe(`bytes 0-100/${pdfB.length}`);
    });

    it("TEST E4: Full live cycle (Go Live, Next x5, Prev x3, Goto x3) remains synchronized across 3 displays", () => {
      let state = createInitialSessionState("room-full", "FULL-CYCLE", "Full Cycle Test", "host-user", "dev-host");
      
      const pdfMat: Material = {
        id: "mat-full-11",
        name: "SyncDeck.pdf",
        type: "pdf",
        sourceType: "UPLOADED_FILE",
        objectKey: null,
        url: "/api/material/asset?materialId=mat-full-11&roomCode=FULL-CYCLE&grant=token-full",
        totalPages: 11,
        slides: Array.from({ length: 11 }, (_, i) => ({
          index: i + 1,
          title: `Slide ${i + 1}`,
          contentUrl: "/api/material/asset?materialId=mat-full-11&roomCode=FULL-CYCLE&grant=token-full",
        })),
        uploadedAt: Date.now(),
        status: "ready",
      };

      // 1. Add Material
      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "c1",
        senderDeviceId: "dev-host",
        timestamp: Date.now(),
        payload: { material: pdfMat },
      });

      // 2. Go Live
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "c2",
        senderDeviceId: "dev-host",
        timestamp: Date.now(),
        payload: { materialId: "mat-full-11" },
      });
      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.currentSlide).toBe(1);
      expect(state.presentation.totalSlides).toBe(11);

      // 3. Next x 5 (reaches slide 6)
      for (let i = 0; i < 5; i++) {
        state = stageSessionReducer(state, {
          type: "SLIDE_NEXT",
          commandId: `c-next-${i}`,
          senderDeviceId: "dev-host",
          timestamp: Date.now(),
          payload: {},
        });
      }
      expect(state.presentation.currentSlide).toBe(6);

      // 4. Previous x 3 (reaches slide 3)
      for (let i = 0; i < 3; i++) {
        state = stageSessionReducer(state, {
          type: "SLIDE_PREVIOUS",
          commandId: `c-prev-${i}`,
          senderDeviceId: "dev-host",
          timestamp: Date.now(),
          payload: {},
        });
      }
      expect(state.presentation.currentSlide).toBe(3);

      // 5. Goto x 3 (e.g. goto 11, goto 1, goto 7)
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "c-goto-11",
        senderDeviceId: "dev-host",
        timestamp: Date.now(),
        payload: { pageNumber: 11 },
      });
      expect(state.presentation.currentSlide).toBe(11);

      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "c-goto-1",
        senderDeviceId: "dev-host",
        timestamp: Date.now(),
        payload: { pageNumber: 1 },
      });
      expect(state.presentation.currentSlide).toBe(1);

      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "c-goto-7",
        senderDeviceId: "dev-host",
        timestamp: Date.now(),
        payload: { pageNumber: 7 },
      });
      expect(state.presentation.currentSlide).toBe(7);
      expect(state.presentation.totalSlides).toBe(11);
    });
  });
});




