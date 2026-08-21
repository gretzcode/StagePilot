import { describe, it, expect } from "vitest";
import { createDisplayGrant, verifyDisplayGrant } from "@/lib/auth/display-grant";

describe("Zero-Trust Display Access Grant & Auto-Approval", () => {
  const roomCode = "ROOM_DISP_01";

  describe("1. Grant Generation and Verification", () => {
    it("should generate and verify valid display grants for Audience mode", async () => {
      const grant = await createDisplayGrant(roomCode, "audience");
      expect(grant).toBeDefined();
      expect(grant.includes(".")).toBe(true);

      const isValid = await verifyDisplayGrant(roomCode, "audience", grant);
      expect(isValid).toBe(true);
    });

    it("should generate and verify valid display grants for Confidence mode", async () => {
      const grant = await createDisplayGrant(roomCode, "confidence");
      expect(grant).toBeDefined();

      const isValid = await verifyDisplayGrant(roomCode, "confidence", grant);
      expect(isValid).toBe(true);
    });

    it("should allow an 'all' mode grant to access both audience and confidence", async () => {
      const grant = await createDisplayGrant(roomCode, "all");

      expect(await verifyDisplayGrant(roomCode, "audience", grant)).toBe(true);
      expect(await verifyDisplayGrant(roomCode, "confidence", grant)).toBe(true);
    });
  });

  describe("2. Security Restrictions & Tamper Proofing", () => {
    it("should reject access when grant is missing or empty (URL cannot be opened freely)", async () => {
      expect(await verifyDisplayGrant(roomCode, "audience", null)).toBe(false);
      expect(await verifyDisplayGrant(roomCode, "audience", undefined)).toBe(false);
      expect(await verifyDisplayGrant(roomCode, "audience", "")).toBe(false);
    });

    it("should reject access for mismatched room codes", async () => {
      const grant = await createDisplayGrant(roomCode, "audience");
      const isValid = await verifyDisplayGrant("OTHER_ROOM", "audience", grant);
      expect(isValid).toBe(false);
    });

    it("should reject access for mismatched display mode (e.g. audience token used for confidence)", async () => {
      const audienceGrant = await createDisplayGrant(roomCode, "audience");
      const isValid = await verifyDisplayGrant(roomCode, "confidence", audienceGrant);
      expect(isValid).toBe(false);
    });

    it("should reject tampered tokens", async () => {
      const grant = await createDisplayGrant(roomCode, "audience");
      const [payload, sig] = grant.split(".");
      const tamperedGrant = `${payload}.${sig.slice(0, -4)}ffff`;

      const isValid = await verifyDisplayGrant(roomCode, "audience", tamperedGrant);
      expect(isValid).toBe(false);
    });

    it("should reject expired tokens", async () => {
      // Create token that expired 1 second ago
      const expiredGrant = await createDisplayGrant(roomCode, "audience", null, -1000);
      const isValid = await verifyDisplayGrant(roomCode, "audience", expiredGrant);
      expect(isValid).toBe(false);
    });
  });
});
