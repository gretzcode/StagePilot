import { MaterialRegistryService } from "@/lib/storage/registry";
import { getR2Object } from "@/lib/storage/r2";
import { isMaterialExpired } from "@/core/config/material";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const materialId = searchParams.get("materialId") || searchParams.get("id");
    const roomCode = searchParams.get("roomCode");

    if (!materialId) {
      return new Response("Material ID required", { status: 400 });
    }

    const registry = new MaterialRegistryService(process.env as Record<string, unknown>);
    const record = await registry.getMaterialById(materialId);

    if (!record || record.status === "deleted") {
      return new Response("Material not found", { status: 404 });
    }

    if (record.roomCode && roomCode && record.roomCode.toUpperCase() !== roomCode.toUpperCase()) {
      return new Response("Unauthorized room access", { status: 403 });
    }

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
      const provider = new GoogleDriveStorageProvider(process.env as Record<string, unknown>);
      const driveAsset = await provider.getFile(record.storageReference);
      return new Response(driveAsset.data as unknown as BodyInit, {
        status: 200,
        headers: {
          "Content-Type": driveAsset.mimeType || record.mimeType || "application/octet-stream",
          "Cache-Control": "private, max-age=3600",
        },
      });
    }

    if (!record.objectKey) {
      return new Response("No binary asset associated with this material.", { status: 404 });
    }

    const r2Asset = await getR2Object(process.env as Record<string, unknown>, record.objectKey);
    if (!r2Asset) {
      return new Response("Asset file not found in storage.", { status: 404 });
    }

    return new Response(r2Asset.data as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": r2Asset.mimeType || record.mimeType || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err: unknown) {
    return new Response(err instanceof Error ? err.message : "Asset serve error", { status: 500 });
  }
}
