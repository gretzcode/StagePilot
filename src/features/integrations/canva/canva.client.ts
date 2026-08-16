import {
  CanvaDesign,
  CanvaExportJob,
  CanvaUserProfile,
  ExportedPresentation,
  ExportedSlide,
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

export async function resolveCanvaShortlink(input: string): Promise<string> {
  if (!input || typeof input !== "string") return input;
  const trimmed = input.trim();

  const isShortlink =
    trimmed.includes("canva.link/") ||
    trimmed.includes("canva.me/") ||
    trimmed.includes("link.canva.com/");

  if (!isShortlink) {
    return trimmed;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    clearTimeout(timeout);

    if (res.url && res.url !== trimmed) {
      return res.url;
    }

    return trimmed;
  } catch {
    return trimmed;
  }
}

export async function extractCanvaDesignIdAsync(input: string): Promise<string | null> {
  const direct = extractCanvaDesignId(input);
  if (direct) return direct;

  const resolved = await resolveCanvaShortlink(input);
  return extractCanvaDesignId(resolved);
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
    const timeout = setTimeout(() => controller.abort(), 12000);

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

        const errorBody = (await res.json().catch(() => ({}))) as {
          message?: string;
          error?: string;
          code?: string;
        };
        const msg = errorBody.message || errorBody.error || errorBody.code || `HTTP ${res.status}`;
        throw new Error(`CANVA_API_ERROR: ${msg}`);
      }

      return (await res.json()) as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getUserProfile(): Promise<CanvaUserProfile> {
    try {
      const data = await this.request<{ user?: CanvaUserProfile; profile?: CanvaUserProfile } & CanvaUserProfile>(
        "/users/me/profile"
      );
      return data.user || data.profile || { id: data.id, display_name: data.display_name, email: data.email };
    } catch {
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
    const design = data.design || (data as unknown as CanvaDesign);
    if (!design || !design.id) {
      throw new Error("CANVA_DESIGN_NOT_FOUND");
    }
    return design;
  }

  async createExportJob(designId: string, format: "jpg" | "png" | "pdf" = "jpg"): Promise<CanvaExportJob> {
    const requestBody = {
      design_id: designId,
      format: {
        type: format,
        quality: 100,
      },
    };

    const data = await this.request<{ job?: CanvaExportJob } & CanvaExportJob>("/exports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const job = data.job || data;
    if (!job || !job.id) {
      throw new Error("CANVA_EXPORT_JOB_CREATION_FAILED");
    }

    return job;
  }

  async getExportJob(exportId: string): Promise<CanvaExportJob> {
    const data = await this.request<{ job?: CanvaExportJob } & CanvaExportJob>(
      `/exports/${encodeURIComponent(exportId)}`
    );
    const job = data.job || data;
    if (!job || !job.id) {
      throw new Error("CANVA_EXPORT_JOB_NOT_FOUND");
    }
    return job;
  }

  async pollExportJobUntilComplete(exportId: string, maxWaitMs = 30000, intervalMs = 1000): Promise<CanvaExportJob> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.getExportJob(exportId);

      if (job.status === "success") {
        if (!job.urls || job.urls.length === 0) {
          throw new Error("CANVA_EXPORT_EMPTY_URLS");
        }
        return job;
      }

      if (job.status === "failed") {
        const errorMsg = job.error?.message || job.error?.code || "Export job returned failed status";
        throw new Error(`CANVA_EXPORT_FAILED: ${errorMsg}`);
      }

      // Wait interval before next poll
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error("CANVA_EXPORT_TIMEOUT");
  }

  async exportPresentation(designId: string): Promise<ExportedPresentation> {
    // 1. Fetch design metadata
    const design = await this.getDesign(designId);
    const title = design.title || `Canva Presentation ${designId}`;

    // 2. Create export job
    const initialJob = await this.createExportJob(designId, "jpg");

    // 3. Poll until export completes
    let completedJob: CanvaExportJob;
    if (initialJob.status === "success" && initialJob.urls && initialJob.urls.length > 0) {
      completedJob = initialJob;
    } else {
      completedJob = await this.pollExportJobUntilComplete(initialJob.id);
    }

    const urls = completedJob.urls || [];
    if (urls.length === 0) {
      throw new Error("CANVA_EXPORT_NO_SLIDES_PRODUCED");
    }

    const slides: ExportedSlide[] = urls.map((url, idx) => {
      const slideNum = idx + 1;
      return {
        index: slideNum,
        contentUrl: url,
        thumbnailUrl: url,
        title: `${title} — Slide ${slideNum}`,
      };
    });

    return {
      designId,
      title,
      totalPages: slides.length,
      slides,
    };
  }
}
