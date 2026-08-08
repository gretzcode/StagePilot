export type MaterialType = "pdf" | "pptx" | "url" | "image";

export type MaterialStatus = "uploading" | "processing" | "ready" | "error";

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
  url: string;
  totalPages: number;
  slides: SlideMetadata[];
  uploadedAt: number;
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
