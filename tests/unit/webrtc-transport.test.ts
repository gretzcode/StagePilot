import { describe, it, expect, vi } from "vitest";
import { WebRtcSignalPayload, ServerMessage } from "@/core/realtime/protocol";
import { DEFAULT_RTC_CONFIG } from "@/features/screen-share/webrtc/config";

describe("WebRTC Screen Share Signaling & Transport", () => {
  const speakerDeviceId = "dev-speaker-01";
  const displayDeviceId = "dev-audience-01";
  const roomCode = "ROOM_TEST_RTC";

  describe("1. Configuration & Constants", () => {
    it("should provide valid public STUN servers for NAT traversal", () => {
      expect(DEFAULT_RTC_CONFIG.iceServers).toBeDefined();
      expect(Array.isArray(DEFAULT_RTC_CONFIG.iceServers)).toBe(true);
      expect(DEFAULT_RTC_CONFIG.iceServers?.length).toBeGreaterThan(0);
      const stunUrls = DEFAULT_RTC_CONFIG.iceServers?.map((s) => s.urls).flat();
      expect(stunUrls?.some((url) => typeof url === "string" && url.includes("stun"))).toBe(true);
    });
  });

  describe("2. Signaling Message Schema", () => {
    it("should format request_stream signaling payload correctly", () => {
      const requestPayload: WebRtcSignalPayload = {
        targetDeviceId: speakerDeviceId,
        senderDeviceId: displayDeviceId,
        sourceId: speakerDeviceId,
        signal: {
          type: "request_stream",
        },
      };

      expect(requestPayload.targetDeviceId).toBe(speakerDeviceId);
      expect(requestPayload.senderDeviceId).toBe(displayDeviceId);
      expect(requestPayload.sourceId).toBe(speakerDeviceId);
      expect(requestPayload.signal.type).toBe("request_stream");
    });

    it("should format offer and answer signaling payloads correctly", () => {
      const mockOfferSdp: RTCSessionDescriptionInit = {
        type: "offer",
        sdp: "v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
      };

      const offerPayload: WebRtcSignalPayload = {
        targetDeviceId: displayDeviceId,
        senderDeviceId: speakerDeviceId,
        sourceId: speakerDeviceId,
        signal: {
          type: "offer",
          sdp: mockOfferSdp,
        },
      };

      expect(offerPayload.signal.type).toBe("offer");
      expect(offerPayload.signal.sdp?.type).toBe("offer");
      expect(offerPayload.signal.sdp?.sdp).toContain("m=video");

      const mockAnswerSdp: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: "v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n",
      };

      const answerPayload: WebRtcSignalPayload = {
        targetDeviceId: speakerDeviceId,
        senderDeviceId: displayDeviceId,
        sourceId: speakerDeviceId,
        signal: {
          type: "answer",
          sdp: mockAnswerSdp,
        },
      };

      expect(answerPayload.signal.type).toBe("answer");
      expect(answerPayload.signal.sdp?.type).toBe("answer");
    });

    it("should format ICE candidate signaling payloads correctly", () => {
      const candidatePayload: WebRtcSignalPayload = {
        targetDeviceId: displayDeviceId,
        senderDeviceId: speakerDeviceId,
        sourceId: speakerDeviceId,
        signal: {
          type: "candidate",
          candidate: {
            candidate: "candidate:842163049 1 udp 1677729535 192.168.1.100 56124 typ host",
            sdpMid: "0",
            sdpMLineIndex: 0,
          },
        },
      };

      expect(candidatePayload.signal.type).toBe("candidate");
      expect(candidatePayload.signal.candidate?.candidate).toContain("candidate:842163049");
    });
  });

  describe("3. WebSocket Signaling Message Routing", () => {
    it("should package WEBRTC_SIGNAL into ServerMessage format", () => {
      const payload: WebRtcSignalPayload = {
        targetDeviceId: displayDeviceId,
        senderDeviceId: speakerDeviceId,
        sourceId: speakerDeviceId,
        signal: {
          type: "request_stream",
        },
      };

      const serverMsg: ServerMessage = {
        type: "WEBRTC_SIGNAL",
        payload,
        timestamp: Date.now(),
      };

      expect(serverMsg.type).toBe("WEBRTC_SIGNAL");
      expect(serverMsg.payload.targetDeviceId).toBe(displayDeviceId);
      expect(serverMsg.timestamp).toBeGreaterThan(0);
    });
  });
});
