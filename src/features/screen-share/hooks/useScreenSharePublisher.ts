"use client";

import { useEffect, useRef, useCallback } from "react";
import { WebRtcSignalPayload } from "@/core/realtime/protocol";
import { DEFAULT_RTC_CONFIG } from "../webrtc/config";

interface UseScreenSharePublisherOptions {
  /** Local MediaStream to publish (null when not sharing) */
  stream: MediaStream | null;
  /** Current Speaker's device ID */
  deviceId: string;
  /** Callback to send WebRTC signaling messages */
  sendSignal: (payload: WebRtcSignalPayload) => void;
}

/**
 * WebRTC Publisher Hook for Speaker Screen Sharing
 *
 * Automatically handles:
 * - Listening for subscriber requests (`request_stream`)
 * - Creating RTCPeerConnection for each subscriber
 * - Adding video track from local MediaStream
 * - Creating and dispatching SDP offers
 * - Handling incoming SDP answers and ICE candidates
 * - Automatic cleanup of peer connections when stream stops or unmounts
 */
export function useScreenSharePublisher({
  stream,
  deviceId,
  sendSignal,
}: UseScreenSharePublisherOptions) {
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const streamRef = useRef<MediaStream | null>(stream);
  streamRef.current = stream;

  // Cleanup all peer connections
  const closeAllConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      try {
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.close();
      } catch {}
    });
    peerConnectionsRef.current.clear();
  }, []);

  // Handle a new subscriber requesting the stream
  const handleSubscriberRequest = useCallback(
    async (subscriberDeviceId: string) => {
      if (!streamRef.current) return;
      if (typeof RTCPeerConnection === "undefined") return;

      // Close existing connection to this subscriber if any
      const existingPc = peerConnectionsRef.current.get(subscriberDeviceId);
      if (existingPc) {
        try {
          existingPc.close();
        } catch {}
        peerConnectionsRef.current.delete(subscriberDeviceId);
      }

      try {
        const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
        peerConnectionsRef.current.set(subscriberDeviceId, pc);

        // Add screen share tracks to peer connection
        streamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, streamRef.current!);
        });

        // Send local ICE candidates to subscriber
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            sendSignal({
              targetDeviceId: subscriberDeviceId,
              senderDeviceId: deviceId,
              sourceId: deviceId,
              signal: {
                type: "candidate",
                candidate: event.candidate.toJSON(),
              },
            });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "failed" || pc.connectionState === "closed") {
            peerConnectionsRef.current.delete(subscriberDeviceId);
          }
        };

        // Create and send SDP Offer
        const offer = await pc.createOffer({
          offerToReceiveVideo: false,
          offerToReceiveAudio: false,
        });
        await pc.setLocalDescription(offer);

        sendSignal({
          targetDeviceId: subscriberDeviceId,
          senderDeviceId: deviceId,
          sourceId: deviceId,
          signal: {
            type: "offer",
            sdp: {
              type: offer.type,
              sdp: offer.sdp,
            },
          },
        });
      } catch (err) {
        console.error("[WebRTC Publisher] Failed to create offer:", err);
      }
    },
    [deviceId, sendSignal]
  );

  // Handle incoming WebRTC signals
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleSignalEvent = async (e: Event) => {
      const customEvent = e as CustomEvent<WebRtcSignalPayload>;
      const payload = customEvent.detail;

      if (!payload || payload.targetDeviceId !== deviceId) return;

      const subscriberId = payload.senderDeviceId;
      const { signal } = payload;

      if (signal.type === "request_stream") {
        await handleSubscriberRequest(subscriberId);
      } else if (signal.type === "answer" && signal.sdp) {
        const pc = peerConnectionsRef.current.get(subscriberId);
        if (pc && pc.signalingState === "have-local-offer") {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          } catch (err) {
            console.error("[WebRTC Publisher] Failed to set remote answer:", err);
          }
        }
      } else if (signal.type === "candidate" && signal.candidate) {
        const pc = peerConnectionsRef.current.get(subscriberId);
        if (pc) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } catch (err) {
            console.error("[WebRTC Publisher] Failed to add ICE candidate:", err);
          }
        }
      }
    };

    window.addEventListener("stagepilot_webrtc_signal", handleSignalEvent);
    return () => {
      window.removeEventListener("stagepilot_webrtc_signal", handleSignalEvent);
    };
  }, [deviceId, handleSubscriberRequest]);

  // Clean up when stream stops
  useEffect(() => {
    if (!stream) {
      closeAllConnections();
    }
  }, [stream, closeAllConnections]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      closeAllConnections();
    };
  }, [closeAllConnections]);
}
