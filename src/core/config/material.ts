// StagePilot Centralized Material Storage & Expiration Policy

export const MATERIAL_CONFIG = {
  // Default TTL: 24 Hours
  DEFAULT_TTL_HOURS: 24,
  DEFAULT_TTL_MS: 24 * 60 * 60 * 1000,

  // File size limits
  PDF_MAX_SIZE_BYTES: 50 * 1024 * 1024,   // 50 MB
  PPTX_MAX_SIZE_BYTES: 50 * 1024 * 1024,  // 50 MB
  IMAGE_MAX_SIZE_BYTES: 10 * 1024 * 1024, // 10 MB

  // Supported MIME types
  SUPPORTED_MIME_TYPES: {
    pdf: ["application/pdf"],
    pptx: [
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.ms-powerpoint",
    ],
    image: ["image/png", "image/jpeg", "image/jpg", "image/webp"],
  },

  // Supported file extensions
  SUPPORTED_EXTENSIONS: {
    pdf: ["pdf"],
    pptx: ["pptx", "ppt"],
    image: ["png", "jpg", "jpeg", "webp"],
  },

  // Safe object key prefix
  R2_KEY_PREFIX: "stagepilot/materials",
};

export function isMaterialExpired(expiresAt: number | null | undefined): boolean {
  if (!expiresAt) return false;
  return Date.now() > expiresAt;
}

export function computeDefaultExpiration(uploadTimestamp = Date.now()): number {
  return uploadTimestamp + MATERIAL_CONFIG.DEFAULT_TTL_MS;
}
