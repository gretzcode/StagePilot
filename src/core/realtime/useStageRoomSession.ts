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
  const stateRef = useRef<StageSessionState | null>(state);

  useEffect(() => {
    roomErrorRef.current = roomError;
  }, [roomError]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

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
        const fetchedState = data.state;
        if (data.type === "SYNC_STATE" && fetchedState) {
          // Prevent old state from overwriting newer local state via version check
          setState((currentState) => {
            if (currentState && fetchedState.version <= currentState.version) {
              // Incoming state is same or older → skip update to preserve optimistic updates
              return currentState;
            }
            // Incoming state is newer → update
            return fetchedState;
          });
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

    // 2. Setup Adaptive Heartbeat Polling Fallback (active ONLY when WebSocket is disconnected)
    let heartbeatTimer: NodeJS.Timeout | null = null;

    const scheduleHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      const isPresenting = Boolean(stateRef.current?.presentation?.isPresenting);
      const intervalMs = isPresenting ? 2000 : 8000;
      heartbeatTimer = setInterval(() => {
        // Skip HTTP polling if active WebSocket connection is open and receiving updates
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          return;
        }

        if (isMounted && !roomErrorRef.current) {
          fetchState();
          const currentIsPresenting = Boolean(stateRef.current?.presentation?.isPresenting);
          if (currentIsPresenting !== isPresenting) {
            scheduleHeartbeat();
          }
        }
      }, intervalMs);
    };

    scheduleHeartbeat();

    // 3. Setup HTML5 BroadcastChannel for 0ms Instant Cross-Tab Sync on same machine
    const broadcastChannel =
      typeof window !== "undefined" && "BroadcastChannel" in window
        ? new BroadcastChannel(`stagepilot_sync_${normalizedRoomCode}`)
        : null;

    if (broadcastChannel) {
      broadcastChannel.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const broadcastedState = event.data?.state as StageSessionState | undefined;
          if (event.data?.type === "SYNC_STATE" && broadcastedState) {
            // Prevent old state from overwriting newer local state via version check
            setState((currentState) => {
              if (currentState && broadcastedState.version <= currentState.version) {
                // Incoming state is same or older → skip update to preserve optimistic updates
                return currentState;
              }
              // Incoming state is newer → update
              return broadcastedState;
            });
            setIsConnected(true);
            setRoomError(null);
          }
        } catch {
          // Ignore
        }
      };
    }

    // 4. Connect WebSocket for realtime sync
    const wsProtocol = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const socketUrl = `${wsProtocol}//${window.location.host}/api/ws?roomCode=${encodeURIComponent(
      normalizedRoomCode
    )}&deviceId=${encodeURIComponent(deviceId)}&role=${role}&deviceName=${encodeURIComponent(deviceName || "Device")}`;

    let reconnectTimer: NodeJS.Timeout | null = null;
    let pingInterval: NodeJS.Timeout | null = null;
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

      // 10s Lightweight Keep-Alive PING (0 Cloudflare HTTP Request Quota)
      pingInterval = setInterval(() => {
        if (isMounted && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          try {
            socketRef.current.send(JSON.stringify({ type: "PING" }));
          } catch {}
        }
      }, 10000);

      socket.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const msg: ServerMessage = JSON.parse(event.data);
          if (msg.type === "SYNC_STATE") {
            const socketState = msg.state;
            if (socketState) {
              // Prevent old state from overwriting newer local state via version check
              setState((currentState) => {
                if (currentState && socketState.version <= currentState.version) {
                  // Incoming state is same or older → skip update to preserve optimistic updates
                  return currentState;
                }
                // Incoming state is newer → update
                return socketState;
              });
              setIsConnected(true);
              setRoomError(null);

              // Relay state to local BroadcastChannel for 0ms cross-window sync
              try {
                broadcastChannel?.postMessage({ type: "SYNC_STATE", state: socketState });
              } catch {}
            }
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

    // Auto-sync when tab becomes visible again after being unfocused/backgrounded
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isMounted && socketRef.current?.readyState === WebSocket.OPEN) {
        try {
          socketRef.current.send(JSON.stringify({ type: "PING" }));
        } catch {}
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      isMounted = false;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (pingInterval) clearInterval(pingInterval);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (broadcastChannel) {
        broadcastChannel.onmessage = null;
        broadcastChannel.close();
      }
      if (socket) {
        socket.onclose = null;
        socket.onmessage = null;
        socket.close();
      }
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
