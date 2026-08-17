import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getLocalRoomStateReadOnly } from "@/app/api/ws/route";
import { MaterialRegistryService, MaterialRecord } from "@/lib/storage/registry";

import { isMaterialExpired } from "@/core/config/material";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { StageSessionState, Material } from "@/core/types";
import { verifyAssetGrant } from "@/lib/auth/asset-grant";

interface EdgeCacheType {
  match: (req: Request | string) => Promise<Response | undefined>;
  put: (req: Request | string, res: Response) => Promise<void>;
}

// ─── Layer 2: In-Memory Metadata & Validation Memoization ────────────────────
interface CachedMaterialMeta {
  record: MaterialRecord;
  cachedAt: number;
}
const materialMetadataCache = new Map<string, CachedMaterialMeta>();
const METADATA_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateMaterialMetadataCache(materialId?: string): void {
  if (materialId) {
    materialMetadataCache.delete(materialId);
  } else {
    materialMetadataCache.clear();
  }
}

interface CachedDeviceAccess {
  valid: boolean;
  cachedAt: number;
}
const deviceAccessValidationCache = new Map<string, CachedDeviceAccess>();
const DEVICE_VALIDATION_TTL_MS = 60 * 1000; // 60 seconds

async function getReadOnlyRoomState(request: Request, roomCode: string): Promise<StageSessionState | null> {
  const upperCode = roomCode.toUpperCase();

  if (process.env.NODE_ENV === "production") {
    try {
      let env: Record<string, unknown> | undefined;
      try {
        const cfCtx = await getCloudflareContext({ async: true });
        env = cfCtx.env as Record<string, unknown>;
      } catch {
        env = process.env as Record<string, unknown>;
      }

      if (env && env.STAGE_ROOM) {
        const stageRoomNs = env.STAGE_ROOM as {
          idFromName: (name: string) => { toString: () => string };
          get: (id: unknown) => { fetch: (req: Request) => Promise<Response> };
        };
        const doId = stageRoomNs.idFromName(upperCode);
        const stub = stageRoomNs.get(doId);
        const doUrl = new URL(request.url);
        doUrl.pathname = "/";
        doUrl.searchParams.set("roomCode", upperCode);
        doUrl.searchParams.set("action", "readonly_state");

        const res = await stub.fetch(new Request(doUrl.toString(), { method: "GET" }));
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as { state?: StageSessionState } | null;
          return data?.state || null;
        }
      }
    } catch {
      // Fallback to local state if DO query fails
    }
  }

  return getLocalRoomStateReadOnly(upperCode);
}

async function validateMaterialAssetAccess(
  request: Request,
  materialId: string,
  roomCode: string | null,
  deviceId: string | null
) {
  if (!roomCode) {
    return { ok: false, response: new Response("Room code required", { status: 403 }) };
  }

  if (!deviceId) {
    return { ok: false, response: new Response("Device authorization required", { status: 403 }) };
  }

  const normalizedCode = roomCode.toUpperCase();
  const cacheKey = `${normalizedCode}:${materialId}:${deviceId}`;
  const now = Date.now();

  const cached = deviceAccessValidationCache.get(cacheKey);
  if (cached && now - cached.cachedAt < DEVICE_VALIDATION_TTL_MS) {
    if (cached.valid) return { ok: true };
  }

  const state = await getReadOnlyRoomState(request, normalizedCode);
  if (!state) {
    return { ok: false, response: new Response("Room access denied", { status: 403 }) };
  }

  const device = state.devices?.[deviceId];
  if (!device) {
    return { ok: false, response: new Response("Device authorization required", { status: 403 }) };
  }

  const isApproved =
    device.approvalStatus === "approved" ||
    device.approvalStatus === "connected" ||
    device.role === "host" ||
    device.role === "audience" ||
    device.role === "confidence" ||
    device.isHostDevice;

  if (!isApproved) {
    return { ok: false, response: new Response("Device is not approved for this room", { status: 403 }) };
  }

  const materialInRoom = state.materials.some((m: Material) => m.id === materialId);
  if (!materialInRoom) {
    return { ok: false, response: new Response("Material is not active in this room", { status: 403 }) };
  }

  deviceAccessValidationCache.set(cacheKey, { valid: true, cachedAt: now });
  return { ok: true };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get("materialId") || searchParams.get("id");
    const roomCode = searchParams.get("roomCode");
    const deviceId = searchParams.get("deviceId");
    const rangeHeader = request.headers.get("range");

    if (!materialId) {
      return new Response("Material ID required", { status: 400 });
    }

    // ─── Layer 1: Cloudflare Edge Cache (caches.default) ────────────────────
    let edgeCache: EdgeCacheType | null = null;

    try {
      const globalCaches = (globalThis as unknown as { caches?: { default?: EdgeCacheType } }).caches;
      if (globalCaches?.default && !rangeHeader) {
        edgeCache = globalCaches.default;
        const cachedRes = await edgeCache.match(request.url);
        if (cachedRes) {
          const newHeaders = new Headers(cachedRes.headers);
          newHeaders.set("X-Cache-Status", "HIT");
          return new Response(cachedRes.body, {
            status: cachedRes.status,
            statusText: cachedRes.statusText,
            headers: newHeaders,
          });
        }
      }
    } catch {
      // Non-fatal cache lookup failure
    }

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    // ─── Layer 2: In-Memory Metadata Cache ──────────────────────────────────
    const now = Date.now();
    let record: MaterialRecord | null = null;
    const cachedMeta = materialMetadataCache.get(materialId);

    if (cachedMeta && now - cachedMeta.cachedAt < METADATA_TTL_MS) {
      record = cachedMeta.record;
    } else {
      const registry = new MaterialRegistryService(env);
      record = await registry.getMaterialById(materialId);

      if (!record || record.status === "deleted") {
        // Fallback: check authoritative StageRoom session state if roomCode is available
        if (roomCode) {
          const state = await getReadOnlyRoomState(request, roomCode);
          const mat = state?.materials?.find((m: Material) => m.id === materialId);
          if (mat) {
            record = {
              id: mat.id,
              ownerUserId: mat.ownerUserId || state?.host?.hostUserId || "host",
              roomCode: roomCode.toUpperCase(),
              sourceType: mat.sourceType || "UPLOADED_FILE",
              materialType: mat.type,
              storageProvider:
                (mat.metadata?.storageProvider as "google_drive" | "r2") ||
                (mat.type === "pdf" ? "google_drive" : "external_url"),
              storageReference:
                mat.metadata?.storageReference || mat.objectKey || mat.externalUrl || undefined,
              title: mat.name,
              mimeType:
                mat.metadata?.mimeType ||
                (mat.type === "pdf" ? "application/pdf" : "application/octet-stream"),
              sizeBytes: mat.metadata?.fileSize || 0,
              objectKey: mat.objectKey,
              externalUrl: mat.externalUrl,
              slideCount: mat.totalPages || 1,
              status: "ready",
              createdAt: mat.uploadedAt || now,
              expiresAt: mat.expiresAt || now + 3600000,
            };
          }
        }
      }

      if (record && record.status !== "deleted") {
        materialMetadataCache.set(materialId, { record, cachedAt: now });
      }
    }

    if (!record || record.status === "deleted") {
      return new Response("Material not found", { status: 404 });
    }

    if (!roomCode || (record.roomCode && record.roomCode.toUpperCase() !== roomCode.toUpperCase())) {
      return new Response("Unauthorized room access", { status: 403 });
    }

    const grant = searchParams.get("grant") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    if (grant) {
      const grantResult = await verifyAssetGrant(grant, roomCode, materialId, env);
      if (!grantResult.valid) {
        return new Response(`Unauthorized asset grant: ${grantResult.reason || "INVALID"}`, { status: 403 });
      }
    } else {
      const access = await validateMaterialAssetAccess(request, materialId, roomCode, deviceId);
      if (!access.ok) return access.response;
    }

    if (record.status === "expired" || isMaterialExpired(record.expiresAt)) {
      if (record.status !== "expired") {
        const registry = new MaterialRegistryService(env);
        await registry.markExpired(materialId).catch(() => {});
        materialMetadataCache.delete(materialId);
      }
      return new Response("Materi tidak tersedia atau sudah kedaluwarsa.", { status: 410 });
    }

    if (record.storageProvider === "google_drive") {
      if (!record.storageReference) {
        return new Response("No Google Drive file associated with this material.", { status: 404 });
      }

      const provider = new GoogleDriveStorageProvider(env);
      const driveStream = await provider.getFileStream(record.storageReference, rangeHeader).catch(() => null);

      if (!driveStream || !driveStream.body) {
        return new Response(
          "Materi Google Drive tidak tersedia. Periksa koneksi storage atau unggah ulang materi.",
          { status: 502 }
        );
      }

      const responseHeaders = new Headers();
      const mimeType = driveStream.mimeType || record.mimeType || "application/pdf";
      responseHeaders.set("Content-Type", mimeType);
      responseHeaders.set("Accept-Ranges", driveStream.acceptRanges || "bytes");
      responseHeaders.set("Cache-Control", "public, max-age=3600, s-maxage=3600, immutable");
      responseHeaders.set("Vary", "Range, Accept-Encoding");

      if (driveStream.contentRange) {
        responseHeaders.set("Content-Range", driveStream.contentRange);
      }
      if (driveStream.contentLength) {
        responseHeaders.set("Content-Length", driveStream.contentLength);
      }

      return new Response(driveStream.body, {
        status: driveStream.status,
        headers: responseHeaders,
      });
    }

    // Non-Google-Drive materials: storage not available (R2 not configured)
    return new Response("Material storage tidak tersedia.", { status: 404 });
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.message : "Asset serve error", { status: 500 });
  }
}
