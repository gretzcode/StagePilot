import { describe, expect, it } from "vitest";
import { extractCanvaDesignId } from "@/features/integrations/canva/canva.client";

describe("Canva Service & Client Unit Tests", () => {
  it("TEST-CANVA-URL-01: Correctly extracts designId from various Canva link formats", () => {
    expect(extractCanvaDesignId("https://www.canva.com/design/DAG12345/view")).toBe("DAG12345");
    expect(extractCanvaDesignId("https://www.canva.com/design/DAGabcdef123/edit")).toBe("DAGabcdef123");
    expect(extractCanvaDesignId("https://canva.com/design/DAF999_xyz/view?embed")).toBe("DAF999_xyz");
    expect(extractCanvaDesignId("DAG12345")).toBe("DAG12345");
    expect(extractCanvaDesignId("https://invalid-domain.com/test")).toBeNull();
    expect(extractCanvaDesignId("")).toBeNull();
  });
});
