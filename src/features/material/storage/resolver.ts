import { MaterialStorageProvider } from "./contract";
import { ExternalUrlStorageProvider } from "./providers/external-url";
import { GoogleDriveStorageProvider } from "./providers/google-drive";
import { R2StorageProvider } from "./providers/r2";
import { MaterialStorageProviderType } from "./provider-types";
import { MaterialRegistryService } from "@/lib/storage/registry";

export class MaterialStorageResolver {
  private providers: Map<MaterialStorageProviderType, MaterialStorageProvider> = new Map();
  private env?: Record<string, unknown> | null;

  constructor(env?: Record<string, unknown> | null) {
    this.env = env;
    const externalProvider = new ExternalUrlStorageProvider(env);
    const googleDriveProvider = new GoogleDriveStorageProvider(env);
    const r2Provider = new R2StorageProvider(env);

    this.providers.set(externalProvider.type, externalProvider);
    this.providers.set(googleDriveProvider.type, googleDriveProvider);
    this.providers.set(r2Provider.type, r2Provider);
  }

  async isUploadAvailable(): Promise<boolean> {
    const googleDrive = this.providers.get("google_drive");
    if (googleDrive && (await googleDrive.isAvailable())) return true;

    const r2 = this.providers.get("r2");
    if (!r2) return false;
    return r2.isAvailable();
  }

  async getUploadProvider(): Promise<MaterialStorageProvider> {
    const googleDrive = this.providers.get("google_drive");
    if (googleDrive && (await googleDrive.isAvailable())) {
      return googleDrive;
    }

    const r2 = this.providers.get("r2");
    if (r2 && (await r2.isAvailable())) {
      return r2;
    }
    throw new Error(
      "Upload file belum tersedia pada konfigurasi deployment ini. Gunakan link materi publik atau sambungkan storage provider."
    );
  }

  getUrlProvider(): MaterialStorageProvider {
    const external = this.providers.get("external_url");
    if (!external) {
      throw new Error("ExternalUrlStorageProvider tidak dikonfigurasi.");
    }
    return external;
  }

  async getProviderForMaterial(materialId: string): Promise<MaterialStorageProvider> {
    const registry = new MaterialRegistryService(this.env);
    const record = await registry.getMaterialById(materialId);

    if (record?.storageProvider === "google_drive") {
      const googleDrive = this.providers.get("google_drive");
      if (googleDrive) return googleDrive;
    }

    if (record?.storageProvider === "r2") {
      const r2 = this.providers.get("r2");
      if (r2) return r2;
    }

    // Default fallback to ExternalUrlStorageProvider
    return this.getUrlProvider();
  }
}
