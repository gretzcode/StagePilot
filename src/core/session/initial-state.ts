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
      currentPage: 1,
      totalPages: 1,
      currentSlide: null,
      nextSlide: null,
      blanked: false,
      blackoutMode: false,
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
    activeControllerDeviceId: hostDeviceId || hostUserId,
  };
}
