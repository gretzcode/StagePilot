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

export interface CanvaDesignPage {
  page_number?: number;
  index?: number;
  id?: string;
  title?: string;
  thumbnail?: CanvaDesignThumbnail;
  thumbnail_url?: string;
  content_url?: string;
  width?: number;
  height?: number;
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
