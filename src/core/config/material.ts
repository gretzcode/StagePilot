// StagePilot Centralized Material Storage & Expiration Policy

export const MATERIAL_CONFIG = {
  // Permanent Material Storage Policy: Materials stay active until room is explicitly deleted
  PERMANENT_STORAGE: true,
  DEFAULT_TTL_HOURS: 0,
  DEFAULT_TTL_MS: 0,

  // File size limits
  PDF_MAX_SIZE_BYTES: 50 * 1024 * 1024,      // 50 MB
  IMAGE_MAX_SIZE_BYTES: 10 * 1024 * 1024,    // 10 MB
  VIDEO_MAX_SIZE_BYTES: 250 * 1024 * 1024,   // 250 MB

  // Supported MIME types
  SUPPORTED_MIME_TYPES: {
    pdf: ["application/pdf"],
    image: ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif", "image/svg+xml"],
    video: ["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/x-msvideo", "video/mpeg"],
  },

  // Supported file extensions
  SUPPORTED_EXTENSIONS: {
    pdf: ["pdf"],
    image: ["png", "jpg", "jpeg", "webp", "gif", "svg"],
    video: ["mp4", "m4v", "mov", "webm", "mkv", "avi", "mpeg", "mpg"],
  },

  // Safe object key prefix
  R2_KEY_PREFIX: "stagepilot/materials",
};

export function isMaterialExpired(expiresAt: number | null | undefined): boolean {
  if (!expiresAt || expiresAt <= 0) return false;
  return Date.now() > expiresAt;
}

export function computeDefaultExpiration(uploadTimestamp = Date.now()): number {
  if (MATERIAL_CONFIG.PERMANENT_STORAGE) return 0; // 0 = permanent / never expires
  return uploadTimestamp + (MATERIAL_CONFIG.DEFAULT_TTL_MS || 86400000);
}
