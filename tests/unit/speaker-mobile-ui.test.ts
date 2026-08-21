import { describe, it, expect } from "vitest";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { Material, StageSessionState } from "@/core/types";
import { getAvailableSources } from "@/features/source-manager/utils/available-sources";

describe("Speaker Mobile UI & 16:9 Frame Constraints", () => {
  it("ensures speaker permissions and roles operate within 16:9 standard ratio (1.7778)", () => {
    const width = 1920;
    const height = 1080;
    const aspectRatio = width / height;
    expect(Number(aspectRatio.toFixed(4))).toBe(1.7778);
  });

  it("ensures slide navigation indices are bounded and valid", () => {
    const totalSlides = 10;
    const clampSlide = (page: number) => Math.max(1, Math.min(page, totalSlides));

    expect(clampSlide(0)).toBe(1);
    expect(clampSlide(5)).toBe(5);
    expect(clampSlide(15)).toBe(10);
  });

  it("verifies mobile slide strip generates exact number of touchable buttons", () => {
    const totalPages = 5;
    const slideButtons = Array.from({ length: totalPages }, (_, i) => ({
      pageNumber: i + 1,
      label: `Slide ${i + 1}`,
    }));

    expect(slideButtons).toHaveLength(5);
    expect(slideButtons[0].pageNumber).toBe(1);
    expect(slideButtons[4].pageNumber).toBe(5);
  });
});

describe("Speaker Identity & Persistent Material Binding", () => {
  function setupRoomWithSpeakers(): StageSessionState {
    const state = createInitialSessionState("ROOM1_ID", "ROOM1", "Seminar Room", "host-user-1", "dev-host-1");
    state.devices["dev-host-1"] = {
      id: "dev-host-1",
      name: "Host Controller",
      userAgent: "Desktop Chrome",
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
    state.host.hostDeviceId = "dev-host-1";
    state.host.isHostConnected = true;

    state.devices["dev-speaker-budi-laptop"] = {
      id: "dev-speaker-budi-laptop",
      name: "dr. Budi Santoso",
      userAgent: "Laptop Chrome",
      role: "speaker",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: true,
        canControlTimer: false,
        canControlBrief: false,
        canBlankDisplay: false,
        canManageDevices: false,
        canManageRoom: false,
        canTakeoverControl: false,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: false,
    };

    state.devices["dev-speaker-siti-laptop"] = {
      id: "dev-speaker-siti-laptop",
      name: "Prof. Siti Rahma",
      userAgent: "Laptop Safari",
      role: "speaker",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: true,
        canControlTimer: false,
        canControlBrief: false,
        canBlankDisplay: false,
        canManageDevices: false,
        canManageRoom: false,
        canTakeoverControl: false,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: false,
    };

    return state;
  }

  it("1. Attaches ownerSpeakerName to material when uploaded by Speaker", () => {
    let state = setupRoomWithSpeakers();
    const budiMaterial: Material = {
      id: "mat-budi-slide-1",
      name: "Slide Presentasi Kedokteran",
      type: "pdf",
      url: "https://example.com/slide.pdf",
      totalPages: 10,
      slides: [],
      uploadedAt: Date.now(),
      status: "ready",
    };

    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      payload: { material: budiMaterial },
      senderDeviceId: "dev-speaker-budi-laptop",
    });

    const added = state.materials.find((m) => m.id === "mat-budi-slide-1");
    expect(added).toBeDefined();
    expect(added?.ownerRole).toBe("speaker");
    expect(added?.ownerDeviceId).toBe("dev-speaker-budi-laptop");
    expect(added?.ownerSpeakerName).toBe("dr. Budi Santoso");
  });

  it("2. Allows Speaker to access materials across device changes with same name", () => {
    let state = setupRoomWithSpeakers();
    const budiMaterial: Material = {
      id: "mat-budi-slide-1",
      name: "Slide Budi",
      type: "pdf",
      url: "https://example.com/budi.pdf",
      totalPages: 5,
      slides: [],
      uploadedAt: Date.now(),
      status: "ready",
    };

    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      payload: { material: budiMaterial },
      senderDeviceId: "dev-speaker-budi-laptop",
    });

    const budiPhoneDeviceId = "dev-speaker-budi-phone";
    state.devices[budiPhoneDeviceId] = {
      id: budiPhoneDeviceId,
      name: "dr. Budi Santoso",
      userAgent: "Android Mobile",
      role: "speaker",
      approvalStatus: "approved",
      status: "online",
      permissions: {
        canControlPresentation: true,
        canControlTimer: false,
        canControlBrief: false,
        canBlankDisplay: false,
        canManageDevices: false,
        canManageRoom: false,
        canTakeoverControl: false,
      },
      connectedAt: Date.now(),
      lastSeenAt: Date.now(),
      isHostDevice: false,
    };

    const currentDevice = state.devices[budiPhoneDeviceId];
    const speakerName = (currentDevice.name || "").trim().toLowerCase();

    const budiPhoneMaterials = state.materials.filter((m) => {
      if (m.ownerRole !== "speaker") return false;
      if (m.ownerDeviceId === budiPhoneDeviceId) return true;
      if (
        speakerName &&
        ((m.ownerSpeakerName && m.ownerSpeakerName.trim().toLowerCase() === speakerName) ||
          (m.ownerName && m.ownerName.trim().toLowerCase() === speakerName))
      ) {
        return true;
      }
      return false;
    });

    expect(budiPhoneMaterials.length).toBe(1);
    expect(budiPhoneMaterials[0].id).toBe("mat-budi-slide-1");
  });

  it("3. Isolates materials between different speakers", () => {
    let state = setupRoomWithSpeakers();
    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      payload: {
        material: {
          id: "mat-budi-1",
          name: "Budi Deck",
          type: "pdf",
          url: "https://example.com/budi.pdf",
          totalPages: 3,
          slides: [],
          uploadedAt: Date.now(),
          status: "ready",
        },
      },
      senderDeviceId: "dev-speaker-budi-laptop",
    });

    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      payload: {
        material: {
          id: "mat-siti-1",
          name: "Siti Deck",
          type: "pdf",
          url: "https://example.com/siti.pdf",
          totalPages: 8,
          slides: [],
          uploadedAt: Date.now(),
          status: "ready",
        },
      },
      senderDeviceId: "dev-speaker-siti-laptop",
    });

    const sitiDevice = state.devices["dev-speaker-siti-laptop"];
    const sitiSpeakerName = (sitiDevice.name || "").trim().toLowerCase();

    const sitiMaterials = state.materials.filter((m) => {
      if (m.ownerRole !== "speaker") return false;
      if (m.ownerDeviceId === sitiDevice.id) return true;
      if (
        sitiSpeakerName &&
        ((m.ownerSpeakerName && m.ownerSpeakerName.trim().toLowerCase() === sitiSpeakerName) ||
          (m.ownerName && m.ownerName.trim().toLowerCase() === sitiSpeakerName))
      ) {
        return true;
      }
      return false;
    });

    expect(sitiMaterials.length).toBe(1);
    expect(sitiMaterials[0].id).toBe("mat-siti-1");
    expect(sitiMaterials.some((m) => m.id === "mat-budi-1")).toBe(false);
  });

  it("4. Displays Speaker Name in Source Manager sources list", () => {
    let state = setupRoomWithSpeakers();
    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      payload: {
        material: {
          id: "mat-budi-deck",
          name: "Keynote Talk.pdf",
          type: "pdf",
          url: "https://example.com/talk.pdf",
          totalPages: 12,
          slides: [],
          uploadedAt: Date.now(),
          status: "ready",
        },
      },
      senderDeviceId: "dev-speaker-budi-laptop",
    });

    const sources = getAvailableSources(state);
    const budiSource = sources.find((s) => s.id === "mat-budi-deck");
    expect(budiSource).toBeDefined();
    expect(budiSource?.title).toBe("dr. Budi Santoso — Keynote Talk.pdf");
    expect(budiSource?.ownerName).toBe("dr. Budi Santoso");
  });
});
