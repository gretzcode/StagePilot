import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";

export class PdfMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "pdf";

  supports(type: MaterialType): boolean {
    return type === "pdf";
  }

  async parse(source: string | File | Blob, name: string, totalPagesInput?: number): Promise<Material> {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const estimatedPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 12;
    const slides: SlideMetadata[] = Array.from({ length: estimatedPages }, (_, i) => ({
      index: i + 1,
      title: `Page ${i + 1}`,
      notes: `Speaker notes for PDF page ${i + 1}`,
      contentUrl: url,
    }));

    return {
      id: `mat-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "pdf",
      url,
      totalPages: estimatedPages,
      slides,
      uploadedAt: Date.now(),
      status: "ready",
      metadata: {
        title: name,
        pageCount: estimatedPages,
        mimeType: "application/pdf",
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    const slide = material.slides[pageNumber - 1];
    if (!slide) {
      throw new Error(`Slide page ${pageNumber} out of range for PDF material ${material.name}`);
    }
    return slide;
  }
}
