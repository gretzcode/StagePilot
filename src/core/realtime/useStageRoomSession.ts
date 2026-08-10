"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { StageSessionState, StageCommand, DeviceApprovalStatus } from "@/core/types";
import { ServerMessage } from "@/core/realtime/protocol";

import { stageSessionReducer } from "@/core/session/reducer";

export interface UseStageRoomSessionOptions {
  roomCode: string;
  role: "host" | "control" | "audience" | "confidence";
  deviceId: string;
  deviceName?: string;
}

export function useStageRoomSession({ roomCode, role, deviceId, deviceName }: UseStageRoomSessionOptions) {
  const [state, setState] = useState<StageSessionState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const normalizedRoomCode = (roomCode || "").trim().toUpperCase();

  const roomErrorRef = useRef<string | null>(null);

  useEffect(() => {
    roomErrorRef.current = roomError;
  }, [roomError]);

  // Reset and reconnect whenever roomCode, deviceId, or role changes (P0-2)
  useEffect(() => {
    let isMounted = true;

    // 1. Immediately clear old room state and close previous socket (P0-2)
    if (socketRef.current) {
      socketRef.current.onclose = null;
      socketRef.current.onmessage = null;
      socketRef.current.close();
      socketRef.current = null;
    }

    setState(null);
    setIsConnected(false);
    setRoomError(null);

    if (!normalizedRoomCode || normalizedRoomCode.length < 4) {
      setRoomError("INVALID_ROOM_CODE");
      return;
    }

    // 2. Fetch authoritative state via API
    const fetchState = async () => {
      try {
        const url = `/api/ws?roomCode=${encodeURIComponent(normalizedRoomCode)}&deviceId=${encodeURIComponent(
          deviceId
        )}&role=${role}&deviceName=${encodeURIComponent(deviceName || "Device")}`;
        const res = await fetch(url);

        if (!isMounted) return;

        if (res.status === 404) {
          setRoomError("ROOM_NOT_FOUND");
          return;
        }
        if (res.status === 403) {
          setRoomError("ROOM_ACCESS_DENIED");
          return;
        }
        if (!res.ok) {
          setRoomError("INVALID_ROOM_CODE");
          return;
        }

        const data = (await res.json()) as { type?: string; state?: StageSessionState };
        if (data.type === "SYNC_STATE" && data.state) {
          setState(data.state);
          setIsConnected(true);
          setRoomError(null);
        }
      } catch {
        if (isMounted) {
          setIsConnected(false);
        }
      }
    };

    fetchState();

    // 3. Connect WebSocket for realtime sync
    const wsProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}/api/ws?roomCode=${encodeURIComponent(
      normalizedRoomCode
    )}&deviceId=${encodeURIComponent(deviceId)}&role=${role}&deviceName=${encodeURIComponent(deviceName || "Device")}`;

    let reconnectTimer: NodeJS.Timeout | null = null;
    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(socketUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (isMounted) {
          setIsConnected(true);
          try {
            socket?.send(JSON.stringify({ type: "PING" }));
          } catch {}
        }
      };

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          if (msg.type === "SYNC_STATE" && msg.state) {
            setState(msg.state);
            setIsConnected(true);
            setRoomError(null);
          }
        } catch {
          // Ignore
        }
      };

      socket.onclose = () => {
        if (isMounted) {
          setIsConnected(false);
          // Auto-fetch & reconnect only if connection dropped
          reconnectTimer = setTimeout(() => {
            if (isMounted && !roomErrorRef.current) {
              fetchState();
            }
          }, 5000);
        }
      };
    } catch {
      // Fallback
    }

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
      socketRef.current = null;
    };
  }, [normalizedRoomCode, deviceId, role, deviceName]);

  const dispatchCommand = useCallback(
    async (type: StageCommand["type"], payload: Record<string, unknown> = {}) => {
      const commandPayload: StageCommand = {
        commandId: `cmd-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        payload,
        senderDeviceId: deviceId,
        roomCode: normalizedRoomCode,
        timestamp: Date.now(),
      } as StageCommand;

      // Optimistic local state update for 0ms UI responsiveness
      setState((prevState) => {
        if (!prevState) return prevState;
        try {
          return stageSessionReducer(prevState, commandPayload);
        } catch {
          return prevState;
        }
      });

      // Try WebSocket send first
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(
            JSON.stringify({
              type: "EXECUTE_COMMAND",
              payload: commandPayload,
            })
          );
          return;
        } catch {
          // Fall back to HTTP POST
        }
      }

      // HTTP POST fallback
      try {
        const res = await fetch("/api/ws", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: normalizedRoomCode,
            deviceId,
            command: commandPayload,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { type?: string; state?: StageSessionState };
          if (data.type === "SYNC_STATE" && data.state) {
            setState(data.state);
          }
        }
      } catch {
        // Command dispatch error
      }
    },
    [normalizedRoomCode, deviceId]
  );

  const myDevice = state?.devices ? state.devices[deviceId] : null;
  const isHostRole = role === "host";

  let approvalStatus: DeviceApprovalStatus = "pending";
  if (isHostRole) {
    approvalStatus = "approved";
  } else if (myDevice) {
    approvalStatus = myDevice.approvalStatus;
  }

  const roomName = state?.session?.title || undefined;

  return {
    state,
    isConnected,
    roomError,
    myDevice,
    approvalStatus,
    roomName,
    dispatchCommand,
  };
}
