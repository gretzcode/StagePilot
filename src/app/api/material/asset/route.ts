import { getCloudflareContext } from "@opennextjs/cloudflare";
import { getLocalRoomStateReadOnly } from "@/app/api/ws/route";
import { MaterialRegistryService } from "@/lib/storage/registry";
import { getR2Object } from "@/lib/storage/r2";
import { isMaterialExpired } from "@/core/config/material";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { StageSessionState, Material } from "@/core/types";

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

async function validateMaterialAssetAccess(request: Request, materialId: string, roomCode: string | null, deviceId: string | null) {
  if (!roomCode) {
    return { ok: false, response: new Response("Room code required", { status: 403 }) };
  }

  if (!deviceId) {
    return { ok: false, response: new Response("Device authorization required", { status: 403 }) };
  }

  const normalizedCode = roomCode.toUpperCase();
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
    device.role === "host" ||
    device.isHostDevice;

  if (!isApproved) {
    return { ok: false, response: new Response("Device is not approved for this room", { status: 403 }) };
  }

  const materialInRoom = state.materials.some((m: Material) => m.id === materialId);
  if (!materialInRoom) {
    return { ok: false, response: new Response("Material is not active in this room", { status: 403 }) };
  }

  return { ok: true };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get("materialId") || searchParams.get("id");
    const roomCode = searchParams.get("roomCode");
    const deviceId = searchParams.get("deviceId");

    if (!materialId) {
      return new Response("Material ID required", { status: 400 });
    }

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    const registry = new MaterialRegistryService(env);
    const record = await registry.getMaterialById(materialId);

    if (!record || record.status === "deleted") {
      return new Response("Material not found", { status: 404 });
    }

    if (!roomCode || (record.roomCode && record.roomCode.toUpperCase() !== roomCode.toUpperCase())) {
      return new Response("Unauthorized room access", { status: 403 });
    }

    const access = await validateMaterialAssetAccess(request, materialId, roomCode, deviceId);
    if (!access.ok) return access.response;

    if (record.status === "expired" || isMaterialExpired(record.expiresAt)) {
      if (record.status !== "expired") {
        await registry.markExpired(materialId);
      }
      return new Response("Materi tidak tersedia atau sudah kedaluwarsa.", { status: 410 });
    }

    if (record.storageProvider === "google_drive") {
      if (!record.storageReference) {
        return new Response("No Google Drive file associated with this material.", { status: 404 });
      }
      const provider = new GoogleDriveStorageProvider(env);
      const rangeHeader = request.headers.get("range");

      const driveAsset = await provider.getFile(record.storageReference, rangeHeader).catch(() => null);
      if (!driveAsset) {
        return new Response("Materi Google Drive tidak tersedia. Periksa koneksi storage atau unggah ulang materi.", { status: 502 });
      }

      const rawData = driveAsset.data;
      const totalLength = rawData.byteLength;
      const mimeType = driveAsset.mimeType || record.mimeType || "application/pdf";

      if (rangeHeader && (driveAsset.status === 206 || rangeHeader.startsWith("bytes="))) {
        if (driveAsset.contentRange) {
          return new Response(rawData as unknown as BodyInit, {
            status: 206,
            headers: {
              "Content-Type": mimeType,
              "Content-Range": driveAsset.contentRange,
              "Content-Length": String(totalLength),
              "Accept-Ranges": "bytes",
              "Cache-Control": "private, max-age=3600, immutable",
            },
          });
        }

        const parts = rangeHeader.replace("bytes=", "").split("-");
        const start = parseInt(parts[0], 10) || 0;
        const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

        if (start >= totalLength || end >= totalLength || start > end) {
          return new Response(null, {
            status: 416,
            headers: {
              "Content-Range": `bytes */${totalLength}`,
            },
          });
        }

        const chunk = rawData.slice(start, end + 1);
        return new Response(chunk as unknown as BodyInit, {
          status: 206,
          headers: {
            "Content-Type": mimeType,
            "Content-Range": `bytes ${start}-${end}/${totalLength}`,
            "Content-Length": String(chunk.byteLength),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=3600, immutable",
          },
        });
      }

      return new Response(rawData as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": mimeType,
          "Content-Length": String(totalLength),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600, immutable",
        },
      });
    }

    if (!record.objectKey) {
      return new Response("No binary asset associated with this material.", { status: 404 });
    }

    const r2Asset = await getR2Object(env, record.objectKey);
    if (!r2Asset) {
      return new Response("Asset file not found in storage.", { status: 404 });
    }

    const rawData = r2Asset.data;
    const totalLength = rawData.byteLength;
    const mimeType = r2Asset.mimeType || record.mimeType || "application/octet-stream";
    const rangeHeader = request.headers.get("range");

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace("bytes=", "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

      if (start >= totalLength || end >= totalLength || start > end) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${totalLength}`,
          },
        });
      }

      const chunk = rawData.slice(start, end + 1);
      return new Response(chunk as unknown as BodyInit, {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${end}/${totalLength}`,
          "Content-Length": String(chunk.byteLength),
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    return new Response(rawData as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(totalLength),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.message : "Asset serve error", { status: 500 });
  }
}
