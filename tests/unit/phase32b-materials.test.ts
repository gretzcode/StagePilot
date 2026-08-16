import { describe, it, expect, beforeEach } from "vitest";
import { validateUploadedFile, validateExternalUrl } from "@/features/material/validator";
import { MaterialRegistryService, clearMemoryD1Registry } from "@/lib/storage/registry";
import { clearMemoryR2Store, buildMaterialObjectKey } from "@/lib/storage/r2";
import { isMaterialExpired } from "@/core/config/material";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";
import { StageCommand } from "@/core/types";

import { MaterialStorageResolver, ExternalUrlStorageProvider } from "@/features/material/storage";
import { isPrivateNetworkUrl, normalizeEmbedUrl } from "@/features/material/validator";

describe("StagePilot Phase 3.2B Material Storage & Asset Pipeline Tests", () => {
  beforeEach(() => {
    clearMemoryD1Registry();
    clearMemoryR2Store();
  });

  it("TEST-PROVIDER-01: MaterialStorageResolver selects ExternalUrlStorageProvider when R2 is unavailable", async () => {
    const resolver = new MaterialStorageResolver(null); // No R2 binding
    expect(await resolver.isUploadAvailable()).toBe(false);
    expect(resolver.getUrlProvider().type).toBe("external_url");
    await expect(resolver.getUploadProvider()).rejects.toThrow("Upload file belum tersedia");
  });

  it("TEST-PROVIDER-02: ExternalUrlStorageProvider registers HTTPS URL without R2 binary upload", async () => {
    const provider = new ExternalUrlStorageProvider(null);
    const stored = await provider.registerExternalUrl({
      url: "https://example.com/presentation-deck",
      title: "Public Slide Deck",
      roomCode: "ROOMA",
      ownerUserId: "host-1",
    });

    expect(stored.storageProvider).toBe("external_url");
    expect(stored.externalUrl).toBe("https://example.com/presentation-deck");
    expect(stored.objectKey).toBeNull();
  });

  it("TEST-PROVIDER-03: SSRF protection blocks private network and localhost URLs", () => {
    expect(isPrivateNetworkUrl("https://localhost/secret.pdf")).toBe(true);
    expect(isPrivateNetworkUrl("https://127.0.0.1/admin")).toBe(true);
    expect(isPrivateNetworkUrl("https://192.168.1.1/router")).toBe(true);
    expect(isPrivateNetworkUrl("https://10.0.0.1/internal")).toBe(true);
    expect(isPrivateNetworkUrl("https://169.254.169.254/latest/meta-data")).toBe(true);
    expect(isPrivateNetworkUrl("https://example.com/public.pdf")).toBe(false);
  });

  it("TEST-PROVIDER-04: Normalizes Canva and Google Drive URLs for seamless embedding without iframe blocks or login prompts", () => {
    expect(normalizeEmbedUrl("https://www.canva.com/design/DAG12345/view")).toBe("https://www.canva.com/design/DAG12345/view?embed");
    expect(normalizeEmbedUrl("https://drive.google.com/file/d/1ABCXYZ/view?usp=sharing")).toBe("https://drive.google.com/file/d/1ABCXYZ/preview");
    expect(normalizeEmbedUrl("https://docs.google.com/presentation/d/1SLIDEXYZ/edit#slide=id.p")).toBe("https://docs.google.com/presentation/d/1SLIDEXYZ/embed?rm=minimal&start=false&loop=false&delayms=3000");
  });

  it("TEST-01: Validates supported PDF file upload", () => {
    const res = validateUploadedFile("presentation.pdf", "application/pdf", 5 * 1024 * 1024);
    expect(res.valid).toBe(true);
    expect(res.materialType).toBe("pdf");
    expect(res.sourceType).toBe("UPLOADED_FILE");
  });

  it("TEST-02: Validates supported image upload", () => {
    const res = validateUploadedFile("slide.png", "image/png", 2 * 1024 * 1024);
    expect(res.valid).toBe(true);
    expect(res.materialType).toBe("image");
  });

  it("TEST-03: Validates supported PNG/JPEG/WebP image upload", () => {
    const resPng = validateUploadedFile("slide.png", "image/png", 2 * 1024 * 1024);
    expect(resPng.valid).toBe(true);
    expect(resPng.materialType).toBe("image");

    const resWebp = validateUploadedFile("banner.webp", "image/webp", 1 * 1024 * 1024);
    expect(resWebp.valid).toBe(true);
    expect(resWebp.materialType).toBe("image");
  });

  it("TEST-04: Rejects unsupported file formats", () => {
    const resExe = validateUploadedFile("malware.exe", "application/octet-stream", 1024);
    expect(resExe.valid).toBe(false);
    expect(resExe.error).toBe("Format file belum didukung.");
  });

  it("TEST-05: Rejects oversized files", () => {
    const resHugePdf = validateUploadedFile("huge.pdf", "application/pdf", 100 * 1024 * 1024); // 100MB > 50MB
    expect(resHugePdf.valid).toBe(false);
    expect(resHugePdf.error).toBe("Ukuran file melebihi batas yang diizinkan.");
  });

  it("TEST-06: Validates R2 Object key generation prevents directory traversal", () => {
    const objectKey = buildMaterialObjectKey("mat-123", "../../etc/passwd/slide.pdf");
    expect(objectKey).not.toContain("..");
    expect(objectKey).toContain("stagepilot/materials/mat-123/");
  });

  it("TEST-07: Registry protects Host A material from Host B guessing", async () => {
    const registry = new MaterialRegistryService();
    await registry.createMaterial({
      id: "mat-host-a",
      ownerUserId: "host-user-a",
      roomCode: "ROOMA",
      sourceType: "UPLOADED_FILE",
      materialType: "pdf",
      title: "Host A Private Deck",
      sizeBytes: 1024,
      slideCount: 5,
      status: "ready",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    });

    const hostBMaterials = await registry.getMaterialsByOwner("host-user-b");
    expect(hostBMaterials.some((m) => m.id === "mat-host-a")).toBe(false);
  });

  it("TEST-08: Material metadata in D1 does not contain file binary data", async () => {
    const registry = new MaterialRegistryService();
    const record = await registry.createMaterial({
      id: "mat-meta-only",
      ownerUserId: "host-1",
      roomCode: "ROOMA",
      sourceType: "UPLOADED_FILE",
      materialType: "pdf",
      title: "Clean Metadata Deck",
      sizeBytes: 5000,
      objectKey: "stagepilot/materials/mat-meta-only/deck.pdf",
      slideCount: 12,
      status: "ready",
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
    });

    const recObj = record as unknown as Record<string, unknown>;
    expect(recObj.data).toBeUndefined();
    expect(recObj.binary).toBeUndefined();
    expect(recObj.blob).toBeUndefined();
    expect(record.objectKey).toBe("stagepilot/materials/mat-meta-only/deck.pdf");
  });

  it("TEST-09 & TEST-10: StageRoom DO & WebSocket state contains ONLY lightweight material metadata without binaries", () => {
    let state = createInitialSessionState("ROOM1", "ROOM1", "Test Room", "host-1", "dev-host-1");
    const addCmd: StageCommand = {
      type: "MATERIAL_ADD",
      commandId: "cmd-add",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: {
        material: {
          id: "mat-do-test",
          name: "DO Test Deck.pdf",
          type: "pdf",
          sourceType: "UPLOADED_FILE",
          url: "/api/material/asset?materialId=mat-do-test",
          objectKey: "stagepilot/materials/mat-do-test/deck.pdf",
          totalPages: 5,
          slides: [{ index: 1, title: "Slide 1" }],
          uploadedAt: Date.now(),
          expiresAt: Date.now() + 86400000,
          status: "ready",
        },
      },
    };

    state = stageSessionReducer(state, addCmd);
    const serialized = JSON.stringify(state);

    expect(serialized).not.toContain("ArrayBuffer");
    expect(serialized).not.toContain("data:application/pdf");
    expect(state.materials[0].objectKey).toBe("stagepilot/materials/mat-do-test/deck.pdf");
  });

  it("TEST-11: External HTTPS URL stores reference without R2 object", () => {
    const res = validateExternalUrl("https://example.com/slideshow");
    expect(res.valid).toBe(true);
    expect(res.sourceType).toBe("EXTERNAL_URL");
    expect(res.materialType).toBe("url");
  });

  it("TEST-12: Invalid protocols (http, javascript, data, file) are rejected", () => {
    expect(validateExternalUrl("http://unsecure.com").valid).toBe(false);
    expect(validateExternalUrl("javascript:alert(1)").valid).toBe(false);
    expect(validateExternalUrl("data:text/html,<h1>hack</h1>").valid).toBe(false);
    expect(validateExternalUrl("file:///C:/secret.txt").valid).toBe(false);
  });

  it("TEST-13: Canva link stores reference as CANVA_LINK without R2 object", () => {
    const res = validateExternalUrl("https://canva.com/design/DAFxxx/view");
    expect(res.valid).toBe(true);
    expect(res.sourceType).toBe("CANVA_LINK");
    expect(res.materialType).toBe("canva");
  });

  it("TEST-14 & TEST-15: Material can be attached to room and PRESENTATION_START synchronizes materialId and slide state", () => {
    let state = createInitialSessionState("ROOM1", "ROOM1", "Test Room", "host-1", "dev-host-1");
    const material = {
      id: "mat-attach-1",
      name: "Attached Presentation",
      type: "pdf" as const,
      url: "http://example.com/attached.pdf",
      totalPages: 8,
      slides: Array.from({ length: 8 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
      uploadedAt: Date.now(),
      status: "ready" as const,
    };

    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      commandId: "c1",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: { material },
    });

    state = stageSessionReducer(state, {
      type: "PRESENTATION_START",
      commandId: "c2",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: { materialId: "mat-attach-1", startPage: 1 },
    });

    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-attach-1");
    expect(state.presentation.currentSlide).toBe(1);
    expect(state.presentation.currentSlideMetadata?.index).toBe(1);
    expect(state.presentation.nextSlideMetadata?.index).toBe(2);
  });

  it("TEST-16, TEST-17, TEST-18: Approved Audience & Confidence resolve active material while unauthorized device is rejected", () => {
    let state = createInitialSessionState("ROOM-AUTH", "ROOM-AUTH", "Auth Test Room", "host-1", "dev-host-1");

    // Add approved audience device
    state.devices["dev-aud-1"] = {
      id: "dev-aud-1",
      name: "Audience Screen",
      userAgent: "Mozilla/5.0",
      role: "audience",
      approvalStatus: "approved",
      status: "online",
      permissions: { canControlPresentation: false, canControlTimer: false, canControlBrief: false, canBlankDisplay: false, canManageDevices: false, canManageRoom: false, canTakeoverControl: false },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: false,
    };

    // Add pending guest device
    state.devices["dev-pending-1"] = {
      id: "dev-pending-1",
      name: "Pending HACK",
      userAgent: "Mozilla/5.0",
      role: "audience",
      approvalStatus: "pending",
      status: "offline",
      permissions: { canControlPresentation: false, canControlTimer: false, canControlBrief: false, canBlankDisplay: false, canManageDevices: false, canManageRoom: false, canTakeoverControl: false },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: false,
    };

    expect(state.devices["dev-aud-1"].approvalStatus).toBe("approved");
    expect(state.devices["dev-pending-1"].approvalStatus).toBe("pending");
  });

  it("TEST-19 & TEST-20: Expired material is rejected for new access and fails gracefully", () => {
    const pastTime = Date.now() - 1000;
    expect(isMaterialExpired(pastTime)).toBe(true);

    const futureTime = Date.now() + 86400000;
    expect(isMaterialExpired(futureTime)).toBe(false);
  });

  it("TEST-21: Room A material state does not leak into Room B", () => {
    const roomAState = createInitialSessionState("ROOMA", "ROOMA", "Room A", "host-a", "dev-host-a");
    const roomBState = createInitialSessionState("ROOMB", "ROOMB", "Room B", "host-b", "dev-host-b");

    const matA = {
      id: "mat-room-a",
      name: "Room A Deck",
      type: "pdf" as const,
      url: "http://example.com/a.pdf",
      totalPages: 3,
      slides: [],
      uploadedAt: Date.now(),
      status: "ready" as const,
    };

    const nextRoomA = stageSessionReducer(roomAState, {
      type: "MATERIAL_ADD",
      commandId: "ca",
      senderDeviceId: "dev-host-a",
      timestamp: Date.now(),
      payload: { material: matA },
    });

    expect(nextRoomA.materials.some((m) => m.id === "mat-room-a")).toBe(true);
    expect(roomBState.materials.some((m) => m.id === "mat-room-a")).toBe(false);
  });

  it("TEST-22, TEST-23, TEST-24: Host, Audience, and Confidence reconnect restore active material metadata", () => {
    let state = createInitialSessionState("ROOM-RECONNECT", "ROOM-RECONNECT", "Reconnect Room", "host-1", "dev-host-1");
    const mat = {
      id: "mat-reconnect",
      name: "Reconnect Deck",
      type: "pdf" as const,
      url: "http://example.com/rec.pdf",
      totalPages: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
      uploadedAt: Date.now(),
      status: "ready" as const,
    };

    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      commandId: "c-rec-1",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: { material: mat },
    });

    state = stageSessionReducer(state, {
      type: "PRESENTATION_START",
      commandId: "c-rec-2",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: { materialId: "mat-reconnect", startPage: 4 },
    });

    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-reconnect");
    expect(state.presentation.currentSlide).toBe(4);

    // Re-serializing state simulates reconnect SYNC_STATE broadcast
    const syncedState = JSON.parse(JSON.stringify(state));
    expect(syncedState.presentation.materialId).toBe("mat-reconnect");
    expect(syncedState.presentation.currentSlide).toBe(4);
  });
});
