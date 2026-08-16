export interface CanvaTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface CanvaUserProfile {
  id?: string;
  display_name?: string;
  email?: string;
}

export interface CanvaDesignThumbnail {
  width: number;
  height: number;
  url: string;
}

export interface CanvaDesign {
  id: string;
  title: string;
  created_at?: number;
  updated_at?: number;
  thumbnail?: CanvaDesignThumbnail;
  urls?: {
    edit_url?: string;
    view_url?: string;
  };
  page_count?: number;
}

export type CanvaExportJobStatus = "in_progress" | "success" | "failed";

export interface CanvaExportJob {
  id: string;
  status: CanvaExportJobStatus;
  urls?: string[];
  error?: {
    code: string;
    message: string;
  };
}

export interface ExportedSlide {
  index: number;
  contentUrl: string;
  thumbnailUrl: string;
  title: string;
  width?: number;
  height?: number;
}

export interface ExportedPresentation {
  designId: string;
  title: string;
  totalPages: number;
  slides: ExportedSlide[];
}

export interface CanvaConnectionStatus {
  connected: boolean;
  accountEmail: string | null;
  accountName: string | null;
  scopes: string[];
  expiresAt: number | null;
}

export interface CanvaErrorResponse {
  error: string;
  message?: string;
  code?: string;
}
