import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { computeDefaultExpiration } from "@/core/config/material";
import { normalizeEmbedUrl } from "../validator";

export class CanvaMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "canva";

  supports(type: MaterialType): boolean {
    return type === "canva";
  }

  /**
   * Generate thumbnail URL for Canva design
   * Uses a preview service to capture the Canva design preview
   */
  private generateThumbnailUrl(designUrl: string): string | null {
    try {
      // Use Microlink API to extract Open Graph image from Canva design page
      // This is free and requires no authentication
      const encoded = encodeURIComponent(designUrl);
      return `https://api.microlink.io/?url=${encoded}&screenshot=true&meta=false&codeStyle=github`;
    } catch {
      return null;
    }
  }

  async parse(source: string | File | Blob, name: string, totalPagesInput?: number): Promise<Material> {
    const rawUrl = typeof source === "string" ? source.trim() : "";
    const externalUrl = normalizeEmbedUrl(rawUrl);
    const thumbnailUrl = this.generateThumbnailUrl(rawUrl);
    
    const now = Date.now();
    const expiresAt = computeDefaultExpiration(now);

    const totalPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 1;
    const slides: SlideMetadata[] = Array.from({ length: totalPages }, (_, i) => ({
      index: i + 1,
      title: `Slide ${i + 1}`,
      contentUrl: externalUrl,
      url: externalUrl,
      thumbnailUrl, // Add thumbnail URL to each slide
    }));

    return {
      id: `mat-canva-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || "Canva Presentation",
      type: "canva",
      sourceType: "CANVA_LINK",
      url: externalUrl,
      objectKey: null,
      externalUrl,
      sizeBytes: 0,
      totalPages,
      slides,
      uploadedAt: now,
      expiresAt,
      status: "ready",
      metadata: {
        title: name || "Canva Presentation",
        pageCount: totalPages,
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    return (
      material.slides[pageNumber - 1] || {
        index: pageNumber,
        title: `${material.name} — Slide ${pageNumber}`,
        contentUrl: material.externalUrl || material.url,
      }
    );
  }
}
