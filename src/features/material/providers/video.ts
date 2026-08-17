import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { normalizeEmbedUrl } from "../validator";
import { extractYouTubeIds } from "../adapters/media-adapter";

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

export interface DiscoveredVideoInfo {
  title?: string;
  thumbnailUrl?: string;
}

export async function discoverVideoInfo(rawUrl: string): Promise<DiscoveredVideoInfo | null> {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.toLowerCase();

    // 1. YouTube oEmbed
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      const { videoId } = extractYouTubeIds(rawUrl);
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`;
      const res = await fetch(oembedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      let title: string | undefined;
      let thumbnailUrl: string | undefined;

      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string; thumbnail_url?: string } | null;
        if (data?.title) title = data.title.trim();
        if (data?.thumbnail_url) thumbnailUrl = data.thumbnail_url;
      }

      if (!thumbnailUrl && videoId) {
        thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      }

      return { title, thumbnailUrl };
    }

    // 2. Vimeo oEmbed
    if (host.includes("vimeo.com")) {
      const oembedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(rawUrl)}`;
      const res = await fetch(oembedUrl, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (res.ok) {
        const data = (await res.json().catch(() => null)) as { title?: string; thumbnail_url?: string } | null;
        return {
          title: data?.title?.trim(),
          thumbnailUrl: data?.thumbnail_url,
        };
      }
    }
  } catch {
    // Non-fatal
  }

  return null;
}

export async function discoverVideoTitle(rawUrl: string): Promise<string | null> {
  const info = await discoverVideoInfo(rawUrl);
  return info?.title || null;
}

export interface PlaylistItem {
  videoId: string;
  title: string;
  thumbnailUrl: string;
  url: string;
}

export async function fetchYouTubePlaylist(listId: string): Promise<{ title: string | null; items: PlaylistItem[] }> {
  const items: PlaylistItem[] = [];
  let playlistTitle: string | null = null;

  // 1. Primary: YouTube Atom RSS Feed (official, free, fast XML endpoint for playlists)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(listId)}`;
    const res = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        Accept: "application/atom+xml,application/xml,text/xml;q=0.9,*/*;q=0.8",
      },
    });
    clearTimeout(timeout);

    if (res.ok) {
      const xml = await res.text();

      // Extract feed title
      const feedTitleMatch = xml.match(/<title>([^<]+)<\/title>/);
      if (feedTitleMatch && feedTitleMatch[1]) {
        playlistTitle = decodeXmlEntities(feedTitleMatch[1]).trim();
      }

      // Extract all <entry> blocks
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      let match: RegExpExecArray | null;

      while ((match = entryRegex.exec(xml)) !== null) {
        const entryXml = match[1];
        const videoIdMatch = entryXml.match(/<yt:videoId>([^<]+)<\/yt:videoId>/);
        const titleMatch = entryXml.match(/<title>([^<]+)<\/title>/);
        const thumbMatch = entryXml.match(/<media:thumbnail\s+[^>]*url="([^"]+)"/);

        if (videoIdMatch && videoIdMatch[1]) {
          const videoId = videoIdMatch[1].trim();
          const title =
            titleMatch && titleMatch[1]
              ? decodeXmlEntities(titleMatch[1]).trim()
              : `Video ${items.length + 1}`;
          const thumbnailUrl =
            thumbMatch && thumbMatch[1]
              ? thumbMatch[1]
              : `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;

          items.push({
            videoId,
            title,
            thumbnailUrl,
            url: `https://www.youtube.com/watch?v=${videoId}`,
          });
        }
      }
    }
  } catch {
    // Silently proceed to HTML fallback
  }

  // 2. Fallback: YouTube Playlist HTML Scraping
  if (items.length === 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      const playlistUrl = `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;
      const res = await fetch(playlistUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      clearTimeout(timeout);

      if (res.ok) {
        const html = await res.text();

        // Extract title tag
        const titleTagMatch = html.match(/<title>([^<]+)<\/title>/);
        if (titleTagMatch && titleTagMatch[1]) {
          playlistTitle = titleTagMatch[1].replace("- YouTube", "").trim();
        }

        // Match video IDs from ytInitialData or HTML
        const videoIdMatches = Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)).map((m) => m[1]);
        const uniqueIds = Array.from(new Set(videoIdMatches));

        for (const vId of uniqueIds) {
          items.push({
            videoId: vId,
            title: `Video ${items.length + 1}`,
            thumbnailUrl: `https://img.youtube.com/vi/${vId}/hqdefault.jpg`,
            url: `https://www.youtube.com/watch?v=${vId}`,
          });
        }
      }
    } catch {
      // Non-fatal
    }
  }

  return { title: playlistTitle, items };
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

    const { videoId, listId } = extractYouTubeIds(targetUrl);

    // 1. YouTube Playlist Handling: expand playlist into individual video slides
    if (listId) {
      const playlist = await fetchYouTubePlaylist(listId);
      if (playlist.items.length > 0) {
        const finalTitle = resolvedTitle || playlist.title || "YouTube Playlist";
        const slides: SlideMetadata[] = playlist.items.map((item, idx) => ({
          index: idx + 1,
          title: item.title,
          url: item.url,
          contentUrl: item.url,
          thumbnailUrl: item.thumbnailUrl,
          notes: item.title,
        }));

        const now = Date.now();
        const expiresAt = now + 24 * 60 * 60 * 1000;

        return {
          id: `mat-video-${now}-${Math.random().toString(36).slice(2, 6)}`,
          name: finalTitle,
          type: "video",
          sourceType: "EXTERNAL_URL",
          url: slides[0].contentUrl || targetUrl,
          objectKey: null,
          externalUrl: targetUrl,
          sizeBytes: 0,
          totalPages: slides.length,
          slides,
          uploadedAt: now,
          expiresAt,
          status: "ready",
          metadata: {
            title: finalTitle,
            pageCount: slides.length,
            thumbnailUrl: slides[0].thumbnailUrl,
          },
        };
      }
    }

    // 2. Single Video Handling (YouTube, Vimeo, direct MP4)
    const discovered = await discoverVideoInfo(rawUrl);
    if (!resolvedTitle) {
      resolvedTitle = discovered?.title || "Video Presentation";
    }
    const singleThumb =
      discovered?.thumbnailUrl ||
      (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : undefined);

    const totalPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 1;
    const slides: SlideMetadata[] = Array.from({ length: totalPages }, (_, i) => ({
      index: i + 1,
      title: resolvedTitle,
      url: targetUrl,
      contentUrl: targetUrl,
      thumbnailUrl: singleThumb,
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
        thumbnailUrl: singleThumb,
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
