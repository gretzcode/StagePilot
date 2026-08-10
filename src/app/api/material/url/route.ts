import { NextResponse } from "next/server";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MaterialStorageResolver } from "@/features/material/storage";
import { applySecurityHeaders } from "@/lib/security/headers";
import { defaultPresentationAdapter } from "@/features/material/adapter";
import { detectSlideCountFromUrl } from "@/features/material/validator";
import { RoomRegistry } from "@/lib/rooms/registry";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const urlString = typeof body.url === "string" ? body.url : "";
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "External Presentation";
    const roomCode = typeof body.roomCode === "string" ? body.roomCode : "DEFAULT";

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

    const response = NextResponse.json({
      success: true,
      material: {
        ...parsedMaterial,
        id: storedMaterial.id,
        sourceType: storedMaterial.sourceType,
        objectKey: null,
        externalUrl: storedMaterial.externalUrl,
        expiresAt: storedMaterial.expiresAt,
        ownerUserId,
        roomCode,
      },
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
