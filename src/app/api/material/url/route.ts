import { NextResponse } from "next/server";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MaterialStorageResolver } from "@/features/material/storage";
import { applySecurityHeaders } from "@/lib/security/headers";
import { defaultPresentationAdapter } from "@/features/material/adapter";
import { detectSlideCountFromUrl } from "@/features/material/validator";
import { RoomRegistry } from "@/lib/rooms/registry";
import { Material } from "@/core/types";

/**
 * Dispatch MATERIAL_ADD command to the room (Durable Object in production,
 * local in-memory fallback in development). This ensures materi baru yang
 * ditambahkan lewat URL langsung masuk ke state DO dan tidak hilang saat polling.
 */
async function dispatchMaterialAddCommand(
  request: Request,
  roomCode: string,
  deviceId: string,
  material: Material
): Promise<void> {
  try {
    const url = new URL(request.url);
    const wsUrl = new URL("/api/ws", url.origin);

    const command = {
      commandId: `material-add-${material.id}-${Date.now()}`,
      type: "MATERIAL_ADD",
      senderDeviceId: deviceId,
      payload: { material },
      timestamp: Date.now(),
    };

    await fetch(wsUrl.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: request.headers.get("cookie") || "",
        authorization: request.headers.get("authorization") || "",
      },
      body: JSON.stringify({
        roomCode: roomCode.toUpperCase(),
        deviceId,
        command,
      }),
    });
  } catch {
    // Non-fatal: material already persisted to registry; client will sync on next poll
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const urlString = typeof body.url === "string" ? body.url : "";
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "External Presentation";
    const roomCode = typeof body.roomCode === "string" ? body.roomCode : "DEFAULT";
    const upperRoomCode = roomCode.toUpperCase();

    // 1. Authorize session or fall back to Room owner
    const hostUser = await validateHostSessionRequest(request);
    let ownerUserId = hostUser?.id;

    if (!ownerUserId) {
      const roomRecord = await RoomRegistry.getRoomByCode(roomCode);
      ownerUserId = roomRecord?.hostUserId || "host-aG9zdEBraW";
    }

    // 2. Rate limiting
    const rateCheck = checkRateLimit(ownerUserId, "url_material", { windowMs: 60000, maxRequests: 30 });
    if (!rateCheck.allowed) {
      const tooMany = NextResponse.json({ error: "TOO_MANY_REQUESTS", retryAfter: rateCheck.resetAt }, { status: 429 });
      return applySecurityHeaders(tooMany);
    }

    // Dynamic slide count auto-detection from Google Slides / external link
    const detection = await detectSlideCountFromUrl(urlString);
    const slideCount = detection ? detection.totalPages : undefined;

    // 3. Delegate to MaterialStorageResolver ExternalUrlStorageProvider
    const resolver = new MaterialStorageResolver(process.env as Record<string, unknown>);
    const urlProvider = resolver.getUrlProvider();

    const storedMaterial = await urlProvider.registerExternalUrl({
      url: urlString,
      title,
      roomCode,
      ownerUserId,
    });

    const parsedMaterial = await defaultPresentationAdapter.loadMaterial(
      storedMaterial.externalUrl || urlString.trim(),
      storedMaterial.title,
      storedMaterial.materialType,
      slideCount
    );

    const assetUrl = `/api/material/asset?materialId=${storedMaterial.id}&roomCode=${encodeURIComponent(upperRoomCode)}`;
    const materialUrl = storedMaterial.materialType === "pdf" ? assetUrl : parsedMaterial.url;

    const newMaterial: Material = {
      ...parsedMaterial,
      id: storedMaterial.id,
      sourceType: storedMaterial.sourceType,
      objectKey: null,
      url: materialUrl,
      externalUrl: storedMaterial.externalUrl,
      expiresAt: storedMaterial.expiresAt,
      ownerUserId,
      roomCode: upperRoomCode,
      slides:
        storedMaterial.materialType === "pdf"
          ? Array.from({ length: slideCount || parsedMaterial.totalPages || 1 }, (_, index) => ({
              index: index + 1,
              title: `Page ${index + 1}`,
              contentUrl: assetUrl,
            }))
          : parsedMaterial.slides,
    };

    // 4. Dispatch MATERIAL_ADD to the room state (Durable Object in production,
    //    local in-memory in development). This is the single source of truth
    //    and ensures the material persists across polling cycles.
    const hostDeviceId = `dev-host-${ownerUserId.slice(-8)}`;
    await dispatchMaterialAddCommand(request, upperRoomCode, hostDeviceId, newMaterial);

    const response = NextResponse.json({
      success: true,
      material: newMaterial,
      record: storedMaterial,
    });

    return applySecurityHeaders(response);
  } catch (err: unknown) {
    const errorRes = NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menambahkan materi URL." },
      { status: 400 }
    );
    return applySecurityHeaders(errorRes);
  }
}
