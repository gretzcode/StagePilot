export type MaterialStorageProviderType = "external_url" | "r2";

export interface StorageCapabilities {
  upload: boolean;
  externalReference: boolean;
  delete: boolean;
  temporaryExpiration: boolean;
}

export interface MaterialUploadInput {
  file: File | Blob;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  roomCode: string;
  ownerUserId: string;
}

export interface ExternalMaterialInput {
  url: string;
  title: string;
  roomCode: string;
  ownerUserId: string;
}

export interface MaterialResolveInput {
  materialId: string;
  roomCode?: string;
  deviceId?: string;
}

export interface MaterialDeleteInput {
  materialId: string;
  roomCode?: string;
  ownerUserId: string;
}

export interface StoredMaterial {
  id: string;
  ownerUserId: string;
  roomCode: string;
  sourceType: "UPLOADED_FILE" | "EXTERNAL_URL" | "CANVA_LINK";
  materialType: "pdf" | "pptx" | "image" | "url" | "canva";
  storageProvider: MaterialStorageProviderType;
  storageReference: string;
  title: string;
  originalFileName?: string;
  mimeType: string;
  sizeBytes: number;
  objectKey?: string | null;
  externalUrl?: string | null;
  slideCount: number;
  createdAt: number;
  expiresAt: number;
  status: "ready" | "expired" | "deleted";
}

export interface ResolvedMaterial {
  materialId: string;
  materialType: "pdf" | "pptx" | "image" | "url" | "canva";
  sourceUrl: string;
  provider: MaterialStorageProviderType;
  title: string;
  totalPages: number;
  slides: Array<{
    index: number;
    title?: string;
    thumbnailUrl?: string;
    contentUrl?: string;
    url?: string;
  }>;
  expiresAt: number;
}
