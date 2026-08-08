import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";

export class UrlMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "url";

  supports(type: MaterialType): boolean {
    return type === "url";
  }

  async parse(source: string | File | Blob, name: string): Promise<Material> {
    const rawUrl = typeof source === "string" ? source : "https://stagepilot.live";

    // Validate URL scheme: Only allow https://
    let targetUrl = rawUrl;
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "https:") {
        throw new Error("Only secure HTTPS URLs are supported");
      }
      targetUrl = parsed.toString();
    } catch {
      throw new Error(`Invalid URL: ${rawUrl}`);
    }

    const slides: SlideMetadata[] = [
      {
        index: 1,
        title: name,
        url: targetUrl,
        notes: `Embedded URL presentation for ${targetUrl}`,
      },
    ];

    return {
      id: `mat-url-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "url",
      url: targetUrl,
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
    return material.slides[0] || { index: pageNumber, title: material.name, url: material.url };
  }
}
