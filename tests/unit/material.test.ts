import { describe, it, expect } from "vitest";
import { defaultPresentationAdapter } from "@/features/material/adapter";

describe("Material Engine Abstraction", () => {
  it("should parse PDF material and return structured material contract", async () => {
    const material = await defaultPresentationAdapter.loadMaterial(
      "http://example.com/deck.pdf",
      "Keynote Deck",
      "pdf"
    );

    expect(material.type).toBe("pdf");
    expect(material.name).toBe("Keynote Deck");
    expect(material.totalPages).toBeGreaterThan(0);
    expect(material.slides.length).toBe(material.totalPages);
  });

  it("should parse PPTX material contract", async () => {
    const material = await defaultPresentationAdapter.loadMaterial(
      "http://example.com/deck.pptx",
      "PowerPoint Presentation",
      "pptx"
    );

    expect(material.type).toBe("pptx");
    expect(material.name).toBe("PowerPoint Presentation");
  });
});
