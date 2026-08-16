import { describe, expect, it, vi, beforeEach } from "vitest";
import { CanvaClient, extractCanvaDesignId, extractCanvaDesignIdAsync } from "@/features/integrations/canva/canva.client";
import { CanvaService } from "@/features/integrations/canva/canva.service";
import { clearMemoryIntegrationCredentials, IntegrationCredentialStore } from "@/lib/integrations/credential-store";

describe("Canva Export Pipeline & Service Unit Tests", () => {
  beforeEach(() => {
    clearMemoryIntegrationCredentials();
    vi.restoreAllMocks();
  });

  it("TEST-CANVA-URL-01: Correctly extracts designId from various Canva link formats", () => {
    expect(extractCanvaDesignId("https://www.canva.com/design/DAG12345/view")).toBe("DAG12345");
    expect(extractCanvaDesignId("https://www.canva.com/design/DAGabcdef123/edit")).toBe("DAGabcdef123");
    expect(extractCanvaDesignId("https://canva.com/design/DAF999_xyz/view?embed")).toBe("DAF999_xyz");
    expect(extractCanvaDesignId("DAG12345")).toBe("DAG12345");
    expect(extractCanvaDesignId("https://invalid-domain.com/test")).toBeNull();
    expect(extractCanvaDesignId("")).toBeNull();
  });

  it("TEST-CANVA-SHORTLINK-01: Correctly resolves canva.link shortlink to design URL", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementationOnce(async (input) => {
      if (String(input).includes("canva.link/i6uu2doyu5v4ase")) {
        return {
          url: "https://www.canva.com/design/DAGzT4MKsHQ/view",
          ok: true,
        } as unknown as Response;
      }
      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    const resolved = await extractCanvaDesignIdAsync("https://canva.link/i6uu2doyu5v4ase");
    expect(resolved).toBe("DAGzT4MKsHQ");
  });

  it("TEST-CANVA-EXPORT-01: Successfully creates export job, polls result, and normalizes into 15-page presentation", async () => {
    const client = new CanvaClient("mock_token_abc");

    // Mock fetch for design metadata, export job creation, and polling
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/designs/DAG12345")) {
        return new Response(
          JSON.stringify({
            design: {
              id: "DAG12345",
              title: "Annual Keynote Deck",
              page_count: 15,
            },
          }),
          { status: 200 }
        );
      }

      if (url.endsWith("/exports") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            job: {
              id: "job_export_999",
              status: "in_progress",
            },
          }),
          { status: 200 }
        );
      }

      if (url.includes("/exports/job_export_999")) {
        return new Response(
          JSON.stringify({
            job: {
              id: "job_export_999",
              status: "success",
              urls: Array.from({ length: 15 }, (_, i) => `https://document-export.canva.com/DAG12345/slide_${i + 1}.jpg`),
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    const exported = await client.exportPresentation("DAG12345");

    expect(exported.designId).toBe("DAG12345");
    expect(exported.title).toBe("Annual Keynote Deck");
    expect(exported.totalPages).toBe(15);
    expect(exported.slides.length).toBe(15);
    expect(exported.slides[0].index).toBe(1);
    expect(exported.slides[0].contentUrl).toBe("https://document-export.canva.com/DAG12345/slide_1.jpg");
    expect(exported.slides[14].index).toBe(15);
    expect(exported.slides[14].contentUrl).toBe("https://document-export.canva.com/DAG12345/slide_15.jpg");

    expect(fetchSpy).toHaveBeenCalled();
  });

  it("TEST-CANVA-EXPORT-02: Throws explicit error when export job fails or returns empty urls without silent 1-slide fallback", async () => {
    const client = new CanvaClient("mock_token_abc");

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/designs/DAG_FAIL")) {
        return new Response(JSON.stringify({ design: { id: "DAG_FAIL", title: "Corrupted Deck" } }), { status: 200 });
      }

      if (url.endsWith("/exports") && init?.method === "POST") {
        return new Response(JSON.stringify({ job: { id: "job_fail_1", status: "in_progress" } }), { status: 200 });
      }

      if (url.includes("/exports/job_fail_1")) {
        return new Response(
          JSON.stringify({
            job: {
              id: "job_fail_1",
              status: "failed",
              error: { code: "UNSUPPORTED_MEDIA", message: "Design contains unsupported media elements" },
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    await expect(client.exportPresentation("DAG_FAIL")).rejects.toThrow("CANVA_EXPORT_FAILED");
  });

  it("TEST-CANVA-IMPORT-01: CanvaService.importDesignAsMaterial stores complete snapshot with true totalPages and slides", async () => {
    const store = new IntegrationCredentialStore();
    const userId = "user-test-host";

    await store.saveCredential({
      userId,
      provider: "canva",
      accessToken: "token_valid_123",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3600000,
      scopes: ["design:meta:read", "design:content:read"],
      accountEmail: "host@example.com",
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);

      if (url.endsWith("/designs/DAG_IMPORT")) {
        return new Response(JSON.stringify({ design: { id: "DAG_IMPORT", title: "Product Launch Deck" } }), { status: 200 });
      }

      if (url.endsWith("/exports") && init?.method === "POST") {
        return new Response(JSON.stringify({ job: { id: "job_imp_1", status: "in_progress" } }), { status: 200 });
      }

      if (url.includes("/exports/job_imp_1")) {
        return new Response(
          JSON.stringify({
            job: {
              id: "job_imp_1",
              status: "success",
              urls: [
                "https://document-export.canva.com/slide_1.jpg",
                "https://document-export.canva.com/slide_2.jpg",
                "https://document-export.canva.com/slide_3.jpg",
                "https://document-export.canva.com/slide_4.jpg",
                "https://document-export.canva.com/slide_5.jpg",
              ],
            },
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: "NOT_FOUND" }), { status: 404 });
    });

    const material = await CanvaService.importDesignAsMaterial(userId, "https://www.canva.com/design/DAG_IMPORT/view", null, "ROOM123");

    expect(material.type).toBe("canva");
    expect(material.sourceType).toBe("CANVA_LINK");
    expect(material.totalPages).toBe(5);
    expect(material.slides.length).toBe(5);
    expect(material.slides[0].contentUrl).toBe("https://document-export.canva.com/slide_1.jpg");
    expect(material.slides[4].contentUrl).toBe("https://document-export.canva.com/slide_5.jpg");
    expect(material.metadata?.pageCount).toBe(5);
  });
});
