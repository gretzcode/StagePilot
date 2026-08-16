import { describe, expect, it } from "vitest";
import { isCanvaMaterialStale } from "@/features/material/validator";
import { Material } from "@/core/types";

describe("Canva Material Lifecycle & Stale Detection", () => {
  it("TEST-LIFECYCLE-01: Detects legacy Canva material with totalPages=1 and embed URL as stale", () => {
    const legacyMaterial: Partial<Material> = {
      id: "mat-legacy-1",
      name: "Old Presentation",
      type: "canva",
      totalPages: 1,
      slides: [
        {
          index: 1,
          title: "Slide 1",
          url: "https://www.canva.com/design/DAG123/view?embed",
          contentUrl: "https://www.canva.com/design/DAG123/view?embed",
        },
      ],
    };

    expect(isCanvaMaterialStale(legacyMaterial as Material)).toBe(true);
  });

  it("TEST-LIFECYCLE-02: Detects exported multi-slide Canva material as fresh/ready", () => {
    const exportedMaterial: Partial<Material> = {
      id: "mat-fresh-1",
      name: "Fresh Keynote",
      type: "canva",
      totalPages: 17,
      slides: Array.from({ length: 17 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        url: `https://document-export.canva.com/DAG123/slide_${i + 1}.jpg`,
        contentUrl: `https://document-export.canva.com/DAG123/slide_${i + 1}.jpg`,
      })),
    };

    expect(isCanvaMaterialStale(exportedMaterial as Material)).toBe(false);
  });

  it("TEST-LIFECYCLE-03: Does not classify non-Canva materials (PDF, Image, Google Slides) as Canva stale", () => {
    const pdfMaterial: Partial<Material> = {
      id: "mat-pdf-1",
      type: "pdf",
      totalPages: 1,
      slides: [{ index: 1, title: "Page 1", contentUrl: "/api/material/asset?id=1" }],
    };

    const gslidesMaterial: Partial<Material> = {
      id: "mat-gslide-1",
      type: "url",
      totalPages: 10,
      slides: [],
    };

    expect(isCanvaMaterialStale(pdfMaterial as Material)).toBe(false);
    expect(isCanvaMaterialStale(gslidesMaterial as Material)).toBe(false);
  });
});
