import { Material, SlideMetadata } from "@/core/types";
import { computeDefaultExpiration } from "@/core/config/material";
import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";
import { CanvaClient, extractCanvaDesignIdAsync } from "./canva.client";
import { getValidCanvaAccessToken } from "./canva.oauth";
import { CanvaConnectionStatus, CanvaDesign, ExportedPresentation } from "./canva.types";

export class CanvaService {
  static async getConnectionStatus(
    userId: string,
    env?: Record<string, unknown> | null
  ): Promise<CanvaConnectionStatus> {
    const store = new IntegrationCredentialStore(env);
    const cred = await store.getCredential(userId, "canva");

    if (!cred) {
      return {
        connected: false,
        accountEmail: null,
        accountName: null,
        scopes: [],
        expiresAt: null,
      };
    }

    return {
      connected: true,
      accountEmail: cred.accountEmail || null,
      accountName: cred.accountName || null,
      scopes: cred.scopes || [],
      expiresAt: cred.expiresAt,
    };
  }

  static async disconnect(
    userId: string,
    env?: Record<string, unknown> | null
  ): Promise<boolean> {
    const store = new IntegrationCredentialStore(env);
    return store.deleteCredential(userId, "canva");
  }

  static async getClientForUser(
    userId: string,
    env?: Record<string, unknown> | null
  ): Promise<CanvaClient> {
    const token = await getValidCanvaAccessToken(userId, env);
    if (!token) {
      throw new Error("CANVA_NOT_CONNECTED");
    }
    return new CanvaClient(token);
  }

  static async listUserDesigns(
    userId: string,
    env?: Record<string, unknown> | null,
    limit = 20
  ): Promise<CanvaDesign[]> {
    const client = await this.getClientForUser(userId, env);
    const result = await client.listDesigns(limit);
    return result.items;
  }

  static async exportPresentation(
    userId: string,
    designIdOrUrl: string,
    env?: Record<string, unknown> | null
  ): Promise<ExportedPresentation> {
    const designId = await extractCanvaDesignIdAsync(designIdOrUrl);
    if (!designId) {
      throw new Error("CANVA_INVALID_URL");
    }

    const client = await this.getClientForUser(userId, env);
    return client.exportPresentation(designId);
  }

  static async importDesignAsMaterial(
    userId: string,
    designIdOrUrl: string,
    env?: Record<string, unknown> | null,
    roomCode?: string
  ): Promise<Material> {
    const designId = await extractCanvaDesignIdAsync(designIdOrUrl);
    if (!designId) {
      throw new Error("CANVA_INVALID_URL");
    }

    const client = await this.getClientForUser(userId, env);

    // 1. Export presentation slides through Canva Connect Export API
    const exported = await client.exportPresentation(designId);
    const totalSlides = Math.max(exported.totalPages, exported.slides.length);

    if (totalSlides === 0 || exported.slides.length === 0) {
      throw new Error("CANVA_EXPORT_EMPTY_SLIDES");
    }

    const now = Date.now();
    const expiresAt = computeDefaultExpiration(now);
    const resolvedTitle = exported.title || `Canva Presentation ${designId}`;

    const slides: SlideMetadata[] = exported.slides.map((slide) => ({
      index: slide.index,
      title: slide.title || `${resolvedTitle} — Slide ${slide.index}`,
      contentUrl: slide.contentUrl,
      thumbnailUrl: slide.thumbnailUrl || slide.contentUrl,
      url: slide.contentUrl,
    }));

    const material: Material = {
      id: `mat-canva-${designId}-${now}`,
      name: resolvedTitle,
      type: "canva",
      sourceType: "CANVA_LINK",
      url: slides[0]?.contentUrl || `https://www.canva.com/design/${designId}/view`,
      objectKey: null,
      externalUrl: `https://www.canva.com/design/${designId}/view`,
      sizeBytes: 0,
      totalPages: totalSlides,
      slides,
      uploadedAt: now,
      expiresAt,
      ownerUserId: userId,
      roomCode,
      status: "ready",
      metadata: {
        title: resolvedTitle,
        pageCount: totalSlides,
        thumbnailUrl: slides[0]?.thumbnailUrl,
      },
    };

    return material;
  }
}
