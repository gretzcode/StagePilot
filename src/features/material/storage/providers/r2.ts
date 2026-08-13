import { MaterialStorageProvider } from "../contract";
import {
  MaterialStorageProviderType,
  StorageCapabilities,
  MaterialUploadInput,
  ExternalMaterialInput,
  MaterialResolveInput,
  MaterialDeleteInput,
  StoredMaterial,
  ResolvedMaterial,
} from "../provider-types";
import { validateUploadedFile } from "../../validator";
import { estimatePdfPageCountFromBlob } from "../../pdf-page-count";
import { buildMaterialObjectKey, putR2Object, deleteR2Object } from "@/lib/storage/r2";
import { MaterialRegistryService } from "@/lib/storage/registry";
import { computeDefaultExpiration, isMaterialExpired } from "@/core/config/material";

export class R2StorageProvider implements MaterialStorageProvider {
  readonly type: MaterialStorageProviderType = "r2";
  readonly capabilities: StorageCapabilities = {
    upload: true,
    externalReference: false,
    delete: true,
    temporaryExpiration: true,
  };

  private env?: Record<string, unknown> | null;

  constructor(env?: Record<string, unknown> | null) {
    this.env = env;
  }

  async isAvailable(): Promise<boolean> {
    if (!this.env) return false;
    const bucket = this.env.MATERIALS_BUCKET as { put?: unknown } | undefined;
    return typeof bucket?.put === "function";
  }

  async upload(input: MaterialUploadInput): Promise<StoredMaterial> {
    const available = await this.isAvailable();
    if (!available) {
      throw new Error(
        "Upload file belum tersedia pada konfigurasi deployment ini. Gunakan link materi publik atau sambungkan storage provider."
      );
    }

    const validation = validateUploadedFile(input.fileName, input.mimeType, input.sizeBytes);
    if (!validation.valid || !validation.materialType) {
      throw new Error(validation.error || "Format file belum didukung.");
    }

    const now = Date.now();
    const materialId = `mat-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const objectKey = buildMaterialObjectKey(materialId, input.fileName);
    const expiresAt = computeDefaultExpiration(now);

    const fileBuffer =
      input.file instanceof Blob
        ? new Uint8Array(await input.file.arrayBuffer())
        : new Uint8Array(await (input.file as File).arrayBuffer());

    await putR2Object(this.env, objectKey, fileBuffer, validation.mimeType || input.mimeType, expiresAt);

    const slideCount =
      validation.materialType === "pdf"
        ? (await estimatePdfPageCountFromBlob(input.file)) || 1
        : 1;

    const registry = new MaterialRegistryService(this.env);
    const record = await registry.createMaterial({
      id: materialId,
      ownerUserId: input.ownerUserId,
      roomCode: input.roomCode,
      sourceType: "UPLOADED_FILE",
      materialType: validation.materialType,
      storageProvider: "r2",
      storageReference: objectKey,
      title: input.fileName,
      originalFileName: input.fileName,
      mimeType: validation.mimeType || input.mimeType,
      sizeBytes: input.sizeBytes,
      objectKey,
      externalUrl: null,
      slideCount,
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
      storageProvider: "r2",
      storageReference: objectKey,
      title: record.title,
      originalFileName: record.originalFileName,
      mimeType: record.mimeType || input.mimeType || "application/octet-stream",
      sizeBytes: record.sizeBytes,
      objectKey,
      externalUrl: null,
      slideCount: record.slideCount,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      status: record.status,
    };
  }

  async registerExternalUrl(_input: ExternalMaterialInput): Promise<StoredMaterial> {
    throw new Error("R2StorageProvider tidak menangani registrasi link eksternal langsung.");
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

    const assetUrl = `/api/material/asset?materialId=${record.id}`;

    return {
      materialId: record.id,
      materialType: record.materialType,
      sourceUrl: assetUrl,
      provider: "r2",
      title: record.title,
      totalPages: record.slideCount || 1,
      slides: Array.from({ length: record.slideCount || 1 }, (_, i) => ({
        index: i + 1,
        title: `Slide ${i + 1}`,
        contentUrl: assetUrl,
      })),
      expiresAt: record.expiresAt,
    };
  }

  async delete(input: MaterialDeleteInput): Promise<void> {
    const registry = new MaterialRegistryService(this.env);
    const record = await registry.getMaterialById(input.materialId);

    if (record?.objectKey) {
      await deleteR2Object(this.env, record.objectKey);
    }
    await registry.deleteMaterial(input.materialId);
  }
}
