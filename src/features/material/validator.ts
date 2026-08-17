import { MATERIAL_CONFIG } from "@/core/config/material";
import { MaterialType, MaterialSourceType } from "@/core/types";

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sourceType?: MaterialSourceType;
  materialType?: MaterialType;
  mimeType?: string;
}

export function validateUploadedFile(
  fileName: string,
  declaredMimeType: string,
  sizeBytes: number
): ValidationResult {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";

  let materialType: MaterialType | null = null;
  if (MATERIAL_CONFIG.SUPPORTED_EXTENSIONS.pdf.includes(ext)) {
    materialType = "pdf";
  } else if (MATERIAL_CONFIG.SUPPORTED_EXTENSIONS.image.includes(ext)) {
    materialType = "image";
  } else if (MATERIAL_CONFIG.SUPPORTED_EXTENSIONS.video.includes(ext)) {
    materialType = "video";
  }

  if (!materialType) {
    return {
      valid: false,
      error: "Format file belum didukung.",
    };
  }

  const validMimes = MATERIAL_CONFIG.SUPPORTED_MIME_TYPES[materialType as "pdf" | "image" | "video"] || [];
  if (declaredMimeType && declaredMimeType !== "application/octet-stream" && !validMimes.includes(declaredMimeType.toLowerCase())) {
    if (materialType === "image" && !declaredMimeType.toLowerCase().startsWith("image/")) {
      return { valid: false, error: "Format file belum didukung." };
    }
    if (materialType === "video" && !declaredMimeType.toLowerCase().startsWith("video/")) {
      return { valid: false, error: "Format file belum didukung." };
    }
  }

  let maxBytes = MATERIAL_CONFIG.PDF_MAX_SIZE_BYTES;
  if (materialType === "image") maxBytes = MATERIAL_CONFIG.IMAGE_MAX_SIZE_BYTES;
  if (materialType === "video") maxBytes = MATERIAL_CONFIG.VIDEO_MAX_SIZE_BYTES;

  if (sizeBytes > maxBytes) {
    return {
      valid: false,
      error: "Ukuran file melebihi batas yang diizinkan.",
    };
  }

  return {
    valid: true,
    sourceType: "UPLOADED_FILE",
    materialType,
    mimeType: declaredMimeType || "application/octet-stream",
  };
}

export function validateExternalUrl(urlString: string): ValidationResult {
  if (!urlString || typeof urlString !== "string") {
    return { valid: false, error: "URL tidak valid." };
  }

  const trimmed = urlString.trim();

  // Reject malicious protocols explicitly
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:") || lower.startsWith("file:")) {
    return { valid: false, error: "Protokol URL tidak diizinkan." };
  }

  if (lower.startsWith("http://")) {
    return { valid: false, error: "URL harus menggunakan protokol HTTPS yang aman." };
  }

  if (!lower.startsWith("https://")) {
    return { valid: false, error: "URL harus menggunakan protokol HTTPS yang aman." };
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return { valid: false, error: "URL harus menggunakan protokol HTTPS yang aman." };
    }

    const isCanva =
      parsed.hostname.includes("canva.com") ||
      parsed.hostname.includes("canva.me") ||
      parsed.hostname.includes("canva.link");
    const isYoutube = parsed.hostname.includes("youtube.com") || parsed.hostname.includes("youtu.be");
    const isVimeo = parsed.hostname.includes("vimeo.com");
    const isGoogleDrive = parsed.hostname.includes("drive.google.com");
    const isPdfUrl = parsed.pathname.toLowerCase().endsWith(".pdf");
    const sourceType: MaterialSourceType = isCanva ? "CANVA_LINK" : "EXTERNAL_URL";

    let materialType: MaterialType = "url";
    if (isCanva) materialType = "canva";
    else if (isYoutube || isVimeo) materialType = "video";
    else if (isGoogleDrive || isPdfUrl) materialType = "pdf";

    return {
      valid: true,
      sourceType,
      materialType,
    };
  } catch {
    return { valid: false, error: "URL tidak valid." };
  }
}

export function isPrivateNetworkUrl(urlString: string): boolean {
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();

    if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) {
      return true;
    }

    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;

    return false;
  } catch {
    return true;
  }
}

export function isCanvaMaterialStale(material: {
  type?: string;
  sourceType?: string;
  totalPages?: number;
  slides?: Array<{ contentUrl?: string }>;
} | null | undefined): boolean {
  if (!material || material.type !== "canva") return false;

  // 1. Missing or empty slides array
  if (!material.slides || !Array.isArray(material.slides) || material.slides.length === 0) {
    return true;
  }

  // 2. Invalid totalPages count
  if (typeof material.totalPages !== "number" || material.totalPages < 1) {
    return true;
  }

  // 3. Schema/URL check: Legacy iframe embeds point to Canva /design/ or /view URLs
  // instead of exported slide image assets (e.g. document-export.canva.com)
  const firstSlideUrl = material.slides[0]?.contentUrl || "";
  if (!firstSlideUrl) {
    return true;
  }

  if (
    firstSlideUrl.includes("/design/") ||
    firstSlideUrl.includes("/view") ||
    firstSlideUrl.includes("canva.com/design")
  ) {
    return true;
  }

  return false;
}

export function isPdfMaterialStale(material: {
  type?: string;
  sourceType?: string;
  totalPages?: number;
  slides?: Array<{ contentUrl?: string; url?: string }>;
} | null | undefined): boolean {
  if (!material || material.type !== "pdf") return false;

  // 1. Invalid or missing totalPages count (or legacy 1-page fallback on multi-page material)
  if (typeof material.totalPages !== "number" || material.totalPages < 1) {
    return true;
  }

  // 2. Missing or empty slides array
  if (!material.slides || !Array.isArray(material.slides) || material.slides.length === 0) {
    return true;
  }

  // 3. Mismatch between totalPages and slides.length
  if (material.slides.length !== material.totalPages) {
    return true;
  }

  return false;
}

export function extractFilenameFromContentDisposition(header: string | null | undefined): string | null {
  if (!header || typeof header !== "string") return null;

  // 1. Try filename*=UTF-8''... (RFC 5987)
  const utf8Match = header.match(/filename\*\s*=\s*UTF-8''([^;\r\n]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      const decoded = decodeURIComponent(utf8Match[1].trim().replace(/^["']|["']$/g, ""));
      if (decoded) return decoded;
    } catch {
      // Continue to next parser
    }
  }

  // 2. Try quoted filename="..."
  const quotedMatch = header.match(/filename\s*=\s*"([^"]+)"/i);
  if (quotedMatch && quotedMatch[1]) {
    const val = quotedMatch[1].trim();
    if (val) return val;
  }

  // 3. Try unquoted filename=...
  const plainMatch = header.match(/filename\s*=\s*([^;\s\r\n]+)/i);
  if (plainMatch && plainMatch[1]) {
    const val = plainMatch[1].trim().replace(/^["']|["']$/g, "");
    if (val) return val;
  }

  return null;
}

export function sanitizePdfFilename(name: string | null | undefined, fallback = "Presentation.pdf"): string {
  if (!name || typeof name !== "string") return fallback;
  let cleaned = name.trim();

  // Strip query strings or URL hashes if accidentally passed
  cleaned = cleaned.split("?")[0].split("#")[0];

  try {
    cleaned = decodeURIComponent(cleaned);
  } catch {
    // Keep as is
  }

  // Remove path separators, directory traversal sequences, and forbidden path characters
  cleaned = cleaned.replace(/[/\\?%*:|"<>]/g, " ");
  cleaned = cleaned.replace(/\.\.+/g, " ");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Remove leading/trailing dots and spaces
  cleaned = cleaned.replace(/^\.+|\.+$/g, "").trim();

  if (!cleaned) return fallback;

  if (!cleaned.toLowerCase().endsWith(".pdf")) {
    cleaned = `${cleaned}.pdf`;
  }

  return cleaned;
}

export function resolvePdfFilename(options: {
  contentDisposition?: string | null;
  url?: string | null;
  googleDriveName?: string | null;
  userTitle?: string | null;
}): string {
  // 1. User provided title (Highest priority: if user explicitly typed a title, respect it)
  if (
    options.userTitle &&
    options.userTitle.trim() &&
    options.userTitle.trim() !== "External Presentation" &&
    options.userTitle.trim() !== "Presentation.pdf"
  ) {
    return sanitizePdfFilename(options.userTitle);
  }

  // 2. Google Drive metadata name
  if (options.googleDriveName && options.googleDriveName.trim()) {
    return sanitizePdfFilename(options.googleDriveName);
  }

  // 3. Content-Disposition header
  const cdName = extractFilenameFromContentDisposition(options.contentDisposition);
  if (cdName) {
    return sanitizePdfFilename(cdName);
  }

  // 4. URL pathname basename
  if (options.url && typeof options.url === "string") {
    try {
      const parsed = new URL(options.url.trim());
      const segments = parsed.pathname.split("/").filter(Boolean);
      const last = segments[segments.length - 1];
      if (last && last.toLowerCase().endsWith(".pdf")) {
        return sanitizePdfFilename(last);
      }
    } catch {
      // Invalid URL string
    }
  }

  // 5. Safe canonical fallback
  return "Presentation.pdf";
}

export function normalizeEmbedUrl(urlString: string): string {
  if (!urlString || typeof urlString !== "string") return urlString;
  const trimmed = urlString.trim();

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("canva.com")) {
      const cleanPath = parsed.pathname;
      return `https://www.canva.com${cleanPath}?embed`;
    }

    if (host.includes("drive.google.com")) {
      const match = parsed.pathname.match(/\/file\/d\/([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const fileId = match[1];
        return `https://drive.google.com/file/d/${fileId}/preview`;
      }
    }

    if (host.includes("docs.google.com") && parsed.pathname.includes("/presentation/d/")) {
      const match = parsed.pathname.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const presentationId = match[1];
        return `https://docs.google.com/presentation/d/${presentationId}/embed?rm=minimal&start=false&loop=false&delayms=3000`;
      }
    }

    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      let videoId = "";
      if (host.includes("youtu.be")) {
        videoId = parsed.pathname.slice(1).split("?")[0];
      } else if (parsed.pathname.includes("/embed/")) {
        videoId = parsed.pathname.split("/embed/")[1].split("?")[0];
      } else {
        videoId = parsed.searchParams.get("v") || "";
      }
      if (videoId) {
        return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&enablejsapi=1&controls=0&disablekb=1&fs=0&iv_load_policy=3&rel=0`;
      }
    }

    if (host.includes("vimeo.com")) {
      const match = parsed.pathname.match(/\/(\d+)/);
      if (match && match[1]) {
        return `https://player.vimeo.com/video/${match[1]}?autoplay=1`;
      }
    }
  } catch {
    // Return original if parsing fails
  }

  return trimmed;
}

export interface DetectionResult {
  totalPages: number;
  pageIds?: string[];
}

export async function detectSlideCountFromUrl(urlString: string): Promise<DetectionResult | null> {
  if (!urlString || typeof urlString !== "string") return null;
  const normalized = normalizeEmbedUrl(urlString);

  try {
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();

    // Google Slides Dynamic Auto-Detection
    if (host.includes("docs.google.com") && parsed.pathname.includes("/presentation/d/")) {
      const match = parsed.pathname.match(/\/presentation\/d\/([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const presentationId = match[1];

        // 1. Try Instant PDF Export Probe (/export/pdf) - 100% accurate & fast (~300ms)
        try {
          const pdfController = new AbortController();
          const pdfTimeout = setTimeout(() => pdfController.abort(), 3500);

          const pdfRes = await fetch(`https://docs.google.com/presentation/d/${presentationId}/export/pdf`, {
            signal: pdfController.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          });
          clearTimeout(pdfTimeout);

          if (pdfRes.ok && (pdfRes.headers.get("content-type")?.includes("pdf") || pdfRes.headers.get("content-type")?.includes("octet-stream"))) {
            const arrayBuf = await pdfRes.arrayBuffer();
            const text = new TextDecoder("latin1").decode(new Uint8Array(arrayBuf));
            const countMatches = text.match(/\/Count\s+(\d+)/g);
            if (countMatches) {
              for (const m of countMatches) {
                const num = parseInt(m.replace(/\/Count\s+/, ""), 10);
                if (num > 0) return { totalPages: num };
              }
            }
            const pageTypeMatches = text.match(/\/Type\s*\/Page\b/g);
            if (pageTypeMatches && pageTypeMatches.length > 0) {
              return { totalPages: pageTypeMatches.length };
            }
          }
        } catch {
          // Silently fall back to HTML & PNG probing
        }

        const urlsToTry = [
          `https://docs.google.com/presentation/d/${presentationId}/embed`,
          `https://docs.google.com/presentation/d/${presentationId}/pub`,
          `https://docs.google.com/presentation/d/${presentationId}/edit`,
        ];

        for (const targetUrl of urlsToTry) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 3000);

            const res = await fetch(targetUrl, {
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

              const slideMatches = html.match(/punch-viewer-slide/g) || html.match(/svgpage/g);
              if (slideMatches && slideMatches.length > 0) {
                return { totalPages: slideMatches.length };
              }

              const scriptSlideMatches = html.match(/["']id["']:\s*["'](p\d+|g[A-Za-z0-9_-]{3,})["']/g);
              if (scriptSlideMatches && scriptSlideMatches.length > 0) {
                const uniqueIds = new Set<string>();
                for (const m of scriptSlideMatches) {
                  const idMatch = m.match(/["'](p\d+|g[A-Za-z0-9_-]{3,})["']$/);
                  if (idMatch && idMatch[1]) {
                    uniqueIds.add(idMatch[1]);
                  }
                }
                if (uniqueIds.size > 0) {
                  return { totalPages: uniqueIds.size, pageIds: Array.from(uniqueIds) };
                }
              }

              const hashMatches = html.match(/slide=id\.(p\d+|g[A-Za-z0-9_-]{3,})/g);
              if (hashMatches && hashMatches.length > 0) {
                const uniqueHashes = new Set<string>();
                for (const h of hashMatches) {
                  const id = h.replace("slide=id.", "");
                  uniqueHashes.add(id);
                }
                if (uniqueHashes.size > 0) {
                  return { totalPages: uniqueHashes.size, pageIds: Array.from(uniqueHashes) };
                }
              }

              // Fast parallel PNG batch probing (probe up to 50 pages in batches of 10)
              let discoveredPages = 0;
              const maxScan = 50;
              const batchSize = 10;

              for (let start = 1; start <= maxScan; start += batchSize) {
                const batch = Array.from({ length: batchSize }, (_, idx) => start + idx);
                const results = await Promise.all(
                  batch.map(async (pageNumber) => {
                    try {
                      const probeController = new AbortController();
                      const probeTimeout = setTimeout(() => probeController.abort(), 1200);
                      const probeRes = await fetch(
                        `https://docs.google.com/presentation/d/${presentationId}/export/png?id=${presentationId}&pageid=p${pageNumber}`,
                        {
                          signal: probeController.signal,
                          headers: {
                            "User-Agent":
                              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                          },
                        }
                      );
                      clearTimeout(probeTimeout);
                      return probeRes.ok && probeRes.headers.get("content-type")?.includes("image");
                    } catch {
                      return false;
                    }
                  })
                );

                const validPages = batch.filter((_, idx) => results[idx]);
                if (validPages.length > 0) {
                  discoveredPages = validPages[validPages.length - 1];
                }
                if (validPages.length < batchSize) {
                  break;
                }
              }

              if (discoveredPages > 0) {
                return { totalPages: discoveredPages };
              }
            }
          } catch {
            // Continue to next endpoint if one fails
          }
        }
      }
    }
  } catch {
    // Silently fall back if network fetch fails
  }

  return null;
}

export function appendAssetAccessParams(url: string, deviceId?: string): string {
  if (!url || !deviceId) return url;
  if (!url.startsWith("/api/material/asset")) return url;
  try {
    const isAbsolute = url.startsWith("http://") || url.startsWith("https://");
    const parsed = new URL(url, isAbsolute ? undefined : "http://localhost");
    if (!parsed.searchParams.has("deviceId")) {
      parsed.searchParams.set("deviceId", deviceId);
    }
    return isAbsolute ? parsed.toString() : `${parsed.pathname}${parsed.search}`;
  } catch {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}deviceId=${encodeURIComponent(deviceId)}`;
  }
}
