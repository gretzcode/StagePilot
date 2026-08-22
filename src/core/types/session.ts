import { DeviceState, DisplayMode } from "./device";
import { Material, PresentationState, DeviceMaterialCacheEntry } from "./presentation";
import { TimerState } from "./timer";
import { BriefState } from "./brief";
import { ScreenShareSource } from "./screen-share";
import { LiveSourceReference } from "./source";

export interface DisplayState {
  id: string;
  mode: DisplayMode;
  role?: DisplayMode;
  isBlanked: boolean;
  theme: "dark" | "light";
  customMessage?: string;
}

export interface RoomSessionInfo {
  roomId: string;
  roomCode: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isActive: boolean;
}

export interface HostSessionInfo {
  hostUserId: string;
  hostDeviceId: string | null;
  isHostConnected: boolean;
}

export interface StageSessionState {
  session: RoomSessionInfo;
  host: HostSessionInfo;
  activeControllerDeviceId: string | null;
  devices: Record<string, DeviceState>;
  materials: Material[];
  presentation: PresentationState;
  timer: TimerState;
  brief: BriefState;
  displays: Record<string, DisplayState>;
  screenShareSources: Record<string, ScreenShareSource>;
  liveSource: LiveSourceReference | null;
  materialCacheStatus?: Record<string, Record<string, DeviceMaterialCacheEntry>>;
  lastPrecacheRequest?: { materialId: string; requestedAt: number; targetDeviceId?: string };
  version: number;
}


