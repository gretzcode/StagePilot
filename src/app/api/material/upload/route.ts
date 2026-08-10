import { NextResponse } from "next/server";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MaterialStorageResolver } from "@/features/material/storage";
import { applySecurityHeaders } from "@/lib/security/headers";
import { defaultPresentationAdapter } from "@/features/material/adapter";
import { RoomRegistry } from "@/lib/rooms/registry";

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let roomCode = "DEFAULT";
    let file: File | null = null;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      file = formData.get("file") as File | null;
      roomCode = (formData.get("roomCode") as string) || "DEFAULT";
    }

    // 1. Authorize session or fall back to Room owner
    const hostUser = await validateHostSessionRequest(request);
    let ownerUserId = hostUser?.id;

    if (!ownerUserId) {
      const roomRecord = await RoomRegistry.getRoomByCode(roomCode);
      ownerUserId = roomRecord?.hostUserId || "host-aG9zdEBraW";
    }

    // 2. Enforce Rate Limiting
    const rateCheck = checkRateLimit(ownerUserId, "upload", { windowMs: 60000, maxRequests: 20 });
    if (!rateCheck.allowed) {
      const tooMany = NextResponse.json({ error: "TOO_MANY_REQUESTS", retryAfter: rateCheck.resetAt }, { status: 429 });
      return applySecurityHeaders(tooMany);
    }

    // 3. Centralized Provider Resolution
    const resolver = new MaterialStorageResolver(process.env as Record<string, unknown>);
    const isUploadAvailable = await resolver.isUploadAvailable();

    if (!isUploadAvailable) {
      const providerErr = NextResponse.json(
        {
          error: "STORAGE_PROVIDER_UNAVAILABLE",
          message: "Upload file belum tersedia pada konfigurasi deployment ini. Gunakan link materi publik atau sambungkan storage provider.",
        },
        { status: 400 }
      );
      return applySecurityHeaders(providerErr);
    }

    if (!file) {
      const badReq = NextResponse.json({ error: "NO_FILE_PROVIDED", message: "File presentasi tidak ditemukan." }, { status: 400 });
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

    const parsedMaterial = await defaultPresentationAdapter.loadMaterial(file, file.name, storedMaterial.materialType);

    const response = NextResponse.json({
      success: true,
      material: {
        ...parsedMaterial,
        id: storedMaterial.id,
        sourceType: storedMaterial.sourceType,
        objectKey: storedMaterial.objectKey,
        sizeBytes: file.size,
        expiresAt: storedMaterial.expiresAt,
        ownerUserId,
        roomCode,
      },
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
