import { NextResponse } from "next/server";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MaterialStorageResolver } from "@/features/material/storage";
import { applySecurityHeaders } from "@/lib/security/headers";
import { RoomRegistry } from "@/lib/rooms/registry";
import { getLocalRoomStateReadOnly, registerLocalRoomMaterial } from "@/app/api/ws/route";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { Material, StageSessionState } from "@/core/types";
import { createAssetGrant } from "@/lib/auth/asset-grant";

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
      // Fall back to local state if DO query fails
    }
  }

  return getLocalRoomStateReadOnly(upperCode);
}

/**
 * Dispatch MATERIAL_ADD command to the room directly via Durable Object stub
 * or in-memory registry. This guarantees the uploaded material is immediately part
 * of the authoritative session state without risky loopback HTTP fetches.
 */
async function dispatchMaterialAddCommand(
  _request: Request,
  roomCode: string,
  deviceId: string,
  material: Material,
  env?: Record<string, unknown>
): Promise<void> {
  const upperCode = roomCode.toUpperCase();
  const command = {
    commandId: `material-add-${material.id}-${Date.now()}`,
    type: "MATERIAL_ADD" as const,
    senderDeviceId: deviceId,
    payload: { material },
    timestamp: Date.now(),
  };

  // 1. Direct Durable Object binding dispatch (Cloudflare Production)
  if (env && env.STAGE_ROOM) {
    try {
      const stageRoomNs = env.STAGE_ROOM as {
        idFromName: (name: string) => { toString: () => string };
        get: (id: unknown) => { fetch: (req: Request) => Promise<Response> };
      };
      const doId = stageRoomNs.idFromName(upperCode);
      const stub = stageRoomNs.get(doId);
      const doUrl = new URL("http://internal-stage-room/");
      doUrl.searchParams.set("roomCode", upperCode);
      doUrl.searchParams.set("deviceId", deviceId);
      await stub.fetch(
        new Request(doUrl.toString(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomCode: upperCode,
            deviceId,
            command,
          }),
        })
      );
      return;
    } catch (err) {
      console.warn("[dispatchMaterialAddCommand] DO direct dispatch warning:", err);
    }
  }

  // 2. Direct in-memory sync for development & test runtime
  registerLocalRoomMaterial(upperCode, material);
}

export async function POST(request: Request) {
  try {
    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    const contentType = request.headers.get("content-type") || "";
    let roomCode = "DEFAULT";
    let deviceId: string | null = null;
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      file = formData.get("file") as File | null;
      roomCode = (formData.get("roomCode") as string) || "DEFAULT";
      deviceId = (formData.get("deviceId") as string | null) || null;
    }

    // 1. Authorize host session or an approved room controller.
    const hostUser = await validateHostSessionRequest(request);
    const roomRecord = await RoomRegistry.getRoomByCode(roomCode);
    const ownerUserId = roomRecord?.hostUserId || hostUser?.id;

    if (!ownerUserId) {
      const unauth = NextResponse.json(
        { error: "UNAUTHORIZED", message: "Room tidak ditemukan atau sesi upload tidak valid." },
        { status: 401 }
      );
      return applySecurityHeaders(unauth);
    }

    if (hostUser && roomRecord && roomRecord.hostUserId !== hostUser.id) {
      const forbidden = NextResponse.json(
        { error: "ROOM_ACCESS_DENIED", message: "Room ini bukan milik Host yang sedang login." },
        { status: 403 }
      );
      return applySecurityHeaders(forbidden);
    }

    if (!hostUser) {
      const state = await getReadOnlyRoomState(request, roomCode);
      const device = deviceId && state?.devices ? state.devices[deviceId] : null;
      const canUpload =
        device?.approvalStatus === "approved" &&
        (device.role === "host" || device.role === "control" || device.isHostDevice);

      if (!canUpload) {
        const forbidden = NextResponse.json(
          { error: "DEVICE_NOT_APPROVED", message: "Hanya device control yang sudah di-approve yang dapat mengunggah file materi." },
          { status: 403 }
        );
        return applySecurityHeaders(forbidden);
      }
    }

    // 2. Enforce Rate Limiting
    const rateCheck = checkRateLimit(ownerUserId, "upload", { windowMs: 60000, maxRequests: 20 });
    if (!rateCheck.allowed) {
      const tooMany = NextResponse.json({ error: "TOO_MANY_REQUESTS", retryAfter: rateCheck.resetAt }, { status: 429 });
      return applySecurityHeaders(tooMany);
    }

    // 3. Centralized Provider Resolution
    const resolver = new MaterialStorageResolver(env);
    const isUploadAvailable = await resolver.isUploadAvailable();

    if (!isUploadAvailable) {
      const providerErr = NextResponse.json(
        {
          error: "STORAGE_PROVIDER_UNAVAILABLE",
          message:
            "Upload file belum tersedia pada konfigurasi deployment ini. Gunakan link materi publik atau sambungkan storage provider.",
        },
        { status: 400 }
      );
      return applySecurityHeaders(providerErr);
    }

    if (!file) {
      const badReq = NextResponse.json(
        { error: "NO_FILE_PROVIDED", message: "File presentasi tidak ditemukan." },
        { status: 400 }
      );
      return applySecurityHeaders(badReq);
    }

    const uploadProvider = await resolver.getUploadProvider();
    if (!uploadProvider.upload) {
      throw new Error("Upload provider tidak mendukung operasi pengunggahan berkas.");
    }
    const storedMaterial = await uploadProvider.upload({
      file,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      roomCode,
      ownerUserId,
    });

    const upperRoomCode = roomCode.toUpperCase();
    const grant = await createAssetGrant(upperRoomCode, storedMaterial.id, env);
    const assetUrl = `/api/material/asset?materialId=${storedMaterial.id}&roomCode=${encodeURIComponent(upperRoomCode)}&grant=${encodeURIComponent(grant)}`;
    const totalPages = storedMaterial.slideCount || 1;

    const newMaterial: Material = {
      id: storedMaterial.id,
      name: storedMaterial.title || file.name,
      type: storedMaterial.materialType,
      sourceType: storedMaterial.sourceType,
      url: assetUrl,
      objectKey: storedMaterial.objectKey,
      externalUrl: storedMaterial.externalUrl,
      sizeBytes: file.size,
      totalPages,
      slides: Array.from({ length: totalPages }, (_, index) => ({
        index: index + 1,
        title: `Slide ${index + 1}`,
        contentUrl: assetUrl,
      })),
      uploadedAt: storedMaterial.createdAt,
      expiresAt: storedMaterial.expiresAt,
      ownerUserId,
      roomCode: upperRoomCode,
      status: storedMaterial.status,
      metadata: {
        title: storedMaterial.title || file.name,
        pageCount: totalPages,
        fileSize: file.size,
        mimeType: storedMaterial.mimeType || file.type || "application/pdf",
        storageProvider: storedMaterial.storageProvider || "google_drive",
        storageReference: storedMaterial.storageReference || storedMaterial.objectKey || undefined,
      },
    };

    // 4. Dispatch MATERIAL_ADD to the room state (Durable Object in production,
    //    local in-memory in development). This is the single source of truth
    //    and ensures the material persists across polling cycles.
    const senderDeviceId = deviceId || `dev-host-${ownerUserId.slice(-8)}`;
    await dispatchMaterialAddCommand(request, upperRoomCode, senderDeviceId, newMaterial, env);

    const response = NextResponse.json({
      success: true,
      material: newMaterial,
      record: storedMaterial,
    });

    return applySecurityHeaders(response);
  } catch (err: unknown) {
    const errorRes = NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal mengunggah materi presentasi." },
      { status: 400 }
    );
    return applySecurityHeaders(errorRes);
  }
}
