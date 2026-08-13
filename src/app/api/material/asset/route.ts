import { MaterialRegistryService } from "@/lib/storage/registry";
import { getR2Object } from "@/lib/storage/r2";
import { isMaterialExpired } from "@/core/config/material";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { StageSessionState } from "@/core/types";

async function validateMaterialAssetAccess(request: Request, materialId: string, roomCode: string | null, deviceId: string | null) {
  if (!roomCode) {
    return { ok: false, response: new Response("Room code required", { status: 403 }) };
  }

  if (!deviceId) {
    return { ok: false, response: new Response("Device authorization required", { status: 403 }) };
  }

  const url = new URL(request.url);
  const normalizedCode = roomCode.toUpperCase();
  const stateUrl = new URL("/api/ws", url.origin);
  stateUrl.searchParams.set("roomCode", normalizedCode);
  stateUrl.searchParams.set("deviceId", deviceId);
  stateUrl.searchParams.set("role", "control");
  stateUrl.searchParams.set("deviceName", "Material Asset Reader");

  const stateResponse = await fetch(stateUrl.toString(), {
    headers: {
      cookie: request.headers.get("cookie") || "",
      authorization: request.headers.get("authorization") || "",
    },
  }).catch(() => null);

  if (!stateResponse?.ok) {
    return { ok: false, response: new Response("Room access denied", { status: 403 }) };
  }

  const sync = (await stateResponse.json().catch(() => null)) as { state?: StageSessionState } | null;
  const state = sync?.state;
  const device = state?.devices?.[deviceId];

  const isApproved =
    device?.approvalStatus === "approved" ||
    device?.role === "host" ||
    device?.role === "control" ||
    device?.isHostDevice;

  if (!state || !device || !isApproved) {
    return { ok: false, response: new Response("Device is not approved for this room", { status: 403 }) };
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

    const registry = new MaterialRegistryService(process.env as Record<string, unknown>);
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
      const provider = new GoogleDriveStorageProvider(process.env as Record<string, unknown>);

      // PPTX files: use Google Drive's server-side PDF export so that
      // PdfSlideViewer can render slides without any client-side PPTX library.
      if (record.materialType === "pptx") {
        const pdfAsset = await provider.getFileAsPdf(record.storageReference).catch(() => null);
        if (!pdfAsset) {
          return new Response(
            "Konversi PPTX ke PDF gagal. Periksa koneksi storage Google Drive atau unggah ulang materi.",
            { status: 502 }
          );
        }
        return new Response(pdfAsset.data as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Cache-Control": "private, max-age=3600",
          },
        });
      }

      const driveAsset = await provider.getFile(record.storageReference).catch(() => null);
      if (!driveAsset) {
        return new Response("Materi Google Drive tidak tersedia. Periksa koneksi storage atau unggah ulang materi.", { status: 502 });
      }
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
