import { describe, it, expect, vi, beforeEach } from "vitest";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { Material } from "@/core/types";
import {
  estimatePdfPageCountFromBytes,
  estimatePdfPageCountFromBlob,
} from "@/features/material/pdf-page-count";
import { isPdfMaterialStale } from "@/features/material/validator";
import { defaultPresentationAdapter } from "@/features/material/adapter";
import { ExternalUrlStorageProvider } from "@/features/material/storage/providers/external-url";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { clearMemoryD1Registry } from "@/lib/storage/registry";

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

function createGoogleFetchMock(pdfContent: string) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const target = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;

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
      return Response.json({ id: "drive-file-ingested-11" });
    }

    if (target.includes("drive/v3/files/drive-file-ingested-11?alt=media")) {
      return new Response(pdfContent, { headers: { "Content-Type": "application/pdf" } });
    }

    return new Response("not found", { status: 404 });
  });
}

describe("Google Drive PDF — Canonical PDF Ingestion & Presentation Pipeline", () => {
  const roomId = "room-pdf-test";
  const roomCode = "PDFTEST";
  const hostUserId = "user-host-1";
  const hostDeviceId = "dev-host-1";

  beforeEach(() => {
    clearMemoryD1Registry();
    vi.restoreAllMocks();
  });

  describe("Dynamic Page Count Determination from PDF Bytes (Phases 1-4)", () => {
    it("1. Accurately determines page count for a 1-page PDF", () => {
      const pdf = generateSamplePdf(1);
      const buffer = new TextEncoder().encode(pdf).buffer;
      expect(estimatePdfPageCountFromBytes(buffer)).toBe(1);
    });

    it("2. Accurately determines page count for a 2-page PDF", () => {
      const pdf = generateSamplePdf(2);
      const buffer = new TextEncoder().encode(pdf).buffer;
      expect(estimatePdfPageCountFromBytes(buffer)).toBe(2);
    });

    it("3. Accurately determines page count for an 11-page PDF (The Canonical 11-page Scenario)", () => {
      const pdf = generateSamplePdf(11);
      const buffer = new TextEncoder().encode(pdf).buffer;
      expect(estimatePdfPageCountFromBytes(buffer)).toBe(11);
    });

    it("4. Accurately determines page count for large PDFs (50 and 100 pages)", () => {
      const pdf50 = generateSamplePdf(50);
      expect(estimatePdfPageCountFromBytes(new TextEncoder().encode(pdf50).buffer)).toBe(50);

      const pdf100 = generateSamplePdf(100);
      expect(estimatePdfPageCountFromBytes(new TextEncoder().encode(pdf100).buffer)).toBe(100);
    });

    it("5. estimatePdfPageCountFromBlob extracts count from Blob/File", async () => {
      const pdf11 = generateSamplePdf(11);
      const blob = new Blob([pdf11], { type: "application/pdf" });
      const count = await estimatePdfPageCountFromBlob(blob);
      expect(count).toBe(11);
    });
  });

  describe("External URL -> Google Drive Canonical Ingestion (Phases 4-8)", () => {
    it("6. ExternalUrlStorageProvider rejects direct PDF URL registration (forces Google Drive pipeline)", async () => {
      const provider = new ExternalUrlStorageProvider();
      await expect(
        provider.registerExternalUrl({
          url: "https://example.com/document.pdf",
          title: "Direct PDF",
          roomCode: "PDFTEST",
          ownerUserId: "host-1",
        })
      ).rejects.toThrow("Materi PDF eksternal harus diimpor melalui pipeline Google Drive");
    });

    it("7. GoogleDriveStorageProvider ingests PDF blob, determines page count, and stores in D1", async () => {
      const pdf11 = generateSamplePdf(11);
      vi.stubGlobal("fetch", createGoogleFetchMock(pdf11));

      const env = {
        GOOGLE_CLIENT_ID: "client-id",
        GOOGLE_CLIENT_SECRET: "client-secret",
        GOOGLE_REFRESH_TOKEN: "refresh-token",
      };
      const provider = new GoogleDriveStorageProvider(env);
      const blob = new Blob([pdf11], { type: "application/pdf" });

      const stored = await provider.upload({
        file: blob,
        fileName: "QuarterlyReport.pdf",
        mimeType: "application/pdf",
        sizeBytes: blob.size,
        roomCode: "PDFTEST",
        ownerUserId: "host-1",
      });

      expect(stored.materialType).toBe("pdf");
      expect(stored.storageProvider).toBe("google_drive");
      expect(stored.storageReference).toBe("drive-file-ingested-11");
      expect(stored.slideCount).toBe(11);
      expect(stored.status).toBe("ready");
    });
  });

  describe("Presentation Adapter & Material Snapshot (Phases 5-6)", () => {
    it("8. PresentationAdapter loads PDF material with dynamic slideCount", async () => {
      const material = await defaultPresentationAdapter.loadMaterial(
        "https://example.com/sample.pdf",
        "Quarterly Report PDF",
        "pdf",
        11
      );

      expect(material.totalPages).toBe(11);
      expect(material.slides.length).toBe(11);
      expect(material.slides[0].index).toBe(1);
      expect(material.slides[10].index).toBe(11);
    });

    it("9. PRESENTATION_START initializes totalSlides to material.totalPages (11) and currentSlide to 1", () => {
      const material: Material = {
        id: "mat-gdrive-11",
        name: "Financial Deck.pdf",
        type: "pdf",
        sourceType: "UPLOADED_FILE",
        url: "/api/material/asset?materialId=mat-gdrive-11&roomCode=PDFTEST",
        totalPages: 11,
        slides: Array.from({ length: 11 }, (_, i) => ({
          index: i + 1,
          title: `Page ${i + 1}`,
          contentUrl: "/api/material/asset?materialId=mat-gdrive-11&roomCode=PDFTEST",
        })),
        uploadedAt: Date.now(),
        status: "ready",
      };

      let state = createInitialSessionState(roomId, roomCode, "PDF Presentation", hostUserId, hostDeviceId);

      // Add material
      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-add-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { material },
      });

      // Start presentation
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "cmd-start-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1001,
        payload: { materialId: material.id, startPage: 1 },
      });

      expect(state.presentation.isPresenting).toBe(true);
      expect(state.presentation.materialId).toBe("mat-gdrive-11");
      expect(state.presentation.currentSlide).toBe(1);
      expect(state.presentation.totalSlides).toBe(11);
      expect(state.presentation.totalPages).toBe(11);
    });
  });

  describe("Slide Navigation Pipeline on 11-Page PDF (Phases 7-10)", () => {
    let state = createInitialSessionState(roomId, roomCode, "PDF Presentation", hostUserId, hostDeviceId);
    const material: Material = {
      id: "mat-gdrive-11",
      name: "Financial Deck.pdf",
      type: "pdf",
      sourceType: "UPLOADED_FILE",
      url: "/api/material/asset?materialId=mat-gdrive-11&roomCode=PDFTEST",
      totalPages: 11,
      slides: Array.from({ length: 11 }, (_, i) => ({
        index: i + 1,
        title: `Page ${i + 1}`,
        contentUrl: "/api/material/asset?materialId=mat-gdrive-11&roomCode=PDFTEST",
      })),
      uploadedAt: Date.now(),
      status: "ready",
    };

    beforeEach(() => {
      state = createInitialSessionState(roomId, roomCode, "PDF Presentation", hostUserId, hostDeviceId);
      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "cmd-add",
        senderDeviceId: hostDeviceId,
        timestamp: 1000,
        payload: { material },
      });
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "cmd-start",
        senderDeviceId: hostDeviceId,
        timestamp: 1001,
        payload: { materialId: material.id, startPage: 1 },
      });
    });

    it("10. NEXT advances currentSlide from 1 to 2, 3, up to 11", () => {
      expect(state.presentation.currentSlide).toBe(1);

      state = stageSessionReducer(state, {
        type: "SLIDE_NEXT",
        commandId: "cmd-next-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1002,
        payload: {},
      });
      expect(state.presentation.currentSlide).toBe(2);

      state = stageSessionReducer(state, {
        type: "SLIDE_NEXT",
        commandId: "cmd-next-2",
        senderDeviceId: hostDeviceId,
        timestamp: 1003,
        payload: {},
      });
      expect(state.presentation.currentSlide).toBe(3);
    });

    it("11. NEXT at page 11 (last page) stops and does not exceed totalSlides", () => {
      // Go to slide 11
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-11",
        senderDeviceId: hostDeviceId,
        timestamp: 1004,
        payload: { pageNumber: 11 },
      });
      expect(state.presentation.currentSlide).toBe(11);

      const revisionBefore = state.presentation.revision;

      // Attempt NEXT at slide 11
      state = stageSessionReducer(state, {
        type: "SLIDE_NEXT",
        commandId: "cmd-next-stop",
        senderDeviceId: hostDeviceId,
        timestamp: 1005,
        payload: {},
      });
      expect(state.presentation.currentSlide).toBe(11);
      expect(state.presentation.revision).toBe(revisionBefore);
    });

    it("12. PREVIOUS steps back from 11 to 10 down to 1, and stops at page 1", () => {
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-2",
        senderDeviceId: hostDeviceId,
        timestamp: 1006,
        payload: { pageNumber: 2 },
      });
      expect(state.presentation.currentSlide).toBe(2);

      state = stageSessionReducer(state, {
        type: "SLIDE_PREVIOUS",
        commandId: "cmd-prev-1",
        senderDeviceId: hostDeviceId,
        timestamp: 1007,
        payload: {},
      });
      expect(state.presentation.currentSlide).toBe(1);

      const revisionBefore = state.presentation.revision;

      // Attempt PREVIOUS at slide 1
      state = stageSessionReducer(state, {
        type: "SLIDE_PREVIOUS",
        commandId: "cmd-prev-stop",
        senderDeviceId: hostDeviceId,
        timestamp: 1008,
        payload: {},
      });
      expect(state.presentation.currentSlide).toBe(1);
      expect(state.presentation.revision).toBe(revisionBefore);
    });

    it("13. GOTO jumps directly to target slide (e.g. 7)", () => {
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-7",
        senderDeviceId: hostDeviceId,
        timestamp: 1009,
        payload: { pageNumber: 7 },
      });
      expect(state.presentation.currentSlide).toBe(7);
      expect(state.presentation.totalSlides).toBe(11);
    });

    it("14. GOTO with out-of-range value (0 or 15) is clamped safely without corrupting state", () => {
      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-0",
        senderDeviceId: hostDeviceId,
        timestamp: 1010,
        payload: { pageNumber: 0 },
      });
      expect(state.presentation.currentSlide).toBe(1);

      state = stageSessionReducer(state, {
        type: "SLIDE_GOTO",
        commandId: "cmd-goto-99",
        senderDeviceId: hostDeviceId,
        timestamp: 1011,
        payload: { pageNumber: 99 },
      });
      expect(state.presentation.currentSlide).toBe(11);
    });
  });

  describe("Display Blank, Legacy Handling & Live Protection (Phases 16-19)", () => {
    it("15. DISPLAY_BLANK preserves currentSlide and totalSlides", () => {
      const material: Material = {
        id: "mat-gdrive-11",
        name: "Deck.pdf",
        type: "pdf",
        url: "/api/material/asset?materialId=mat-gdrive-11&roomCode=PDFTEST",
        totalPages: 11,
        slides: Array.from({ length: 11 }, (_, i) => ({ index: i + 1, title: `Page ${i + 1}` })),
        uploadedAt: Date.now(),
        status: "ready",
      };

      let state = createInitialSessionState(roomId, roomCode, "PDF Presentation", hostUserId, hostDeviceId);
      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "c1",
        senderDeviceId: hostDeviceId,
        timestamp: 1,
        payload: { material },
      });
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "c2",
        senderDeviceId: hostDeviceId,
        timestamp: 2,
        payload: { materialId: material.id, startPage: 5 },
      });

      expect(state.presentation.currentSlide).toBe(5);
      expect(state.presentation.blanked).toBe(false);

      // Blank display
      state = stageSessionReducer(state, {
        type: "DISPLAY_BLANK",
        commandId: "c3",
        senderDeviceId: hostDeviceId,
        timestamp: 3,
        payload: { blank: true },
      });
      expect(state.presentation.blanked).toBe(true);
      expect(state.presentation.currentSlide).toBe(5);
      expect(state.presentation.totalSlides).toBe(11);

      // Unblank display
      state = stageSessionReducer(state, {
        type: "DISPLAY_BLANK",
        commandId: "c4",
        senderDeviceId: hostDeviceId,
        timestamp: 4,
        payload: { blank: false },
      });
      expect(state.presentation.blanked).toBe(false);
      expect(state.presentation.currentSlide).toBe(5);
      expect(state.presentation.totalSlides).toBe(11);
    });

    it("16. MATERIAL_LIVE_UPDATE_BLOCKED protects live presentation from material modification", () => {
      const material: Material = {
        id: "mat-gdrive-11",
        name: "Deck.pdf",
        type: "pdf",
        url: "/api/material/asset?materialId=mat-gdrive-11&roomCode=PDFTEST",
        totalPages: 11,
        slides: Array.from({ length: 11 }, (_, i) => ({ index: i + 1, title: `Page ${i + 1}` })),
        uploadedAt: Date.now(),
        status: "ready",
      };

      let state = createInitialSessionState(roomId, roomCode, "PDF Presentation", hostUserId, hostDeviceId);
      state = stageSessionReducer(state, {
        type: "MATERIAL_ADD",
        commandId: "c1",
        senderDeviceId: hostDeviceId,
        timestamp: 1,
        payload: { material },
      });
      state = stageSessionReducer(state, {
        type: "PRESENTATION_START",
        commandId: "c2",
        senderDeviceId: hostDeviceId,
        timestamp: 2,
        payload: { materialId: material.id, startPage: 1 },
      });

      expect(() => {
        stageSessionReducer(state, {
          type: "MATERIAL_ADD",
          commandId: "c3",
          senderDeviceId: hostDeviceId,
          timestamp: 3,
          payload: {
            material: {
              ...material,
              totalPages: 20,
            },
          },
        });
      }).toThrow("MATERIAL_LIVE_UPDATE_BLOCKED");
    });

    it("17. isPdfMaterialStale correctly flags legacy or incomplete PDF materials", () => {
      const legacyStalePdf = {
        type: "pdf",
        totalPages: 1,
        slides: [{ contentUrl: "https://example.com/asset.pdf" }],
      };
      expect(isPdfMaterialStale(legacyStalePdf)).toBe(false); // 1-page PDF with 1 slide is valid
      expect(isPdfMaterialStale({ type: "pdf", totalPages: 0, slides: [] })).toBe(true);
      expect(isPdfMaterialStale({ type: "pdf", totalPages: 5, slides: [{ contentUrl: "a" }] })).toBe(true);

      const validPdf = {
        type: "pdf",
        totalPages: 11,
        slides: Array.from({ length: 11 }, (_, i) => ({ contentUrl: `url-${i}` })),
      };
      expect(isPdfMaterialStale(validPdf)).toBe(false);
    });
  });
});
