import { describe, it, expect } from "vitest";
import { GET as healthHandler } from "@/app/api/health/route";
import { buildScopedObjectKey, generateUploadAuthorization } from "@/lib/storage/r2";

describe("Phase 3 Production Integration & Health Check Tests", () => {
  it("Health check route returns 200 OK and OPERATIONAL system metrics", async () => {
    const response = await healthHandler();
    expect(response.status).toBe(200);

    const json = (await response.json()) as {
      status: string;
      service: string;
      checks: { durableObjects: string; websocketHibernation: string };
    };
    expect(json.status).toBe("HEALTHY");
    expect(json.service).toBe("StagePilot Engine");
    expect(json.checks.durableObjects).toBe("OPERATIONAL");
    expect(json.checks.websocketHibernation).toBe("READY");
  });

  it("R2 Material Storage generates scoped object keys and direct upload authorization", async () => {
    const roomId = "room-a7k9p2";
    const materialId = "mat-keynote-1";
    const filename = "Final Keynote Deck.pdf";

    const objectKey = buildScopedObjectKey(roomId, materialId, filename);
    expect(objectKey).toBe("rooms/room-a7k9p2/materials/mat-keynote-1/Final_Keynote_Deck.pdf");

    const auth = await generateUploadAuthorization(roomId, materialId, filename);
    expect(auth.objectKey).toBe(objectKey);
    expect(auth.uploadUrl).toContain("/api/material/upload");
    expect(auth.expiresAt).toBeGreaterThan(Date.now());
  });
});
