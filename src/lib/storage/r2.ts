export interface MaterialStorageRecord {
  id: string;
  roomId: string;
  ownerId: string;
  type: string;
  name: string;
  objectKey: string;
  size: number;
  mimeType: string;
  status: "UPLOADING" | "PROCESSING" | "READY" | "ERROR" | "DELETED";
  createdAt: number;
  updatedAt: number;
}

export function buildScopedObjectKey(roomId: string, materialId: string, filename: string): string {
  const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return `rooms/${roomId}/materials/${materialId}/${safeFilename}`;
}

export async function generateUploadAuthorization(
  roomId: string,
  materialId: string,
  filename: string
): Promise<{ objectKey: string; uploadUrl: string; expiresAt: number }> {
  const objectKey = buildScopedObjectKey(roomId, materialId, filename);
  const expiresAt = Date.now() + 15 * 60 * 1000; // 15 minutes TTL

  // R2 Direct Presigned Authorization URL endpoint
  const uploadUrl = `/api/material/upload?key=${encodeURIComponent(objectKey)}&expires=${expiresAt}`;

  return {
    objectKey,
    uploadUrl,
    expiresAt,
  };
}
