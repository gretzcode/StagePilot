"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { WebRtcSignalPayload } from "@/core/realtime/protocol";
import { DEFAULT_RTC_CONFIG } from "../webrtc/config";

interface UseScreenShareSubscriberOptions {
  /** The Speaker device ID whose screen share is currently LIVE (null if not live) */
  sourceId: string | null;
  /** Current display's device ID */
  deviceId: string;
  /** Callback to send WebRTC signaling messages */
  sendSignal: (payload: WebRtcSignalPayload) => void;
}

export type WebRtcConnectionStatus = "idle" | "connecting" | "connected" | "failed" | "closed";

export interface UseScreenShareSubscriberResult {
  /** The remote MediaStream received via WebRTC */
  stream: MediaStream | null;
  /** Current WebRTC connection lifecycle status */
  status: WebRtcConnectionStatus;
  /** Error message if negotiation or connection failed */
  error: string | null;
}

/**
 * WebRTC Subscriber Hook for Displays (Audience & Confidence)
 *
 * Automatically manages:
 * - Requesting stream from the Speaker when source becomes LIVE
 * - Establishing RTCPeerConnection with the publisher
 * - Handling SDP Offer and creating SDP Answer
 * - ICE candidate exchange
 * - Receiving remote MediaStream tracks
 * - Clean teardown when source goes offline or changes
 */
export function useScreenShareSubscriber({
  sourceId,
  deviceId,
  sendSignal,
}: UseScreenShareSubscriberOptions): UseScreenShareSubscriberResult {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<WebRtcConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const sourceIdRef = useRef<string | null>(sourceId);
  sourceIdRef.current = sourceId;

  const cleanupPeerConnection = useCallback(() => {
    if (pcRef.current) {
      try {
        pcRef.current.ontrack = null;
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.close();
      } catch {}
      pcRef.current = null;
    }
    setStream(null);
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => {
    // If no screen share is currently live, reset
    if (!sourceId) {
      cleanupPeerConnection();
      return;
    }

    if (typeof RTCPeerConnection === "undefined") {
      setStatus("failed");
      setError("Browser does not support WebRTC");
      return;
    }

    cleanupPeerConnection();
    setStatus("connecting");
    setError(null);

    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    pcRef.current = pc;

    // Handle incoming video track from the Speaker
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        setStream(event.streams[0]);
        setStatus("connected");
      }
    };

    // Send local ICE candidates back to Speaker
    pc.onicecandidate = (event) => {
      if (event.candidate && sourceIdRef.current) {
        sendSignal({
          targetDeviceId: sourceIdRef.current,
          senderDeviceId: deviceId,
          sourceId: sourceIdRef.current,
          signal: {
            type: "candidate",
            candidate: event.candidate.toJSON(),
          },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      const state = pc.connectionState;
      if (state === "connected") {
        setStatus("connected");
      } else if (state === "failed") {
        setStatus("failed");
        setError("Koneksi WebRTC gagal terhubung ke pembicara.");
      } else if (state === "closed" || state === "disconnected") {
        setStatus("closed");
      }
    };

    // Request the stream from the Speaker
    sendSignal({
      targetDeviceId: sourceId,
      senderDeviceId: deviceId,
      sourceId,
      signal: {
        type: "request_stream",
      },
    });

    // Listen for WebRTC signals from the Speaker
    const handleSignalEvent = async (e: Event) => {
      const customEvent = e as CustomEvent<WebRtcSignalPayload>;
      const payload = customEvent.detail;

      if (!payload || payload.targetDeviceId !== deviceId) return;
      if (payload.senderDeviceId !== sourceIdRef.current) return;

      const { signal } = payload;
      const currentPc = pcRef.current;
      if (!currentPc) return;

      if (signal.type === "offer" && signal.sdp) {
        try {
          await currentPc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          const answer = await currentPc.createAnswer();
          await currentPc.setLocalDescription(answer);

          sendSignal({
            targetDeviceId: payload.senderDeviceId,
            senderDeviceId: deviceId,
            sourceId: payload.senderDeviceId,
            signal: {
              type: "answer",
              sdp: {
                type: answer.type,
                sdp: answer.sdp,
              },
            },
          });
        } catch (err) {
          console.error("[WebRTC Subscriber] Failed to handle offer:", err);
          setStatus("failed");
          setError("Gagal menegosiasi koneksi video.");
        }
      } else if (signal.type === "candidate" && signal.candidate) {
        try {
          await currentPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          console.error("[WebRTC Subscriber] Failed to add ICE candidate:", err);
        }
      }
    };

    window.addEventListener("stagepilot_webrtc_signal", handleSignalEvent);

    return () => {
      window.removeEventListener("stagepilot_webrtc_signal", handleSignalEvent);
      cleanupPeerConnection();
    };
  }, [sourceId, deviceId, sendSignal, cleanupPeerConnection]);

  return { stream, status, error };
}
