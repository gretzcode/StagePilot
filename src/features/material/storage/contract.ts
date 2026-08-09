import {
  MaterialStorageProviderType,
  StorageCapabilities,
  MaterialUploadInput,
  ExternalMaterialInput,
  MaterialResolveInput,
  MaterialDeleteInput,
  StoredMaterial,
  ResolvedMaterial,
} from "./provider-types";

export interface MaterialStorageProvider {
  readonly type: MaterialStorageProviderType;
  readonly capabilities: StorageCapabilities;

  isAvailable(): Promise<boolean>;

  upload?(input: MaterialUploadInput): Promise<StoredMaterial>;

  registerExternalUrl(input: ExternalMaterialInput): Promise<StoredMaterial>;

  resolve(input: MaterialResolveInput): Promise<ResolvedMaterial>;

  delete?(input: MaterialDeleteInput): Promise<void>;
}
