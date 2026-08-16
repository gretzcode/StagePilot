import { beforeEach, describe, expect, it, vi } from "vitest";
import { estimatePdfPageCountFromBytes } from "@/features/material/pdf-page-count";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { clearMemoryD1Registry, MaterialRegistryService } from "@/lib/storage/registry";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { Material } from "@/core/types";

const samplePdf = `%PDF-1.7
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
5 0 obj
<< /Type /Page /Parent 2 0 R >>
endobj
%%EOF`;

function pdfFile(name = "deck.pdf") {
  return new File([samplePdf], name, { type: "application/pdf" });
}

function createGoogleFetchMock() {
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
      return Response.json({ id: "drive-file-pdf-1" });
    }

    if (target.includes("drive/v3/files/drive-file-pdf-1?alt=media")) {
      return new Response(samplePdf, { headers: { "Content-Type": "application/pdf" } });
    }

    return new Response("not found", { status: 404 });
  });
}

describe("Phase 3.3A Google Drive PDF presentation", () => {
  beforeEach(() => {
    clearMemoryD1Registry();
    vi.restoreAllMocks();
  });

  it("extracts actual PDF page count without hard-coded fallback", () => {
    const buffer = new TextEncoder().encode(samplePdf).buffer;
    expect(estimatePdfPageCountFromBytes(buffer)).toBe(3);
  });

  it("uploads Google Drive PDF, stores metadata in registry, and keeps Drive ID server-side", async () => {
    const fetchMock = createGoogleFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const env = {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    };
    const provider = new GoogleDriveStorageProvider(env);
    const file = pdfFile();

    const stored = await provider.upload({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      roomCode: "ROOMA",
      ownerUserId: "host-1",
    });

    expect(stored).toMatchObject({
      materialType: "pdf",
      storageProvider: "google_drive",
      storageReference: "drive-file-pdf-1",
      objectKey: null,
      externalUrl: null,
      slideCount: 3,
      status: "ready",
    });

    const registry = new MaterialRegistryService(env);
    const record = await registry.getMaterialById(stored.id);
    expect(record).toMatchObject({
      id: stored.id,
      ownerUserId: "host-1",
      roomCode: "ROOMA",
      storageProvider: "google_drive",
      storageReference: "drive-file-pdf-1",
      materialType: "pdf",
      slideCount: 3,
    });
  });

  it("resolves Google Drive PDF through StagePilot asset URL and rejects wrong rooms", async () => {
    vi.stubGlobal("fetch", createGoogleFetchMock());
    const env = {
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    };
    const provider = new GoogleDriveStorageProvider(env);
    const file = pdfFile();
    const stored = await provider.upload({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      roomCode: "ROOMA",
      ownerUserId: "host-1",
    });

    const resolved = await provider.resolve({ materialId: stored.id, roomCode: "ROOMA" });
    expect(resolved).toMatchObject({
      materialId: stored.id,
      materialType: "pdf",
      provider: "google_drive",
      totalPages: 3,
    });
    expect(resolved.sourceUrl).toContain(`/api/material/asset?materialId=${stored.id}`);
    expect(resolved.sourceUrl).toContain("roomCode=ROOMA");

    await expect(provider.resolve({ materialId: stored.id, roomCode: "ROOMB" })).rejects.toThrow("Akses materi ditolak");
  });

  it("keeps PDF presentation navigation provider-agnostic in StageRoom reducer", () => {
    const material: Material = {
      id: "mat-pdf-gdrive",
      name: "Deck.pdf",
      type: "pdf",
      sourceType: "UPLOADED_FILE",
      url: "/api/material/asset?materialId=mat-pdf-gdrive&roomCode=ROOMA",
      objectKey: null,
      externalUrl: null,
      totalPages: 3,
      slides: [1, 2, 3].map((page) => ({
        index: page,
        title: `Page ${page}`,
        contentUrl: "/api/material/asset?materialId=mat-pdf-gdrive&roomCode=ROOMA",
      })),
      uploadedAt: Date.now(),
      status: "ready",
    };

    let state = createInitialSessionState("room-a", "ROOMA", "Room A", "host-1");
    state.devices["host-1"] = {
      id: "host-1",
      name: "Host",
      userAgent: "test",
      role: "host",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: true,
        canControlTimer: true,
        canControlBrief: true,
        canBlankDisplay: true,
        canManageDevices: true,
        canManageRoom: true,
        canTakeoverControl: true,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: true,
    };

    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      commandId: "cmd-add",
      senderDeviceId: "host-1",
      timestamp: Date.now(),
      payload: { material },
    });

    state = stageSessionReducer(state, {
      type: "PRESENTATION_START",
      commandId: "cmd-start",
      senderDeviceId: "host-1",
      timestamp: Date.now(),
      payload: { materialId: material.id, startPage: 1 },
    });
    expect(state.presentation.currentSlide).toBe(1);

    state = stageSessionReducer(state, {
      type: "SLIDE_NEXT",
      commandId: "cmd-next",
      senderDeviceId: "host-1",
      timestamp: Date.now(),
      payload: {},
    });
    expect(state.presentation.currentSlide).toBe(2);

    state = stageSessionReducer(state, {
      type: "SLIDE_GOTO",
      commandId: "cmd-goto",
      senderDeviceId: "host-1",
      timestamp: Date.now(),
      payload: { pageNumber: 3 },
    });
    expect(state.presentation.currentSlide).toBe(3);

    state = stageSessionReducer(state, {
      type: "SLIDE_PREVIOUS",
      commandId: "cmd-prev",
      senderDeviceId: "host-1",
      timestamp: Date.now(),
      payload: {},
    });
    expect(state.presentation.currentSlide).toBe(2);
  });
});
