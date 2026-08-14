export type MaterialSourceType = "UPLOADED_FILE" | "EXTERNAL_URL" | "CANVA_LINK";
export type MaterialSource = "file" | "url";
export type MaterialMediaType = "pdf" | "image" | "video" | "canva";
export type MaterialType = "pdf" | "image" | "video" | "url" | "canva";

export type MaterialStatus = "ready" | "expired" | "deleted" | "uploading" | "error";

export interface SlideMetadata {
  index: number;
  title?: string;
  thumbnailUrl?: string;
  contentUrl?: string;
  notes?: string;
  url?: string;
}

export interface MaterialMetadata {
  title: string;
  width?: number;
  height?: number;
  pageCount: number;
  fileSize?: number;
  mimeType?: string;
}

export interface Material {
  id: string;
  name: string;
  type: MaterialType;
  source?: MaterialSource;
  mediaType?: MaterialMediaType;
  sourceType?: MaterialSourceType;
  url: string;
  objectKey?: string | null;
  externalUrl?: string | null;
  sizeBytes?: number;
  totalPages: number;
  slides: SlideMetadata[];
  uploadedAt: number;
  expiresAt?: number;
  ownerUserId?: string;
  roomCode?: string;
  status: MaterialStatus;
  errorMessage?: string;
  metadata?: MaterialMetadata;
}

export interface PresentationState {
  isPresenting: boolean;
  materialId: string | null;
  currentPage: number;
  totalPages: number;
  currentSlide: SlideMetadata | null;
  nextSlide: SlideMetadata | null;
  blanked: boolean;
  blackoutMode: boolean;
  startedAt: number | null;
  updatedAt: number;
}
