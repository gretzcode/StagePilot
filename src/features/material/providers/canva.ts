import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { computeDefaultExpiration } from "@/core/config/material";
import { normalizeEmbedUrl } from "../validator";

export class CanvaMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "canva";

  supports(type: MaterialType): boolean {
    return type === "canva";
  }

  async parse(source: string | File | Blob, name: string, _totalPagesInput?: number): Promise<Material> {
    const rawUrl = typeof source === "string" ? source.trim() : "";
    const externalUrl = normalizeEmbedUrl(rawUrl);

    let resolvedTitle = name && name !== "Web Presentation" && name !== "External Presentation" ? name : "Canva Presentation";
    let thumbnailUrl: string | undefined;

    try {
      const oembedUrl = `https://www.canva.com/_oembed?url=${encodeURIComponent(rawUrl)}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(oembedUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = (await res.json()) as { title?: string; thumbnail_url?: string };
        if (data.title && (!name || name === "Web Presentation" || name === "External Presentation" || name === "Canva Design")) {
          resolvedTitle = data.title;
        }
        if (data.thumbnail_url) {
          thumbnailUrl = data.thumbnail_url;
        }
      }
    } catch {
      // Non-fatal: fallback to default title
    }

    const now = Date.now();
    const expiresAt = computeDefaultExpiration(now);
    const totalPages = 1;

    const slides: SlideMetadata[] = [
      {
        index: 1,
        title: resolvedTitle,
        contentUrl: thumbnailUrl || externalUrl,
        url: externalUrl,
        thumbnailUrl,
      },
    ];

    return {
      id: `mat-canva-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: resolvedTitle,
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
        title: resolvedTitle,
        pageCount: totalPages,
        thumbnailUrl,
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
