import { NextResponse } from "next/server";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { MaterialStorageResolver } from "@/features/material/storage";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function POST(request: Request) {
  try {
    const hostUser = await validateHostSessionRequest(request);
    if (!hostUser) {
      const unauth = NextResponse.json({ error: "UNAUTHORIZED", message: "Hanya Host yang diizinkan menghapus materi." }, { status: 401 });
      return applySecurityHeaders(unauth);
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const materialId = typeof body.materialId === "string" ? body.materialId.trim() : "";

    if (!materialId) {
      const badRes = NextResponse.json({ error: "Missing materialId" }, { status: 400 });
      return applySecurityHeaders(badRes);
    }

    const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
    const env = (cfCtx?.env || process.env) as Record<string, unknown>;

    const resolver = new MaterialStorageResolver(env);
    const provider = await resolver.getProviderForMaterial(materialId);
    if (provider.delete) {
      await provider.delete({ materialId, ownerUserId: hostUser.id });
    } else {
      const registry = new (await import("@/lib/storage/registry")).MaterialRegistryService(env);
      await registry.deleteMaterial(materialId);
    }

    const response = NextResponse.json({
      success: true,
      materialId,
      message: "Material permanently deleted from database",
    });

    return applySecurityHeaders(response);
  } catch (err: unknown) {
    const errorRes = NextResponse.json(
      { error: err instanceof Error ? err.message : "Gagal menghapus materi dari database." },
      { status: 500 }
    );
    return applySecurityHeaders(errorRes);
  }
}

export async function DELETE(request: Request) {
  return POST(request);
}
