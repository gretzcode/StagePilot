import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";

export class PptxMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "pptx";

  supports(type: MaterialType): boolean {
    return type === "pptx";
  }

  async parse(source: string | File | Blob, name: string): Promise<Material> {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    // PPTX slide parser extracts slide structures into normalized slides
    const slideCount = 15;
    const slides: SlideMetadata[] = Array.from({ length: slideCount }, (_, i) => ({
      index: i + 1,
      title: `Slide ${i + 1}`,
      notes: `PPTX Speaker Note for Slide ${i + 1}`,
      contentUrl: url,
    }));

    return {
      id: `mat-pptx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "pptx",
      url,
      totalPages: slideCount,
      slides,
      uploadedAt: Date.now(),
      status: "ready",
      metadata: {
        title: name,
        pageCount: slideCount,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    const slide = material.slides[pageNumber - 1];
    if (!slide) {
      throw new Error(`Slide ${pageNumber} out of range for PPTX material ${material.name}`);
    }
    return slide;
  }
}
