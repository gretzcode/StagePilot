import { MaterialStorageProvider } from "../contract";
import {
  MaterialStorageProviderType,
  StorageCapabilities,
  ExternalMaterialInput,
  MaterialResolveInput,
  StoredMaterial,
  ResolvedMaterial,
} from "../provider-types";
import { validateExternalUrl, isPrivateNetworkUrl, normalizeEmbedUrl } from "../../validator";
import { MaterialRegistryService } from "@/lib/storage/registry";
import { computeDefaultExpiration, isMaterialExpired } from "@/core/config/material";
import { defaultPresentationAdapter } from "../../adapter";

export class ExternalUrlStorageProvider implements MaterialStorageProvider {
  readonly type: MaterialStorageProviderType = "external_url";
  readonly capabilities: StorageCapabilities = {
    upload: false,
    externalReference: true,
    delete: false,
    temporaryExpiration: true,
  };

  private env?: Record<string, unknown> | null;

  constructor(env?: Record<string, unknown> | null) {
    this.env = env;
  }

  async isAvailable(): Promise<boolean> {
    return true; // Always available, 100% free without Cloudflare billing
  }

  async registerExternalUrl(input: ExternalMaterialInput): Promise<StoredMaterial> {
    let trimmedUrl = input.url.trim();

    // 1. Defensive HTTPS & scheme validation
    const validation = validateExternalUrl(trimmedUrl);
    if (!validation.valid || !validation.sourceType || !validation.materialType) {
      throw new Error(validation.error || "Link materi tidak valid. Gunakan URL HTTPS yang lengkap.");
    }

    if (validation.materialType === "pdf") {
      throw new Error("Materi PDF eksternal harus diimpor melalui pipeline Google Drive.");
    }

    // 2. SSRF Protection: Reject private/local network IPs
    if (isPrivateNetworkUrl(trimmedUrl)) {
      throw new Error("Link materi dari jaringan privat atau localhost tidak diizinkan.");
    }

    // 3. Normalize Embed URL (Canva ?embed, Google Drive /preview, Google Slides /embed)
    trimmedUrl = normalizeEmbedUrl(trimmedUrl);

    const now = Date.now();
    const materialId = `mat-${validation.materialType}-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const expiresAt = computeDefaultExpiration(now);
    const title = input.title.trim() || "External Presentation";

    // 3. Load slide metadata via PresentationAdapter
    const initialSlideCount = input.slideCount && input.slideCount > 0 ? input.slideCount : undefined;
    const parsed = await defaultPresentationAdapter.loadMaterial(
      trimmedUrl,
      title,
      validation.materialType,
      initialSlideCount
    );

    const isCustomTitle = Boolean(input.title && input.title.trim() && input.title.trim() !== "External Presentation");
    const resolvedTitle = isCustomTitle ? input.title.trim() : (parsed.name || title);
    const effectiveSlideCount = initialSlideCount || parsed.totalPages || 1;

    // 4. Save metadata reference in D1 (NO binary copy stored in StagePilot)
    const registry = new MaterialRegistryService(this.env);
    const record = await registry.createMaterial({
      id: materialId,
      ownerUserId: input.ownerUserId,
      roomCode: input.roomCode,
      sourceType: validation.sourceType,
      materialType: validation.materialType,
      storageProvider: "external_url",
      storageReference: trimmedUrl,
      title: resolvedTitle,
      originalFileName: undefined,
      mimeType: "text/html",
      sizeBytes: 0,
      objectKey: null,
      externalUrl: trimmedUrl,
      slideCount: effectiveSlideCount,
      status: "ready",
      createdAt: now,
      expiresAt,
    });

    return {
      id: record.id,
      ownerUserId: record.ownerUserId,
      roomCode: record.roomCode || input.roomCode,
      sourceType: record.sourceType,
      materialType: record.materialType,
      storageProvider: "external_url",
      storageReference: trimmedUrl,
      title: record.title,
      originalFileName: record.originalFileName,
      mimeType: record.mimeType || "text/html",
      sizeBytes: record.sizeBytes,
      objectKey: null,
      externalUrl: trimmedUrl,
      slideCount: record.slideCount,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      status: record.status,
    };
  }

  async resolve(input: MaterialResolveInput): Promise<ResolvedMaterial> {
    const registry = new MaterialRegistryService(this.env);
    const record = await registry.getMaterialById(input.materialId);

    if (!record || record.status === "deleted") {
      throw new Error("Materi tidak ditemukan atau sudah dihapus.");
    }

    if (record.roomCode && input.roomCode && record.roomCode.toUpperCase() !== input.roomCode.toUpperCase()) {
      throw new Error("Akses materi ditolak untuk room ini.");
    }

    if (record.status === "expired" || isMaterialExpired(record.expiresAt)) {
      if (record.status !== "expired") {
        await registry.markExpired(input.materialId);
      }
      throw new Error("Materi tidak tersedia atau sudah kedaluwarsa.");
    }

    const sourceUrl = record.externalUrl || record.storageReference || "";
    const parsed = await defaultPresentationAdapter.loadMaterial(
      sourceUrl,
      record.title,
      record.materialType,
      record.slideCount
    );

    const totalPages = record.slideCount || parsed.totalPages || 1;
    const slides =
      parsed.slides && parsed.slides.length === totalPages
        ? parsed.slides
        : Array.from({ length: totalPages }, (_, i) => ({
            index: i + 1,
            title: `Page ${i + 1}`,
            url: sourceUrl,
          }));

    return {
      materialId: record.id,
      materialType: record.materialType,
      sourceUrl,
      provider: "external_url",
      title: record.title,
      totalPages,
      slides,
      expiresAt: record.expiresAt,
    };
  }
}
