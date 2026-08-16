import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { computeDefaultExpiration } from "@/core/config/material";
import { normalizeEmbedUrl } from "../validator";

async function extractCanvaMetadataAndSlides(rawUrl: string): Promise<{
  title?: string;
  thumbnailUrl?: string;
  slides: string[];
}> {
  const result: { title?: string; thumbnailUrl?: string; slides: string[] } = { slides: [] };

  // 1. Try Canva oEmbed API
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
      if (data.title) result.title = data.title;
      if (data.thumbnail_url) {
        result.thumbnailUrl = data.thumbnail_url;
        result.slides.push(data.thumbnail_url);
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. Fetch public Canva view page to extract all exported slide page images
  try {
    const viewUrl = rawUrl.includes("canva.com") ? rawUrl.split("?")[0] : rawUrl;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(viewUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const html = await res.text();

      if (!result.title) {
        const titleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
                           html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          result.title = titleMatch[1].replace(/\s*-\s*Canva$/i, "").trim();
        }
      }

      // Extract Canva CDN slide images from HTML/JSON bootstrap data
      const imgRegex = /https:\/\/[^"'\s\\]*(?:media\.canva\.com|document-export\.canva\.com)[^"'\s\\]*\.(?:png|jpg|jpeg|webp)(?:\?[^"'\s\\]*)?/gi;
      const matches = html.match(imgRegex) || [];
      const cleanMatches = matches.map((u) => u.replace(/\\u002F/g, "/").replace(/\\\//g, "/"));

      const seen = new Set<string>();
      const extractedSlideUrls: string[] = [];
      for (const url of cleanMatches) {
        if (!seen.has(url) && !url.includes("avatar") && !url.includes("icon") && !url.includes("profile")) {
          seen.add(url);
          extractedSlideUrls.push(url);
        }
      }

      if (extractedSlideUrls.length > 0) {
        result.slides = extractedSlideUrls;
      }
    }
  } catch {
    // Non-fatal
  }

  return result;
}

export class CanvaMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "canva";

  supports(type: MaterialType): boolean {
    return type === "canva";
  }

  async parse(source: string | File | Blob, name: string, _totalPagesInput?: number): Promise<Material> {
    const rawUrl = typeof source === "string" ? source.trim() : "";
    const externalUrl = normalizeEmbedUrl(rawUrl);

    const extraction = await extractCanvaMetadataAndSlides(rawUrl);
    const resolvedTitle =
      extraction.title || (name && name !== "Web Presentation" && name !== "External Presentation" ? name : "Canva Presentation");

    const now = Date.now();
    const expiresAt = computeDefaultExpiration(now);

    const extractedSlides = extraction.slides;
    const totalPages = extractedSlides.length > 0 ? extractedSlides.length : 1;

    const slides: SlideMetadata[] =
      extractedSlides.length > 0
        ? extractedSlides.map((imgUrl, idx) => ({
            index: idx + 1,
            title: `${resolvedTitle} — Slide ${idx + 1}`,
            contentUrl: imgUrl,
            url: imgUrl,
            thumbnailUrl: imgUrl,
          }))
        : [
            {
              index: 1,
              title: resolvedTitle,
              contentUrl: externalUrl,
              url: externalUrl,
              thumbnailUrl: extraction.thumbnailUrl,
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
        thumbnailUrl: extraction.thumbnailUrl,
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
