import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";

export class ImageMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "image";

  supports(type: MaterialType): boolean {
    return type === "image";
  }

  async parse(source: string | File | Blob, name: string): Promise<Material> {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);
    const slides: SlideMetadata[] = [
      {
        index: 1,
        title: name,
        thumbnailUrl: url,
        contentUrl: url,
      },
    ];

    return {
      id: `mat-img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "image",
      url,
      totalPages: 1,
      slides,
      uploadedAt: Date.now(),
      status: "ready",
      metadata: {
        title: name,
        pageCount: 1,
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    return material.slides[0] || { index: pageNumber, title: material.name, contentUrl: material.url };
  }
}
