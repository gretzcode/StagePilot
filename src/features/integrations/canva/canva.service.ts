import { Material, SlideMetadata } from "@/core/types";
import { computeDefaultExpiration } from "@/core/config/material";
import { IntegrationCredentialStore } from "@/lib/integrations/credential-store";
import { CanvaClient, extractCanvaDesignId } from "./canva.client";
import { getValidCanvaAccessToken } from "./canva.oauth";
import { CanvaConnectionStatus, CanvaDesign } from "./canva.types";

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

  static async importDesignAsMaterial(
    userId: string,
    designIdOrUrl: string,
    env?: Record<string, unknown> | null,
    roomCode?: string
  ): Promise<Material> {
    const designId = extractCanvaDesignId(designIdOrUrl);
    if (!designId) {
      throw new Error("CANVA_INVALID_URL");
    }

    const client = await this.getClientForUser(userId, env);

    // 1. Fetch design metadata
    const design = await client.getDesign(designId);
    if (!design) {
      throw new Error("CANVA_DESIGN_NOT_FOUND");
    }

    // 2. Fetch all pages
    const pages = await client.getDesignPages(designId);
    const totalSlides = Math.max(pages.length, 1);

    const now = Date.now();
    const expiresAt = computeDefaultExpiration(now);
    const resolvedTitle = design.title || `Canva Presentation ${designId}`;

    const slides: SlideMetadata[] = pages.map((page, idx) => {
      const slideNum = idx + 1;
      const contentUrl = page.content_url || page.thumbnail_url || page.thumbnail?.url || "";
      const thumbnailUrl = page.thumbnail_url || page.thumbnail?.url || contentUrl;

      return {
        index: slideNum,
        title: page.title || `${resolvedTitle} — Slide ${slideNum}`,
        contentUrl,
        thumbnailUrl,
        url: contentUrl,
      };
    });

    const material: Material = {
      id: `mat-canva-${designId}-${now}`,
      name: resolvedTitle,
      type: "canva",
      sourceType: "CANVA_LINK",
      url: design.urls?.view_url || `https://www.canva.com/design/${designId}/view`,
      objectKey: null,
      externalUrl: design.urls?.view_url || `https://www.canva.com/design/${designId}/view`,
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
        thumbnailUrl: design.thumbnail?.url || slides[0]?.thumbnailUrl,
      },
    };

    return material;
  }
}
