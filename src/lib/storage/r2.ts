import { MATERIAL_CONFIG } from "@/core/config/material";

export interface R2ObjectKeyInfo {
  materialId: string;
  originalFileName: string;
  objectKey: string;
}

// In-memory binary storage fallback for vitest/local development
const memoryR2Store = new Map<string, { data: Uint8Array; mimeType: string; expiresAt: number }>();

export function buildMaterialObjectKey(materialId: string, fileName: string): string {
  // Prevent directory traversal or direct key tampering
  const safeFileName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/\.\.+/g, "");
  return `${MATERIAL_CONFIG.R2_KEY_PREFIX}/${materialId}/${safeFileName}`;
}

export function buildScopedObjectKey(roomId: string, materialId: string, filename: string): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, "_").replace(/\.\.+/g, "");
  return `rooms/${roomId}/materials/${materialId}/${safeFilename}`;
}

export async function generateUploadAuthorization(
  roomId: string,
  materialId: string,
  filename: string
): Promise<{ objectKey: string; uploadUrl: string; expiresAt: number }> {
  const objectKey = buildScopedObjectKey(roomId, materialId, filename);
  const expiresAt = Date.now() + 15 * 60 * 1000;
  const uploadUrl = `/api/material/upload?key=${encodeURIComponent(objectKey)}&expires=${expiresAt}`;
  return { objectKey, uploadUrl, expiresAt };
}

export async function putR2Object(
  env: Record<string, unknown> | null | undefined,
  objectKey: string,
  data: Uint8Array | ArrayBuffer | Blob | string,
  mimeType: string,
  expiresAt: number
): Promise<void> {
  const r2Bucket = env?.MATERIALS_BUCKET as { put: (key: string, body: unknown, opts?: unknown) => Promise<unknown> } | undefined;

  let buffer: Uint8Array;
  if (typeof data === "string") {
    buffer = new TextEncoder().encode(data);
  } else if (data instanceof Blob) {
    buffer = new Uint8Array(await data.arrayBuffer());
  } else if (data instanceof ArrayBuffer) {
    buffer = new Uint8Array(data);
  } else {
    buffer = data;
  }

  if (r2Bucket && typeof r2Bucket.put === "function") {
    await r2Bucket.put(objectKey, buffer, {
      httpMetadata: { contentType: mimeType },
      customMetadata: { expiresAt: expiresAt.toString() },
    });
  } else {
    // Vitest/local fallback
    memoryR2Store.set(objectKey, { data: buffer, mimeType, expiresAt });
  }
}

export async function getR2Object(
  env: Record<string, unknown> | null | undefined,
  objectKey: string
): Promise<{ data: Uint8Array; mimeType: string; expiresAt?: number } | null> {
  const r2Bucket = env?.MATERIALS_BUCKET as {
    get: (key: string) => Promise<{ body: ReadableStream; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> } | null>;
  } | undefined;

  if (r2Bucket && typeof r2Bucket.get === "function") {
    const object = await r2Bucket.get(objectKey);
    if (!object) return null;

    const arrayBuffer = await new Response(object.body).arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const mimeType = object.httpMetadata?.contentType || "application/octet-stream";
    const expiresAt = object.customMetadata?.expiresAt ? parseInt(object.customMetadata.expiresAt, 10) : undefined;

    return { data, mimeType, expiresAt };
  }

  // Memory fallback
  const item = memoryR2Store.get(objectKey);
  if (!item) return null;

  return item;
}

export async function deleteR2Object(
  env: Record<string, unknown> | null | undefined,
  objectKey: string
): Promise<void> {
  const r2Bucket = env?.MATERIALS_BUCKET as { delete: (key: string) => Promise<unknown> } | undefined;

  if (r2Bucket && typeof r2Bucket.delete === "function") {
    await r2Bucket.delete(objectKey);
  } else {
    memoryR2Store.delete(objectKey);
  }
}

export function clearMemoryR2Store(): void {
  memoryR2Store.clear();
}
