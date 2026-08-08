import { create } from "zustand";
import { StageSessionState, StageCommand } from "@/core/types";
import { StagePilotRealtimeClient } from "@/core/realtime/client";

interface StageRoomStoreState {
  roomState: StageSessionState | null;
  connectionStatus: "connecting" | "connected" | "disconnected" | "reconnecting";
  currentDeviceId: string | null;
  client: StagePilotRealtimeClient | null;
  setClient: (client: StagePilotRealtimeClient, deviceId: string) => void;
  updateRoomState: (state: StageSessionState) => void;
  setConnectionStatus: (status: "connecting" | "connected" | "disconnected" | "reconnecting") => void;
  sendCommand: (command: StageCommand) => void;
}

export const useStageRoomStore = create<StageRoomStoreState>((set, get) => ({
  roomState: null,
  connectionStatus: "disconnected",
  currentDeviceId: null,
  client: null,

  setClient: (client, deviceId) => {
    set({ client, currentDeviceId: deviceId });
    client.onStateChange((state) => {
      set({ roomState: state });
    });
    client.onStatusChange((status) => {
      set({ connectionStatus: status });
    });
    client.connect();
  },

  updateRoomState: (roomState) => set({ roomState }),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  sendCommand: (command) => {
    const { client } = get();
    if (!client) {
      console.warn("Cannot send command: client is not initialized");
      return;
    }
    client.sendCommand(command);
  },
}));
