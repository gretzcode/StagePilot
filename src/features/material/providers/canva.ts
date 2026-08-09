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

    const totalPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 24;
    const slides: SlideMetadata[] = Array.from({ length: totalPages }, (_, i) => ({
      index: i + 1,
      title: `Slide ${i + 1}`,
      contentUrl: externalUrl,
      url: externalUrl,
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
