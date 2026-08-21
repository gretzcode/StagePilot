import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { MaterialStorageResolver } from "@/features/material/storage";
import { applySecurityHeaders } from "@/lib/security/headers";
import { defaultPresentationAdapter } from "@/features/material/adapter";
import { detectSlideCountFromUrl, resolvePdfFilename } from "@/features/material/validator";
import { RoomRegistry } from "@/lib/rooms/registry";
import { Material } from "@/core/types";
import { computeDefaultExpiration } from "@/core/config/material";
import { CanvaService } from "@/features/integrations/canva/canva.service";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { registerLocalRoomMaterial } from "@/app/api/ws/route";
import { createAssetGrant } from "@/lib/auth/asset-grant";

/**
 * Dispatch MATERIAL_ADD command to the room directly via Durable Object stub
 * or in-memory registry. This guarantees the material is immediately part
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

    // 2.5 Canva Connect Authenticated Export Pipeline with Public Embed Fallback
    const isCanva =
      urlString.includes("canva.com") ||
      urlString.includes("canva.me") ||
      urlString.includes("canva.link");
    if (isCanva) {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const env = (cfCtx?.env || process.env) as Record<string, unknown>;

      let canvaMaterial: Material | null = null;
      const canvaStatus = await CanvaService.getConnectionStatus(ownerUserId, env);

      if (canvaStatus.connected) {
        try {
          canvaMaterial = await CanvaService.importDesignAsMaterial(ownerUserId, urlString, env, upperRoomCode);
        } catch (err: unknown) {
          console.warn("[CanvaImport] Connect API export unavailable for this link, falling back to Public Embed:", err);
        }
      }

      // If Canva OAuth is not connected OR the design is an external/public view-only link:
      // Gracefully fall back to Canva Responsive Embed Player
      if (!canvaMaterial) {
        let embedUrl = urlString;
        try {
          const parsed = new URL(urlString);
          if (!parsed.searchParams.has("embed")) {
            parsed.searchParams.set("embed", "");
          }
          embedUrl = parsed.toString();
        } catch {
          embedUrl = `${urlString}${urlString.includes("?") ? "&" : "?"}embed`;
        }

        const now = Date.now();
        const designIdMatch = urlString.match(/\/design\/([A-Za-z0-9_-]+)/);
        const designId = designIdMatch ? designIdMatch[1] : "canva";
        const title = `Canva Presentation ${designId}`;

        canvaMaterial = {
          id: `mat-canva-embed-${designId}-${now}`,
          name: title,
          type: "canva",
          sourceType: "CANVA_LINK",
          url: embedUrl,
          externalUrl: urlString,
          objectKey: null,
          sizeBytes: 0,
          totalPages: 1,
          slides: [{ index: 1, title: `${title} — Slide 1`, url: embedUrl, contentUrl: embedUrl }],
          uploadedAt: now,
          expiresAt: computeDefaultExpiration(now),
          ownerUserId,
          roomCode: upperRoomCode,
          status: "ready",
          metadata: {
            title,
            pageCount: 1,
          },
        };
      }

      const hostDeviceId = `dev-host-${ownerUserId.slice(-8)}`;
      await dispatchMaterialAddCommand(request, upperRoomCode, hostDeviceId, canvaMaterial);

      return applySecurityHeaders(
        NextResponse.json({
          success: true,
          material: canvaMaterial,
          totalSlides: canvaMaterial.totalPages,
        })
      );
    }

    // 2.6 Canonical Google Drive PDF Ingestion Pipeline
    const isGoogleDrivePdf =
      urlString.includes("drive.google.com") ||
      (urlString.includes("docs.google.com") && !urlString.includes("/presentation/d/"));
    const isDirectPdf =
      urlString.toLowerCase().endsWith(".pdf") ||
      urlString.toLowerCase().includes(".pdf?") ||
      urlString.toLowerCase().includes(".pdf#");

    if (isGoogleDrivePdf || isDirectPdf) {
      const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
      const env = (cfCtx?.env || process.env) as Record<string, unknown>;
      const googleProvider = new GoogleDriveStorageProvider(env);

      if (!(await googleProvider.isAvailable())) {
        return applySecurityHeaders(
          NextResponse.json(
            {
              error: "GOOGLE_DRIVE_NOT_CONNECTED",
              message:
                "Akun Google Drive belum tersambung. Sambungkan akun Google Drive Anda di Dashboard terlebih dahulu agar materi PDF dapat diimpor dan disinkronkan ke semua layar.",
            },
            { status: 400 }
          )
        );
      }

      let pdfArrayBuffer: ArrayBuffer | null = null;
      let contentDispositionHeader: string | null = null;
      let driveMetadataName: string | null = null;

      if (isGoogleDrivePdf) {
        const match =
          urlString.match(/\/file\/d\/([A-Za-z0-9_-]+)/) ||
          urlString.match(/[?&]id=([A-Za-z0-9_-]+)/);
        const fileId = match ? match[1] : null;

        if (!fileId) {
          return applySecurityHeaders(
            NextResponse.json(
              { error: "PDF_URL_INVALID", message: "Link Google Drive tidak valid." },
              { status: 400 }
            )
          );
        }

        // Try getting Google Drive metadata to extract the real filename
        const meta = await googleProvider.getFileMetadata(fileId).catch(() => null);
        if (meta?.name) {
          driveMetadataName = meta.name;
        }

        try {
          const driveAsset = await googleProvider.getFile(fileId);
          pdfArrayBuffer = driveAsset.data;
        } catch {
          const probeUrls = [
            `https://drive.google.com/uc?id=${fileId}&export=download`,
            `https://docs.google.com/uc?id=${fileId}&export=download`,
            `https://drive.usercontent.google.com/download?id=${fileId}&export=download`,
          ];

          for (const probeUrl of probeUrls) {
            try {
              const res = await fetch(probeUrl, {
                headers: {
                  "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                  Accept: "application/pdf,*/*",
                },
              });
              if (res.ok) {
                const buf = await res.arrayBuffer();
                const head = new TextDecoder("ascii").decode(new Uint8Array(buf.slice(0, 1024)));
                if (head.includes("%PDF-")) {
                  pdfArrayBuffer = buf;
                  const cd = res.headers.get("content-disposition");
                  if (cd && !driveMetadataName) contentDispositionHeader = cd;
                  break;
                }
              }
            } catch {
              // Try next probe URL
            }
          }
        }

        if (!pdfArrayBuffer) {
          return applySecurityHeaders(
            NextResponse.json(
              {
                error: "PDF_DOWNLOAD_FAILED",
                message:
                  "Gagal mengunduh file PDF dari Google Drive. Pastikan file dapat diakses publik atau tersambung dengan akun Google Drive yang tepat.",
              },
              { status: 400 }
            )
          );
        }
      } else {
        // Direct External PDF URL Ingestion
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        let res: Response;

        try {
          res = await fetch(urlString, {
            signal: controller.signal,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              Accept: "application/pdf,*/*",
            },
          });
        } catch (fetchErr: unknown) {
          clearTimeout(timeout);
          return applySecurityHeaders(
            NextResponse.json(
              {
                error: "PDF_DOWNLOAD_FAILED",
                message: `Gagal mengunduh file PDF: ${fetchErr instanceof Error ? fetchErr.message : "Koneksi terputus atau timeout."}`,
              },
              { status: 400 }
            )
          );
        }
        clearTimeout(timeout);

        if (!res.ok) {
          return applySecurityHeaders(
            NextResponse.json(
              {
                error: "PDF_DOWNLOAD_FAILED",
                message: `Server eksternal mengembalikan status ${res.status}. File PDF tidak dapat diunduh.`,
              },
              { status: 400 }
            )
          );
        }

        contentDispositionHeader = res.headers.get("content-disposition");

        pdfArrayBuffer = await res.arrayBuffer();
        if (pdfArrayBuffer.byteLength < 4) {
          return applySecurityHeaders(
            NextResponse.json(
              {
                error: "PDF_NOT_A_PDF",
                message: "File yang diunduh kosong atau rusak.",
              },
              { status: 400 }
            )
          );
        }

        const header = new TextDecoder("ascii").decode(new Uint8Array(pdfArrayBuffer.slice(0, 1024)));
        if (!header.includes("%PDF-")) {
          return applySecurityHeaders(
            NextResponse.json(
              {
                error: "PDF_NOT_A_PDF",
                message: "Tautan tersebut tidak mengembalikan file PDF yang valid (terdeteksi format non-PDF / HTML).",
              },
              { status: 400 }
            )
          );
        }
      }

      // Determine deterministic, clean filename
      const fileName = resolvePdfFilename({
        contentDisposition: contentDispositionHeader,
        googleDriveName: driveMetadataName,
        url: urlString,
        userTitle: title,
      });

      // Upload PDF bytes to Google Drive room folder
      const pdfBlob = new Blob([pdfArrayBuffer], { type: "application/pdf" });
      const storedMaterial = await googleProvider.upload({
        file: pdfBlob,
        fileName,
        mimeType: "application/pdf",
        sizeBytes: pdfBlob.size,
        roomCode: upperRoomCode,
        ownerUserId,
      });

      const grant = await createAssetGrant(upperRoomCode, storedMaterial.id, env);
      const assetUrl = `/api/material/asset?materialId=${storedMaterial.id}&roomCode=${encodeURIComponent(upperRoomCode)}&grant=${encodeURIComponent(grant)}`;
      const finalTotalPages = storedMaterial.slideCount || 1;

      const canonicalPdfMaterial: Material = {
        id: storedMaterial.id,
        name: storedMaterial.title,
        type: "pdf",
        sourceType: "UPLOADED_FILE",
        objectKey: null,
        url: assetUrl,
        externalUrl: urlString,
        expiresAt: storedMaterial.expiresAt,
        ownerUserId,
        roomCode: upperRoomCode,
        totalPages: finalTotalPages,
        slides: Array.from({ length: finalTotalPages }, (_, index) => ({
          index: index + 1,
          title: `Page ${index + 1}`,
          contentUrl: assetUrl,
        })),
        uploadedAt: storedMaterial.createdAt,
        status: "ready",
      };

      const hostDeviceId = `dev-host-${ownerUserId.slice(-8)}`;
      await dispatchMaterialAddCommand(request, upperRoomCode, hostDeviceId, canonicalPdfMaterial, env);

      const response = NextResponse.json({
        success: true,
        material: canonicalPdfMaterial,
        record: storedMaterial,
        totalSlides: finalTotalPages,
      });

      return applySecurityHeaders(response);
    }

    // Dynamic slide count auto-detection from Google Slides
    const detection = await detectSlideCountFromUrl(urlString);
    const slideCount = detection ? detection.totalPages : undefined;

    // 3. Delegate to MaterialStorageResolver ExternalUrlStorageProvider (for video, Google Slides, web pages)
    const resolver = new MaterialStorageResolver(env);
    const urlProvider = resolver.getUrlProvider();

    const storedMaterial = await urlProvider.registerExternalUrl({
      url: urlString,
      title,
      roomCode,
      ownerUserId,
      slideCount,
    });

    const parsedMaterial = await defaultPresentationAdapter.loadMaterial(
      storedMaterial.externalUrl || urlString.trim(),
      storedMaterial.title,
      storedMaterial.materialType,
      slideCount || storedMaterial.slideCount
    );

    const extGrant = await createAssetGrant(upperRoomCode, storedMaterial.id, env);
    const assetUrl = `/api/material/asset?materialId=${storedMaterial.id}&roomCode=${encodeURIComponent(upperRoomCode)}&grant=${encodeURIComponent(extGrant)}`;
    const materialUrl = storedMaterial.materialType === "pdf" ? assetUrl : parsedMaterial.url;
    const finalTotalPages = slideCount || storedMaterial.slideCount || parsedMaterial.totalPages || 1;

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
      totalPages: finalTotalPages,
      slides:
        storedMaterial.materialType === "pdf"
          ? Array.from({ length: finalTotalPages }, (_, index) => ({
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
    await dispatchMaterialAddCommand(request, upperRoomCode, hostDeviceId, newMaterial, env);

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
