import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { normalizeEmbedUrl } from "../validator";

export async function discoverVideoTitle(rawUrl: string): Promise<string | null> {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // 1. YouTube oEmbed
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
      const res = await fetch(oembedUrl, {
        headers: { "User-Agent": "StagePilot/1.0" },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        if (data?.title) return data.title.trim();
      }
    }

    // 2. Vimeo oEmbed
    if (host.includes("vimeo.com")) {
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(rawUrl)}`;
      const res = await fetch(oembedUrl, {
        headers: { "User-Agent": "StagePilot/1.0" },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string } | null;
        if (data?.title) return data.title.trim();
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}

export class VideoMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "video";

  supports(type: MaterialType): boolean {
    return type === "video";
  }

  async parse(source: string | File | Blob, name: string, totalPagesInput?: number): Promise<Material> {
    const rawUrl = typeof source === "string" ? source : "https://stagepilot.live";

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

    let resolvedTitle =
      name &&
      name !== "Web Presentation" &&
      name !== "External Presentation" &&
      name !== "Video Presentation" &&
      !name.startsWith("http")
        ? name.trim()
        : "";

    if (!resolvedTitle) {
      const discovered = await discoverVideoTitle(rawUrl);
      resolvedTitle = discovered || "Video Presentation";
    }

    const totalPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 1;
    const slides: SlideMetadata[] = Array.from({ length: totalPages }, (_, i) => ({
      index: i + 1,
      title: resolvedTitle,
      url: targetUrl,
      contentUrl: targetUrl,
      notes: `Video playback for ${targetUrl}`,
    }));

    const now = Date.now();
    const expiresAt = now + 24 * 60 * 60 * 1000;

    return {
      id: `mat-video-${now}-${Math.random().toString(36).slice(2, 6)}`,
      name: resolvedTitle,
      type: "video",
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
        title: resolvedTitle,
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
        contentUrl: material.url,
      }
    );
  }
}
