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
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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
    pendingCandidatesRef.current = [];
    setStream(null);
    setStatus("idle");
    setError(null);
  }, []);

  useEffect(() => {
    // If no screen share is currently live, or if the source is the current local device, reset
    if (!sourceId || sourceId === deviceId) {
      cleanupPeerConnection();
      return;
    }

    if (typeof RTCPeerConnection === "undefined") {
      setStatus("failed");
      setError("Perangkat ini belum mendukung transmisi video langsung.");
      return;
    }

    cleanupPeerConnection();
    setStatus("connecting");
    setError(null);

    const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
    pcRef.current = pc;
    pendingCandidatesRef.current = [];

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
        setError("Transmisi layar terputus. Mencoba menghubungkan kembali...");
      } else if (state === "closed" || state === "disconnected") {
        setStatus("closed");
      }
    };

    // Request the stream from the Speaker
    const requestStream = () => {
      if (!sourceIdRef.current) return;
      sendSignal({
        targetDeviceId: sourceIdRef.current,
        senderDeviceId: deviceId,
        sourceId: sourceIdRef.current,
        signal: {
          type: "request_stream",
        },
      });
    };

    requestStream();

    // Request retry timer if initial handshake takes longer than 2.5s
    const retryTimer = setTimeout(() => {
      if (pcRef.current && pcRef.current.connectionState !== "connected" && pcRef.current.signalingState === "stable") {
        requestStream();
      }
    }, 2500);

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
        // Prevent duplicate offer processing if already negotiating
        if (currentPc.signalingState !== "stable" && currentPc.signalingState !== "have-local-offer") {
          return;
        }

        try {
          await currentPc.setRemoteDescription(new RTCSessionDescription(signal.sdp));

          // Drain any queued ICE candidates that arrived before remote description was set
          while (pendingCandidatesRef.current.length > 0) {
            const cand = pendingCandidatesRef.current.shift();
            if (cand) {
              await currentPc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }

          const answer = await currentPc.createAnswer();
          await currentPc.setLocalDescription(answer);

          sendSignal({
            targetDeviceId: payload.senderDeviceId || sourceIdRef.current || "",
            senderDeviceId: deviceId,
            sourceId: payload.senderDeviceId || sourceIdRef.current || "",
            signal: {
              type: "answer",
              sdp: {
                type: answer.type,
                sdp: answer.sdp,
              },
            },
          });
        } catch (err) {
          console.warn("[ScreenShare Subscriber] Offer negotiation notice:", err);
        }
      } else if (signal.type === "candidate" && signal.candidate) {
        try {
          if (currentPc.remoteDescription && currentPc.remoteDescription.type) {
            await currentPc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            pendingCandidatesRef.current.push(signal.candidate);
          }
        } catch (err) {
          console.warn("[ScreenShare Subscriber] Candidate handling notice:", err);
        }
      }
    };

    window.addEventListener("stagepilot_webrtc_signal", handleSignalEvent);

    return () => {
      clearTimeout(retryTimer);
      window.removeEventListener("stagepilot_webrtc_signal", handleSignalEvent);
      cleanupPeerConnection();
    };
  }, [sourceId, deviceId, sendSignal, cleanupPeerConnection]);

  return { stream, status, error };
}
