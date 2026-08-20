import { StageSessionState } from "../types";

export function createInitialSessionState(
  roomId: string,
  roomCode: string,
  title: string,
  hostUserId: string,
  hostDeviceId?: string
): StageSessionState {
  const now = Date.now();

  return {
    version: 1,
    session: {
      roomId,
      roomCode,
      title,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    },
    host: {
      hostUserId,
      hostDeviceId: hostDeviceId || hostUserId,
      isHostConnected: true,
    },
    devices: hostDeviceId
      ? {
          [hostDeviceId]: {
            id: hostDeviceId,
            name: "Host Primary Controller",
            userAgent: "System / StagePilot Host",
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
            connectedAt: now,
            lastSeenAt: now,
            isHostDevice: true,
          },
        }
      : {},
    materials: [],
    presentation: {
      isPresenting: false,
      materialId: null,
      currentSlide: 1,
      totalSlides: 1,
      totalPages: 1,
      status: "idle",
      revision: 1,
      currentSlideMetadata: null,
      nextSlideMetadata: null,
      blanked: false,
      blackoutMode: false,
      zoom: { scale: 1.0, panX: 0, panY: 0 },
      startedAt: null,
      updatedAt: now,
    },
    timer: {
      duration: 300,
      remaining: 300,
      status: "idle",
      mode: "countdown",
      startedAt: null,
      pausedAt: null,
      label: "Stage Timer",
      updatedAt: now,
    },
    brief: {
      activeMessage: null,
      history: [],
      updatedAt: now,
    },
    displays: {},
    screenShareSources: {},
    activeControllerDeviceId: hostDeviceId || hostUserId,
  };
}
