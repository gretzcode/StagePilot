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
  thumbnailUrl?: string;
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

export type PresentationStatus = "idle" | "live" | "paused" | "ended";

export interface MediaPlaybackState {
  status: "playing" | "paused" | "stopped";
  currentTime: number; // in seconds
  duration?: number; // in seconds
  playbackRate: number; // default 1.0
  updatedAt: number; // epoch ms when currentTime was recorded
}

export interface PresentationSession {
  sessionId: string;
  presentationId: string | null;
  currentSlide: number;
  totalSlides: number;
  status: PresentationStatus;
  revision: number;
  blanked: boolean;
  mediaState?: MediaPlaybackState;
  updatedAt: number;
}

export interface PresentationState {
  isPresenting: boolean;
  materialId: string | null;
  /** Sole Source of Truth for presentation position (1-indexed) */
  currentSlide: number;
  totalSlides: number;
  /** Backward-compatible alias for totalSlides */
  totalPages: number;
  status: PresentationStatus;
  /** Monotonically increasing revision integer */
  revision: number;
  currentSlideMetadata: SlideMetadata | null;
  nextSlideMetadata: SlideMetadata | null;
  blanked: boolean;
  blackoutMode: boolean;
  mediaState?: MediaPlaybackState;
  startedAt: number | null;
  updatedAt: number;
}
