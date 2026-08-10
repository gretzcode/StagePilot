import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { normalizeEmbedUrl } from "../validator";

export class UrlMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "url";

  supports(type: MaterialType): boolean {
    return type === "url";
  }

  async parse(source: string | File | Blob, name: string, totalPagesInput?: number): Promise<Material> {
    const rawUrl = typeof source === "string" ? source : "https://stagepilot.live";

    // Validate URL scheme: Only allow https://
    let targetUrl = normalizeEmbedUrl(rawUrl);
    try {
      const parsed = new URL(targetUrl);
      if (parsed.protocol !== "https:") {
        throw new Error("Only secure HTTPS URLs are supported");
      }
      targetUrl = parsed.toString();
    } catch {
      throw new Error(`Invalid URL: ${rawUrl}`);
    }

    const totalPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 1;
    const slides: SlideMetadata[] = Array.from({ length: totalPages }, (_, i) => ({
      index: i + 1,
      title: `Slide ${i + 1}`,
      url: targetUrl,
      notes: `Embedded URL presentation for ${targetUrl}`,
    }));

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    return {
      id: `mat-url-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "url",
      sourceType: "EXTERNAL_URL",
      url: targetUrl,
      objectKey: null,
      externalUrl: targetUrl,
      sizeBytes: 0,
      totalPages,
      slides,
      uploadedAt: now,
      expiresAt,
      status: "ready",
      metadata: {
        title: name,
        pageCount: totalPages,
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    return (
      material.slides[pageNumber - 1] || {
        index: pageNumber,
        title: `${material.name} — Slide ${pageNumber}`,
        url: material.url,
      }
    );
  }
}
