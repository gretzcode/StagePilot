import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { MaterialStorageResolver } from "@/features/material/storage";
import { applySecurityHeaders } from "@/lib/security/headers";

export async function GET(request: Request) {
  try {
    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get("materialId") || searchParams.get("id");
    const roomCode = searchParams.get("roomCode");

    if (!materialId) {
      const badReq = NextResponse.json({ error: "MISSING_MATERIAL_ID", message: "Material ID wajib diisi." }, { status: 400 });
      return applySecurityHeaders(badReq);
    }

    const resolver = new MaterialStorageResolver(env);
    const provider = await resolver.getProviderForMaterial(materialId);
    const resolved = await provider.resolve({ materialId, roomCode: roomCode || undefined });

    const response = NextResponse.json({
      success: true,
      material: {
        id: resolved.materialId,
        name: resolved.title,
        type: resolved.materialType,
        url: resolved.sourceUrl,
        totalPages: resolved.totalPages,
        slides: resolved.slides,
        expiresAt: resolved.expiresAt,
        status: "ready",
      },
    });

    return applySecurityHeaders(response);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Gagal memuat materi.";
    let status = 400;
    if (message.includes("kedaluwarsa")) status = 410;
    else if (message.includes("ditolak")) status = 403;
    else if (message.includes("tidak ditemukan")) status = 404;

    const errorRes = NextResponse.json({ error: "MATERIAL_RESOLVE_ERROR", message }, { status });
    return applySecurityHeaders(errorRes);
  }
}
