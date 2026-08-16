import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { validateHostSessionRequest } from "@/lib/auth/session";
import { applySecurityHeaders } from "@/lib/security/headers";
import { CanvaService } from "@/features/integrations/canva/canva.service";

export async function POST(request: Request) {
  const hostUser = await validateHostSessionRequest(request);
  if (!hostUser) {
    return applySecurityHeaders(
      NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 })
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    designId?: string;
    url?: string;
    roomCode?: string;
  };

  const target = body.designId || body.url;
  if (!target) {
    return applySecurityHeaders(
      NextResponse.json({ error: "CANVA_INVALID_REQUEST", message: "designId atau url diperlukan." }, { status: 400 })
    );
  }

  const cfCtx = await getCloudflareContext({ async: true }).catch(() => null);
  const env = (cfCtx?.env || process.env) as Record<string, unknown>;

  try {
    const material = await CanvaService.importDesignAsMaterial(
      hostUser.id,
      target,
      env,
      body.roomCode
    );

    // If roomCode is supplied and StageRoom binding is available, attach material to StageRoom
    if (body.roomCode && env.STAGE_ROOM) {
      try {
        const stageRoomNs = env.STAGE_ROOM as {
          idFromName: (name: string) => { toString: () => string };
          get: (id: { toString: () => string }) => { fetch: (req: Request) => Promise<Response> };
        };
        const doId = stageRoomNs.idFromName(body.roomCode.trim().toUpperCase());
        const stub = stageRoomNs.get(doId);
        await stub.fetch(
          new Request(`http://internal/command?roomCode=${encodeURIComponent(body.roomCode)}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              deviceId: hostUser.id,
              command: {
                type: "MATERIAL_ADD",
                commandId: `cmd-canva-import-${Date.now()}`,
                senderDeviceId: hostUser.id,
                timestamp: Date.now(),
                payload: { material },
              },
            }),
          })
        );
      } catch (err) {
        console.warn("[CanvaImport] Failed to attach material to StageRoom DO:", err);
      }
    }

    return applySecurityHeaders(
      NextResponse.json({
        success: true,
        material,
        totalSlides: material.totalPages,
      })
    );
  } catch (err: unknown) {
    const code = err instanceof Error ? err.message : "CANVA_IMPORT_FAILED";
    const userMessage =
      code === "CANVA_NOT_CONNECTED"
        ? "Akun Canva belum tersambung. Hubungkan akun Canva Anda terlebih dahulu di Dashboard."
        : code === "CANVA_ACCESS_DENIED"
        ? "Desain Canva tidak dapat diakses. Pastikan desain ini dibagikan atau dimiliki oleh akun Canva yang terhubung."
        : code === "CANVA_DESIGN_NOT_FOUND"
        ? "Desain Canva tidak ditemukan."
        : code === "CANVA_INVALID_URL"
        ? "URL Canva tidak valid. Masukkan link desain Canva yang benar."
        : "Gagal mengimpor presentasi Canva.";

    return applySecurityHeaders(
      NextResponse.json(
        {
          success: false,
          error: code,
          message: userMessage,
        },
        { status: 400 }
      )
    );
  }
}
