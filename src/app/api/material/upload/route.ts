import { NextResponse } from "next/server";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { generateUploadAuthorization } from "@/lib/storage/r2";
import { applySecurityHeaders } from "@/lib/security/headers";

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB V1 limit

export async function POST(request: Request) {
  try {
    // 1. Authorize Host session
    const hostUser = await validateHostSessionRequest(request);
    if (!hostUser) {
      const unauth = NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
      return applySecurityHeaders(unauth);
    }

    // 2. Enforce Rate Limiting
    const rateCheck = checkRateLimit(hostUser.id, "upload", { windowMs: 60000, maxRequests: 15 });
    if (!rateCheck.allowed) {
      const tooMany = NextResponse.json({ error: "TOO_MANY_REQUESTS", retryAfter: rateCheck.resetAt }, { status: 429 });
      return applySecurityHeaders(tooMany);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const roomId = typeof body.roomId === "string" ? body.roomId : "default-room";
    const filename = typeof body.filename === "string" ? body.filename : "material.pdf";
    const fileSize = typeof body.fileSize === "number" ? body.fileSize : 0;

    if (fileSize > MAX_FILE_SIZE_BYTES) {
      const limitErr = NextResponse.json(
        { error: "FILE_TOO_LARGE", maxSizeBytes: MAX_FILE_SIZE_BYTES },
        { status: 400 }
      );
      return applySecurityHeaders(limitErr);
    }

    const materialId = `mat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const uploadAuth = await generateUploadAuthorization(roomId, materialId, filename);

    const response = NextResponse.json({
      success: true,
      materialId,
      objectKey: uploadAuth.objectKey,
      uploadUrl: uploadAuth.uploadUrl,
      expiresAt: uploadAuth.expiresAt,
    });

    return applySecurityHeaders(response);
  } catch (err: unknown) {
    const errorRes = NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload authorization failed" },
      { status: 500 }
    );
    return applySecurityHeaders(errorRes);
  }
}
