import { MaterialStorageProvider } from "../contract";
import {
  ExternalMaterialInput,
  MaterialDeleteInput,
  MaterialResolveInput,
  MaterialStorageProviderType,
  MaterialUploadInput,
  ResolvedMaterial,
  StorageCapabilities,
  StoredMaterial,
} from "../provider-types";
import { validateUploadedFile } from "../../validator";
import { estimatePdfPageCountFromBlob } from "../../pdf-page-count";
import { computeDefaultExpiration, isMaterialExpired } from "@/core/config/material";
import { MaterialRegistryService, MaterialRecord } from "@/lib/storage/registry";
import { createAssetGrant } from "@/lib/auth/asset-grant";
import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const TOKEN_API = "https://oauth2.googleapis.com/token";
const FOLDER_MIME = "application/vnd.google-apps.folder";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
};

export interface GoogleDriveStreamResult {
  body: ReadableStream<Uint8Array> | null;
  mimeType: string | null;
  contentRange: string | null;
  contentLength: string | null;
  acceptRanges: string | null;
  status: number;
}

let globalDriveToken: { token: string; expiresAt: number } | null = null;
let inFlightGoogleRefresh: Promise<string> | null = null;

const folderIdCache = new Map<string, { id: string; cachedAt: number }>();
const FOLDER_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

export function resetGoogleDriveTokenCache(): void {
  globalDriveToken = null;
  inFlightGoogleRefresh = null;
  folderIdCache.clear();
}

export class GoogleDriveStorageProvider implements MaterialStorageProvider {
  readonly type: MaterialStorageProviderType = "google_drive";
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
    if (this.getSecret("GOOGLE_CLIENT_ID") && this.getSecret("GOOGLE_CLIENT_SECRET")) {
      if (this.getSecret("GOOGLE_REFRESH_TOKEN")) return true;
      try {
        const credStore = new IntegrationCredentialStore(this.env);
        const storedCred = await credStore.getAnyCredential("google_drive");
        if (storedCred?.refreshToken || storedCred?.accessToken) return true;
      } catch {
        // Non-fatal
      }
    }
    return false;
  }

  hasSecretRefreshToken(): boolean {
    return Boolean(this.getSecret("GOOGLE_REFRESH_TOKEN"));
  }

  async upload(input: MaterialUploadInput): Promise<StoredMaterial> {
    if (!(await this.isAvailable())) {
      throw new Error("Google Drive belum tersambung. Sambungkan akun operator sebelum mengunggah materi.");
    }

    const validation = validateUploadedFile(input.fileName, input.mimeType, input.sizeBytes);
    if (!validation.valid || !validation.materialType) {
      throw new Error(validation.error || "Format file belum didukung.");
    }

    const now = Date.now();
    const materialId = `mat-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const expiresAt = computeDefaultExpiration(now);
    const folderId = await this.ensureRoomFolder(input.roomCode);
    const fileId = await this.uploadFile(folderId, input.fileName, validation.mimeType || input.mimeType, input.file);
    let slideCount = 1;
    try {
      if (validation.materialType === "pdf") {
        slideCount = (await estimatePdfPageCountFromBlob(input.file)) || 1;
      }
    } catch {
      slideCount = 1;
    }

    const registry = new MaterialRegistryService(this.env);
    const record = await registry.createMaterial({
      id: materialId,
      ownerUserId: input.ownerUserId,
      roomCode: input.roomCode,
      sourceType: "UPLOADED_FILE",
      materialType: validation.materialType,
      storageProvider: "google_drive",
      storageReference: fileId,
      title: input.fileName,
      originalFileName: input.fileName,
      mimeType: validation.mimeType || input.mimeType,
      sizeBytes: input.sizeBytes,
      objectKey: null,
      externalUrl: null,
      slideCount,
      status: "ready",
      createdAt: now,
      expiresAt,
    });

    return this.toStoredMaterial(record, input.roomCode, fileId);
  }

  async registerExternalUrl(_input: ExternalMaterialInput): Promise<StoredMaterial> {
    throw new Error("GoogleDriveStorageProvider tidak menangani registrasi link eksternal.");
  }

  async resolve(input: MaterialResolveInput): Promise<ResolvedMaterial> {
    const record = await this.getReadyRecord(input);
    const grant = input.roomCode ? await createAssetGrant(input.roomCode, record.id, this.env) : "";
    const assetUrl = `/api/material/asset?materialId=${record.id}${input.roomCode ? `&roomCode=${encodeURIComponent(input.roomCode)}` : ""}${grant ? `&grant=${encodeURIComponent(grant)}` : ""}`;

    return {
      materialId: record.id,
      materialType: record.materialType,
      sourceUrl: assetUrl,
      provider: "google_drive",
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
    if (record?.storageReference) {
      await this.deleteDriveFile(record.storageReference).catch(() => undefined);
    }
    await registry.deleteMaterial(input.materialId);
  }

  async getFileStream(
    fileId: string,
    rangeHeader?: string | null
  ): Promise<GoogleDriveStreamResult> {
    let token = await this.getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (rangeHeader) {
      headers["Range"] = rangeHeader;
    }

    let response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
      headers,
    });

    // If Google returns 401 (token expired/invalidated on Google's side), invalidate cached token and retry once
    if (response.status === 401) {
      globalDriveToken = null;
      token = await this.getAccessToken();
      headers["Authorization"] = `Bearer ${token}`;
      response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, {
        headers,
      });
    }

    if (!response.ok && response.status !== 206) {
      const errorBody = await response.text().catch(() => "");
      console.error(`[GoogleDriveStorageProvider] getFileStream failed (HTTP ${response.status}) for file ${fileId}:`, errorBody);
      throw new Error(`File Google Drive tidak dapat diambil (HTTP ${response.status})${errorBody ? `: ${errorBody.slice(0, 150)}` : ""}`);
    }

    return {
      body: response.body,
      mimeType: response.headers.get("content-type"),
      contentRange: response.headers.get("content-range"),
      contentLength: response.headers.get("content-length"),
      acceptRanges: response.headers.get("accept-ranges") || "bytes",
      status: response.status,
    };
  }

  async getFile(
    fileId: string,
    rangeHeader?: string | null
  ): Promise<{
    data: ArrayBuffer;
    mimeType: string | null;
    contentRange?: string | null;
    contentLength?: string | null;
    status: number;
  }> {
    const streamResult = await this.getFileStream(fileId, rangeHeader);
    const data = streamResult.body ? await new Response(streamResult.body).arrayBuffer() : new ArrayBuffer(0);
    return {
      data,
      mimeType: streamResult.mimeType,
      contentRange: streamResult.contentRange,
      contentLength: streamResult.contentLength,
      status: streamResult.status,
    };
  }

  async getFileMetadata(fileId: string): Promise<{ name?: string; mimeType?: string; size?: number } | null> {
    try {
      const token = await this.getAccessToken();
      const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return null;
      return (await response.json().catch(() => null)) as { name?: string; mimeType?: string; size?: number } | null;
    } catch {
      return null;
    }
  }

  private async getReadyRecord(input: MaterialResolveInput): Promise<MaterialRecord> {
    const registry = new MaterialRegistryService(this.env);
    const record = await registry.getMaterialById(input.materialId);
    if (!record || record.status === "deleted") throw new Error("Materi tidak ditemukan atau sudah dihapus.");
    if (record.roomCode && input.roomCode && record.roomCode.toUpperCase() !== input.roomCode.toUpperCase()) {
      throw new Error("Akses materi ditolak untuk room ini.");
    }
    if (record.status === "expired" || isMaterialExpired(record.expiresAt)) {
      if (record.status !== "expired") await registry.markExpired(input.materialId);
      throw new Error("Materi tidak tersedia atau sudah kedaluwarsa.");
    }
    return record;
  }

  private async uploadFile(parentId: string, name: string, mimeType: string, file: File | Blob): Promise<string> {
    const token = await this.getAccessToken();
    const metadata = { name, parents: [parentId], mimeType };
    const boundary = `stagepilot-${crypto.randomUUID()}`;
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
      file,
      `\r\n--${boundary}--`,
    ]);
    const response = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const json = (await response.json().catch(() => ({}))) as { id?: string };
    if (!response.ok || !json.id) throw new Error("Gagal mengunggah materi ke Google Drive.");
    return json.id;
  }

  private async ensureRoomFolder(roomCode: string): Promise<string> {
    const rootId = await this.findOrCreateFolder("StagePilot");
    const roomsId = await this.findOrCreateFolder("Rooms", rootId);
    return this.findOrCreateFolder(roomCode.toUpperCase(), roomsId);
  }

  private async findOrCreateFolder(name: string, parentId?: string): Promise<string> {
    const cacheKey = `${parentId || "root"}/${name}`;
    const cached = folderIdCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < FOLDER_CACHE_TTL) return cached.id;

    const token = await this.getAccessToken();
    const escaped = name.replace(/'/g, "\\'");
    const parentClause = parentId ? ` and '${parentId}' in parents` : "";
    const q = `name = '${escaped}' and mimeType = '${FOLDER_MIME}' and trashed = false${parentClause}`;
    const list = await fetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const listJson = (await list.json().catch(() => ({}))) as { files?: Array<{ id: string }> };
    if (listJson.files?.[0]?.id) {
      folderIdCache.set(cacheKey, { id: listJson.files[0].id, cachedAt: Date.now() });
      return listJson.files[0].id;
    }

    const create = await fetch(`${DRIVE_API}/files?fields=id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parentId ? [parentId] : undefined }),
    });
    const createJson = (await create.json().catch(() => ({}))) as { id?: string };
    if (!create.ok || !createJson.id) throw new Error("Gagal menyiapkan folder Google Drive.");
    folderIdCache.set(cacheKey, { id: createJson.id, cachedAt: Date.now() });
    return createJson.id;
  }

  private async deleteDriveFile(fileId: string): Promise<void> {
    const token = await this.getAccessToken();
    const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok && response.status !== 404) throw new Error("Gagal menghapus file Google Drive.");
  }

  async deleteRoomFolder(roomCode: string): Promise<void> {
    try {
      const rootId = await this.findOrCreateFolder("StagePilot");
      const roomsId = await this.findOrCreateFolder("Rooms", rootId);
      const folderKey = `${roomsId}/${roomCode.toUpperCase()}`;
      const folderId = folderIdCache.get(folderKey)?.id || (await this.findOrCreateFolder(roomCode.toUpperCase(), roomsId));
      if (folderId) {
        await this.deleteDriveFile(folderId);
        folderIdCache.delete(folderKey);
      }
    } catch {
      // Non-fatal cleanup failure
    }
  }

  private async getAccessToken(): Promise<string> {
    if (globalDriveToken && globalDriveToken.expiresAt > Date.now() + 60_000) return globalDriveToken.token;
    if (inFlightGoogleRefresh) return inFlightGoogleRefresh;

    inFlightGoogleRefresh = (async () => {
      try {
        const clientId = this.getSecret("GOOGLE_CLIENT_ID");
        const clientSecret = this.getSecret("GOOGLE_CLIENT_SECRET");

        const credStore = new IntegrationCredentialStore(this.env);
        let storedCred = null;
        try {
          storedCred = await credStore.getAnyCredential("google_drive");
        } catch {
          // Non-fatal D1 lookup
        }

        // If stored credential in D1 has a valid active access token, use it immediately
        if (storedCred?.accessToken && storedCred.expiresAt > Date.now() + 60_000) {
          globalDriveToken = { token: storedCred.accessToken, expiresAt: storedCred.expiresAt };
          return storedCred.accessToken;
        }

        // Prioritize dynamically connected refresh token from D1 over static environment variable
        const refreshToken = storedCred?.refreshToken || this.getSecret("GOOGLE_REFRESH_TOKEN");

        if (!clientId || !clientSecret || !refreshToken) {
          throw new Error("Google Drive belum dikonfigurasi. Sambungkan akun Google Drive via Dashboard.");
        }

        const response = await fetch(TOKEN_API, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: refreshToken,
            grant_type: "refresh_token",
          }),
        });
        const json = (await response.json().catch(() => ({}))) as GoogleTokenResponse;
        if (!response.ok || !json.access_token) {
          globalDriveToken = null;
          const errorDetail = json.error ? ` (${json.error})` : "";
          throw new Error(`Koneksi Google Drive tidak tersedia${errorDetail}. Refresh token mungkin kedaluwarsa atau perlu disambungkan ulang via Dashboard.`);
        }

        const newExpiresAt = Date.now() + (json.expires_in || 3600) * 1000;
        globalDriveToken = { token: json.access_token, expiresAt: newExpiresAt };

        if (storedCred) {
          await credStore.saveCredential({
            ...storedCred,
            accessToken: json.access_token,
            expiresAt: newExpiresAt,
          }).catch(() => null);
        }

        return json.access_token;
      } finally {
        inFlightGoogleRefresh = null;
      }
    })();

    return inFlightGoogleRefresh;
  }

  private getSecret(name: string): string {
    const value = this.env?.[name] ?? process.env[name];
    return typeof value === "string" ? value : "";
  }

  private toStoredMaterial(record: MaterialRecord, roomCode: string, fileId: string): StoredMaterial {
    return {
      id: record.id,
      ownerUserId: record.ownerUserId,
      roomCode: record.roomCode || roomCode,
      sourceType: record.sourceType,
      materialType: record.materialType,
      storageProvider: "google_drive",
      storageReference: fileId,
      title: record.title,
      originalFileName: record.originalFileName,
      mimeType: record.mimeType || "application/octet-stream",
      sizeBytes: record.sizeBytes,
      objectKey: null,
      externalUrl: null,
      slideCount: record.slideCount,
      createdAt: record.createdAt,
      expiresAt: record.expiresAt,
      status: record.status,
    };
  }
}
