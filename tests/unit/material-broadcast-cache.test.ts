import { describe, it, expect } from "vitest";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { PermissionPolicy } from "@/core/permissions/policy";
import { StageCommand, Material } from "@/core/types";

describe("Material Broadcast Pre-Cache & Device Warm-Up", () => {
  const sampleMaterial: Material = {
    id: "mat-sample-123",
    name: "Keynote Presentation 2026.pdf",
    type: "pdf",
    url: "/api/material/asset?materialId=mat-sample-123",
    totalPages: 10,
    slides: Array.from({ length: 10 }, (_, i) => ({
      index: i + 1,
      title: `Slide ${i + 1}`,
      contentUrl: `/api/material/asset?materialId=mat-sample-123&slide=${i + 1}`,
    })),
    uploadedAt: Date.now(),
    status: "ready",
  };

  it("should initialize precache status for all active approved devices on MATERIAL_PRECACHE_REQUEST", () => {
    const initialState = createInitialSessionState("ROOM01", "Stage Room", "host-user", "dev-host-1");
    initialState.materials.push(sampleMaterial);

    // Register active audience TV and confidence monitor
    initialState.devices["dev-tv-1"] = {
      id: "dev-tv-1",
      name: "TV Audiens Utama",
      userAgent: "LG Smart TV",
      role: "audience",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: false,
        canControlTimer: false,
        canControlBrief: false,
        canBlankDisplay: false,
        canManageDevices: false,
        canManageRoom: false,
        canTakeoverControl: false,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    initialState.devices["dev-conf-1"] = {
      id: "dev-conf-1",
      name: "Confidence Monitor Depan",
      userAgent: "Chrome Windows",
      role: "confidence",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: false,
        canControlTimer: false,
        canControlBrief: false,
        canBlankDisplay: false,
        canManageDevices: false,
        canManageRoom: false,
        canTakeoverControl: false,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    const precacheCmd: StageCommand = {
      type: "MATERIAL_PRECACHE_REQUEST",
      commandId: "cmd-precache-1",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: {
        materialId: "mat-sample-123",
      },
    };

    const nextState = stageSessionReducer(initialState, precacheCmd);

    expect(nextState.lastPrecacheRequest).toBeDefined();
    expect(nextState.lastPrecacheRequest?.materialId).toBe("mat-sample-123");
    expect(nextState.materialCacheStatus?.["mat-sample-123"]).toBeDefined();

    const tvStatus = nextState.materialCacheStatus?.["mat-sample-123"]?.["dev-tv-1"];
    expect(tvStatus).toBeDefined();
    expect(tvStatus?.status).toBe("caching");
    expect(tvStatus?.deviceName).toBe("TV Audiens Utama");
  });

  it("should record device cache report acknowledging readiness", () => {
    const initialState = createInitialSessionState("ROOM01", "Stage Room", "host-user", "dev-host-1");
    initialState.materials.push(sampleMaterial);

    const reportCmd: StageCommand = {
      type: "MATERIAL_CACHE_REPORT",
      commandId: "cmd-report-1",
      senderDeviceId: "dev-tv-1",
      timestamp: Date.now(),
      payload: {
        materialId: "mat-sample-123",
        deviceId: "dev-tv-1",
        deviceName: "TV Audiens Utama",
        role: "audience",
        status: "cached",
        progress: 100,
      },
    };

    const nextState = stageSessionReducer(initialState, reportCmd);

    const entry = nextState.materialCacheStatus?.["mat-sample-123"]?.["dev-tv-1"];
    expect(entry).toBeDefined();
    expect(entry?.status).toBe("cached");
    expect(entry?.progress).toBe(100);
    expect(entry?.cachedAt).toBeGreaterThan(0);

    const updatedMaterial = nextState.materials.find((m) => m.id === "mat-sample-123");
    expect(updatedMaterial?.cacheStatus?.["dev-tv-1"]?.status).toBe("cached");
  });

  it("should allow display devices (audience & confidence) to send MATERIAL_CACHE_REPORT telemetry", () => {
    const state = createInitialSessionState("ROOM01", "Stage Room", "host-user", "dev-host-1");
    state.devices["dev-tv-1"] = {
      id: "dev-tv-1",
      name: "TV Audiens",
      userAgent: "Smart TV",
      role: "audience",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: false,
        canControlTimer: false,
        canControlBrief: false,
        canBlankDisplay: false,
        canManageDevices: false,
        canManageRoom: false,
        canTakeoverControl: false,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
    };

    const reportCmd: StageCommand = {
      type: "MATERIAL_CACHE_REPORT",
      commandId: "cmd-rep-tv",
      senderDeviceId: "dev-tv-1",
      timestamp: Date.now(),
      payload: {
        materialId: "mat-sample-123",
        deviceId: "dev-tv-1",
        deviceName: "TV Audiens",
        role: "audience",
        status: "cached",
        progress: 100,
      },
    };

    const check = PermissionPolicy.canExecuteCommand(state, "dev-tv-1", reportCmd);
    expect(check.allowed).toBe(true);
  });

  it("should clean up materialCacheStatus when a material is removed", () => {
    const initialState = createInitialSessionState("ROOM01", "Stage Room", "host-user", "dev-host-1");
    initialState.materials.push(sampleMaterial);
    initialState.materialCacheStatus = {
      "mat-sample-123": {
        "dev-tv-1": {
          deviceId: "dev-tv-1",
          deviceName: "TV Audiens",
          role: "audience",
          status: "cached",
          progress: 100,
        },
      },
    };

    const removeCmd: StageCommand = {
      type: "MATERIAL_REMOVE",
      commandId: "cmd-remove-1",
      senderDeviceId: "dev-host-1",
      timestamp: Date.now(),
      payload: {
        materialId: "mat-sample-123",
      },
    };

    const nextState = stageSessionReducer(initialState, removeCmd);
    expect(nextState.materialCacheStatus?.["mat-sample-123"]).toBeUndefined();
  });

  it("should store and retrieve blobs in materialBlobCache for 0ms local playback", async () => {
    const { setCachedMaterialBlob, getCachedMaterialBlobUrl, hasCachedMaterialBlob } = await import(
      "@/features/material/hooks/useMaterialQueuePreloader"
    );

    const testBlob = new Blob(["fake-mp4-video-data"], { type: "video/mp4" });
    const url = setCachedMaterialBlob("mat-video-999", testBlob);

    expect(url).toBeDefined();
    expect(hasCachedMaterialBlob("mat-video-999")).toBe(true);
    expect(getCachedMaterialBlobUrl("mat-video-999")).toBe(url);
  });
});