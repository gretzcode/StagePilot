import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { computeDefaultExpiration } from "@/core/config/material";
import { normalizeEmbedUrl } from "../validator";

export class CanvaMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "canva";

  supports(type: MaterialType): boolean {
    return type === "canva";
  }

  async parse(source: string | File | Blob, name: string, totalPagesInput?: number): Promise<Material> {
    const rawUrl = typeof source === "string" ? source.trim() : "";
    const externalUrl = normalizeEmbedUrl(rawUrl);
    
    const now = Date.now();
    const expiresAt = computeDefaultExpiration(now);

    // Canva designs are single presentations (not multi-page like Google Slides)
    // Each Canva design is treated as one unit with no page-by-page navigation
    const totalPages = 1;
    const slides: SlideMetadata[] = [
      {
        index: 1,
        title: name || "Canva Design",
        contentUrl: externalUrl,
        url: externalUrl,
        // Note: Canva thumbnails removed - they are unreliable (Microlink API issues, Canva blocking)
        // The design preview is only visible when viewing the embed itself
      },
    ];

    return {
      id: `mat-canva-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || "Canva Design",
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
        title: name || "Canva Design",
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
