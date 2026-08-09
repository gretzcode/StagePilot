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

  // 1. Determine material type from extension
  let materialType: MaterialType | null = null;
  if (MATERIAL_CONFIG.SUPPORTED_EXTENSIONS.pdf.includes(ext)) {
    materialType = "pdf";
  } else if (MATERIAL_CONFIG.SUPPORTED_EXTENSIONS.pptx.includes(ext)) {
    materialType = "pptx";
  } else if (MATERIAL_CONFIG.SUPPORTED_EXTENSIONS.image.includes(ext)) {
    materialType = "image";
  }

  if (!materialType) {
    return {
      valid: false,
      error: "Format file belum didukung.",
    };
  }

  // 2. Validate MIME type if present
  const validMimes = MATERIAL_CONFIG.SUPPORTED_MIME_TYPES[materialType as "pdf" | "pptx" | "image"] || [];
  if (declaredMimeType && declaredMimeType !== "application/octet-stream" && !validMimes.includes(declaredMimeType.toLowerCase())) {
    const isImageMime = declaredMimeType.startsWith("image/");
    if (materialType === "image" && !isImageMime) {
      return { valid: false, error: "Format file belum didukung." };
    }
  }

  // 3. Enforce maximum file size
  let maxBytes = MATERIAL_CONFIG.PDF_MAX_SIZE_BYTES;
  if (materialType === "image") {
    maxBytes = MATERIAL_CONFIG.IMAGE_MAX_SIZE_BYTES;
  } else if (materialType === "pptx") {
    maxBytes = MATERIAL_CONFIG.PPTX_MAX_SIZE_BYTES;
  }

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

    const isCanva = parsed.hostname.includes("canva.com");
    const sourceType: MaterialSourceType = isCanva ? "CANVA_LINK" : "EXTERNAL_URL";
    const materialType: MaterialType = isCanva ? "canva" : "url";

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

export function normalizeEmbedUrl(urlString: string): string {
  if (!urlString || typeof urlString !== "string") return urlString;
  const trimmed = urlString.trim();

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.toLowerCase();

    if (host.includes("canva.com")) {
      const match = parsed.pathname.match(/\/design\/([A-Za-z0-9_-]+)/);
      if (match && match[1]) {
        const designId = match[1];
        if (parsed.pathname.includes("/watch")) {
          return `https://www.canva.com/design/${designId}/watch?embed`;
        }
        return `https://www.canva.com/design/${designId}/view?embed`;
      }
      if (!parsed.searchParams.has("embed")) {
        parsed.searchParams.set("embed", "true");
        return parsed.toString();
      }
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

        // Try /embed, /pub, and /edit endpoints
        const urlsToTry = [
          `https://docs.google.com/presentation/d/${presentationId}/embed`,
          `https://docs.google.com/presentation/d/${presentationId}/pub`,
          `https://docs.google.com/presentation/d/${presentationId}/edit`,
        ];

        for (const targetUrl of urlsToTry) {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 4000);

            const res = await fetch(targetUrl, {
              signal: controller.signal,
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
              },
            });
            clearTimeout(timeout);

            if (res.ok) {
              const html = await res.text();

              // 1. Look for punch-viewer-slide or svgpage DOM elements
              const slideMatches = html.match(/punch-viewer-slide/g) || html.match(/svgpage/g);
              if (slideMatches && slideMatches.length > 0) {
                return { totalPages: slideMatches.length };
              }

              // 2. Look for slide ID arrays in JSON script data e.g. ["p1","p2","p3"...]
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

              // 3. Look for slide=id.p1, slide=id.p2, etc.
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
