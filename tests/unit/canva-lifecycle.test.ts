import { describe, expect, it } from "vitest";
import { isCanvaMaterialStale } from "@/features/material/validator";
import { Material, StageSessionState } from "@/core/types";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";

describe("Canva Material Lifecycle & Stale Detection", () => {
  it("TEST 1 & TEST 5 — Valid One-Slide Canva Snapshot is READY (not NEEDS_SYNC)", () => {
    const validOneSlideMaterial: Material = {
      id: "mat-canva-1slide-valid",
      name: "One-Page Infographic",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 1,
      slides: [
        {
          index: 1,
          title: "Infographic",
          url: "https://document-export.canva.com/DAG123/slide_1.jpg",
          contentUrl: "https://document-export.canva.com/DAG123/slide_1.jpg",
        },
      ],
      url: "https://document-export.canva.com/DAG123/slide_1.jpg",
      objectKey: null,
      externalUrl: "https://www.canva.com/design/DAG123/view",
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    expect(isCanvaMaterialStale(validOneSlideMaterial)).toBe(false);
  });

  it("TEST 2 — Valid Multi-Slide Canva Snapshot is READY", () => {
    const valid17SlideMaterial: Material = {
      id: "mat-canva-17slide-valid",
      name: "Annual Keynote Deck",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 17,
      slides: Array.from({ length: 17 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        url: `https://document-export.canva.com/DAG17/slide_${i + 1}.jpg`,
        contentUrl: `https://document-export.canva.com/DAG17/slide_${i + 1}.jpg`,
      })),
      url: "https://document-export.canva.com/DAG17/slide_1.jpg",
      objectKey: null,
      externalUrl: "https://www.canva.com/design/DAG17/view",
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    expect(isCanvaMaterialStale(valid17SlideMaterial)).toBe(false);
  });

  it("TEST 3 — Legacy Canva iframe Material is NEEDS_SYNC", () => {
    const legacyMaterial: Material = {
      id: "mat-canva-legacy-multi",
      name: "Legacy Embedded Deck",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 5,
      slides: [
        {
          index: 1,
          title: "Slide 1",
          url: "https://www.canva.com/design/DAG999/view?embed",
          contentUrl: "https://www.canva.com/design/DAG999/view?embed",
        },
      ],
      url: "https://www.canva.com/design/DAG999/view?embed",
      objectKey: null,
      externalUrl: "https://www.canva.com/design/DAG999/view",
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    expect(isCanvaMaterialStale(legacyMaterial)).toBe(true);
  });

  it("TEST 4 — Legacy Material With One Slide is NEEDS_SYNC based on format, not slide count", () => {
    const legacyOneSlide: Material = {
      id: "mat-canva-legacy-1",
      name: "Legacy Single Slide",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 1,
      slides: [
        {
          index: 1,
          title: "Slide 1",
          url: "https://www.canva.com/design/DAG001/view",
          contentUrl: "https://www.canva.com/design/DAG001/view",
        },
      ],
      url: "https://www.canva.com/design/DAG001/view",
      objectKey: null,
      externalUrl: "https://www.canva.com/design/DAG001/view",
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    expect(isCanvaMaterialStale(legacyOneSlide)).toBe(true);
  });
});

describe("Authoritative Server-Side Live Material Protection", () => {
  const hostDeviceId = "dev-host-001";

  function setupInitialState(): StageSessionState {
    const state = createInitialSessionState("ROOM123", "ROOM123", "Main Stage", "user-host-1");
    state.devices[hostDeviceId] = {
      id: hostDeviceId,
      name: "Host Controller",
      userAgent: "Test Agent",
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
    return state;
  }

  it("TEST 6 — Update Non-Live Material is ACCEPTED", () => {
    let state = setupInitialState();

    const matA: Material = {
      id: "mat-A",
      name: "Deck A Initial",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 1,
      slides: [{ index: 1, title: "Slide 1", contentUrl: "https://document-export.canva.com/v1.jpg" }],
      url: "https://document-export.canva.com/v1.jpg",
      objectKey: null,
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    state = stageSessionReducer(state, {
      commandId: "cmd-1",
      type: "MATERIAL_ADD",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: matA },
    });

    expect(state.materials.length).toBe(1);
    expect(state.materials[0].name).toBe("Deck A Initial");

    // Send MATERIAL_UPDATE when presentation is NOT live
    const matAUpdated: Material = {
      ...matA,
      name: "Deck A Re-imported (17 Slides)",
      totalPages: 17,
      slides: Array.from({ length: 17 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        contentUrl: `https://document-export.canva.com/slide_${i + 1}.jpg`,
      })),
    };

    state = stageSessionReducer(state, {
      commandId: "cmd-2",
      type: "MATERIAL_UPDATE",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: matAUpdated },
    });

    expect(state.materials.length).toBe(1);
    expect(state.materials[0].name).toBe("Deck A Re-imported (17 Slides)");
    expect(state.materials[0].totalPages).toBe(17);
    expect(state.materials[0].slides.length).toBe(17);
  });

  it("TEST 7 & TEST 10 — Update Active Live Material is REJECTED by Durable Object reducer with MATERIAL_LIVE_UPDATE_BLOCKED", () => {
    let state = setupInitialState();

    const matA: Material = {
      id: "mat-A",
      name: "Deck A Live Snapshot",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 5,
      slides: Array.from({ length: 5 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        contentUrl: `https://document-export.canva.com/a_${i + 1}.jpg`,
      })),
      url: "https://document-export.canva.com/a_1.jpg",
      objectKey: null,
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    state = stageSessionReducer(state, {
      commandId: "cmd-1",
      type: "MATERIAL_ADD",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: matA },
    });

    // Start presentation with Material A
    state = stageSessionReducer(state, {
      commandId: "cmd-start",
      type: "PRESENTATION_START",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-A", startPage: 1 },
    });

    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-A");

    // Attempt to bypass UI and directly send MATERIAL_UPDATE or MATERIAL_ADD for active live material
    const mutatedMatA: Material = {
      ...matA,
      name: "Deck A Mutated Maliciously",
      totalPages: 10,
    };

    expect(() => {
      stageSessionReducer(state, {
        commandId: "cmd-illegal-update",
        type: "MATERIAL_UPDATE",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { material: mutatedMatA },
      });
    }).toThrow(/MATERIAL_LIVE_UPDATE_BLOCKED/);

    expect(() => {
      stageSessionReducer(state, {
        commandId: "cmd-illegal-add",
        type: "MATERIAL_ADD",
        senderDeviceId: hostDeviceId,
        timestamp: Date.now(),
        payload: { material: mutatedMatA },
      });
    }).toThrow(/MATERIAL_LIVE_UPDATE_BLOCKED/);

    // Assert that Material A remains completely untouched
    expect(state.materials[0].name).toBe("Deck A Live Snapshot");
    expect(state.materials[0].totalPages).toBe(5);
    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-A");
  });

  it("TEST 8 — Update Different Material While Presentation Is Live is ACCEPTED", () => {
    let state = setupInitialState();

    const matA: Material = {
      id: "mat-A",
      name: "Deck A (Live)",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 5,
      slides: Array.from({ length: 5 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        contentUrl: `https://document-export.canva.com/a_${i + 1}.jpg`,
      })),
      url: "https://document-export.canva.com/a_1.jpg",
      objectKey: null,
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    const matB: Material = {
      id: "mat-B",
      name: "Deck B (Queue)",
      type: "canva",
      sourceType: "CANVA_LINK",
      totalPages: 3,
      slides: Array.from({ length: 3 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        contentUrl: `https://document-export.canva.com/b_${i + 1}.jpg`,
      })),
      url: "https://document-export.canva.com/b_1.jpg",
      objectKey: null,
      sizeBytes: 0,
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      ownerUserId: "user-1",
      status: "ready",
    };

    state = stageSessionReducer(state, {
      commandId: "cmd-add-a",
      type: "MATERIAL_ADD",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: matA },
    });

    state = stageSessionReducer(state, {
      commandId: "cmd-add-b",
      type: "MATERIAL_ADD",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: matB },
    });

    // Go live with Material A
    state = stageSessionReducer(state, {
      commandId: "cmd-start-a",
      type: "PRESENTATION_START",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-A", startPage: 1 },
    });

    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-A");

    // Update Material B (which is in queue, not live)
    const matBUpdated: Material = {
      ...matB,
      name: "Deck B Re-imported (10 Slides)",
      totalPages: 10,
    };

    state = stageSessionReducer(state, {
      commandId: "cmd-update-b",
      type: "MATERIAL_UPDATE",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: matBUpdated },
    });

    // Material B updated successfully
    const targetB = state.materials.find((m) => m.id === "mat-B");
    expect(targetB?.name).toBe("Deck B Re-imported (10 Slides)");
    expect(targetB?.totalPages).toBe(10);

    // Active presentation with Material A remains untouched and live
    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.materialId).toBe("mat-A");
    const targetA = state.materials.find((m) => m.id === "mat-A");
    expect(targetA?.name).toBe("Deck A (Live)");
  });
});
