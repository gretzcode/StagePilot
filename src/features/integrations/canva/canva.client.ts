import {
  CanvaDesign,
  CanvaDesignPage,
  CanvaUserProfile,
} from "./canva.types";

const CANVA_API_BASE = "https://api.canva.com/rest/v1";

export function extractCanvaDesignId(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();

  // If it is already just the alphanumeric ID (e.g. DAG12345, DAFxx-abc)
  if (/^[A-Za-z0-9_-]{8,32}$/.test(trimmed)) {
    return trimmed;
  }

  // URL extraction patterns:
  // https://www.canva.com/design/DAG12345/view
  // https://www.canva.com/design/DAG12345/edit
  // https://www.canva.com/design/DAG12345/...
  const match = trimmed.match(/\/design\/([A-Za-z0-9_-]{8,32})/i);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

export class CanvaClient {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${CANVA_API_BASE}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${this.accessToken}`);
    headers.set("Accept", "application/json");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      if (!res.ok) {
        if (res.status === 401) {
          throw new Error("CANVA_TOKEN_EXPIRED");
        }
        if (res.status === 403) {
          throw new Error("CANVA_ACCESS_DENIED");
        }
        if (res.status === 404) {
          throw new Error("CANVA_DESIGN_NOT_FOUND");
        }
        if (res.status === 429) {
          throw new Error("CANVA_RATE_LIMITED");
        }

        const errorBody = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
        const msg = errorBody.message || errorBody.error || `HTTP ${res.status}`;
        throw new Error(`Canva API error: ${msg}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getUserProfile(): Promise<CanvaUserProfile> {
    try {
      const data = await this.request<{ user?: CanvaUserProfile; profile?: CanvaUserProfile } & CanvaUserProfile>("/users/me/profile");
      return data.user || data.profile || { id: data.id, display_name: data.display_name, email: data.email };
    } catch {
      // Fallback for user metadata
      return { display_name: "Canva User" };
    }
  }

  async listDesigns(limit = 20, continuation?: string): Promise<{ items: CanvaDesign[]; continuation?: string }> {
    let endpoint = `/designs?limit=${Math.min(limit, 50)}`;
    if (continuation) {
      endpoint += `&continuation=${encodeURIComponent(continuation)}`;
    }

    try {
      const data = await this.request<{ items?: CanvaDesign[]; continuation?: string }>(endpoint);
      return {
        items: Array.isArray(data.items) ? data.items : [],
        continuation: data.continuation,
      };
    } catch (err) {
      console.warn("[CanvaClient] listDesigns failed:", err);
      return { items: [] };
    }
  }

  async getDesign(designId: string): Promise<CanvaDesign> {
    const data = await this.request<{ design?: CanvaDesign }>(`/designs/${encodeURIComponent(designId)}`);
    return data.design || (data as unknown as CanvaDesign);
  }

  async getDesignPages(designId: string): Promise<CanvaDesignPage[]> {
    try {
      // Query Canva Connect get design pages endpoint
      const data = await this.request<{ items?: CanvaDesignPage[]; pages?: CanvaDesignPage[] }>(
        `/designs/${encodeURIComponent(designId)}/pages`
      );

      const rawPages = data.items || data.pages || [];
      if (Array.isArray(rawPages) && rawPages.length > 0) {
        return rawPages.map((p, idx) => ({
          page_number: p.page_number ?? idx + 1,
          index: idx + 1,
          id: p.id || `page-${idx + 1}`,
          title: p.title || `Slide ${idx + 1}`,
          thumbnail: p.thumbnail,
          thumbnail_url: p.thumbnail?.url || p.thumbnail_url,
          content_url: p.thumbnail?.url || p.thumbnail_url || p.content_url,
          width: p.thumbnail?.width || p.width || 1920,
          height: p.thumbnail?.height || p.height || 1080,
        }));
      }
    } catch (err) {
      console.warn("[CanvaClient] getDesignPages endpoint failed or not permitted:", err);
    }

    // Fallback: Return at least page 1 with design thumbnail if available
    const design = await this.getDesign(designId);
    return [
      {
        page_number: 1,
        index: 1,
        id: "page-1",
        title: design.title || "Slide 1",
        thumbnail: design.thumbnail,
        thumbnail_url: design.thumbnail?.url,
        content_url: design.thumbnail?.url,
        width: design.thumbnail?.width || 1920,
        height: design.thumbnail?.height || 1080,
      },
    ];
  }
}
