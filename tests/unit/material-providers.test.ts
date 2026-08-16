import { describe, it, expect } from "vitest";
import { defaultPresentationAdapter } from "@/features/material/adapter";
import { PdfMaterialProvider } from "@/features/material/providers/pdf";
import { UrlMaterialProvider } from "@/features/material/providers/url";
import { ImageMaterialProvider } from "@/features/material/providers/image";
import { GoogleDriveStorageProvider } from "@/features/material/storage/providers/google-drive";
import { MaterialStorageResolver } from "@/features/material/storage";

describe("Phase 2 Material Providers Engine", () => {
  it("PDF Provider parses PDF file and generates slide deck metadata", async () => {
    const provider = new PdfMaterialProvider();
    expect(provider.supports("pdf")).toBe(true);

    const material = await provider.parse("http://example.com/deck.pdf", "Main Keynote.pdf");
    expect(material.type).toBe("pdf");
    expect(material.totalPages).toBeGreaterThan(0);
    expect(material.slides.length).toBe(material.totalPages);

    const slide1 = await provider.getSlide(material, 1);
    expect(slide1.index).toBe(1);
  });

  it("URL Provider validates HTTPS scheme and handles web page materials", async () => {
    const provider = new UrlMaterialProvider();
    expect(provider.supports("url")).toBe(true);

    const validMaterial = await provider.parse("https://stagepilot.live/demo", "Live Dashboard");
    expect(validMaterial.type).toBe("url");
    expect(validMaterial.url).toBe("https://stagepilot.live/demo");

    // Invalid non-HTTPS scheme must throw validation error
    await expect(provider.parse("http://insecure-site.com", "Insecure Site")).rejects.toThrow();
  });

  it("Image Provider processes single-slide images (PNG, JPG, WebP)", async () => {
    const provider = new ImageMaterialProvider();
    expect(provider.supports("image")).toBe(true);

    const material = await provider.parse("http://example.com/slide.png", "Event Poster.png");
    expect(material.type).toBe("image");
    expect(material.totalPages).toBe(1);
    expect(material.slides.length).toBe(1);
  });

  it("Presentation Adapter resolves providers through unified interface", async () => {
    const pdfMat = await defaultPresentationAdapter.loadMaterial("http://example.com/a.pdf", "Deck.pdf", "pdf");
    expect(pdfMat.status).toBe("ready");

    const imgMat = await defaultPresentationAdapter.loadMaterial("http://example.com/b.png", "Graphic.png", "image");
    expect(imgMat.status).toBe("ready");

    const videoMat = await defaultPresentationAdapter.loadMaterial("https://www.youtube.com/watch?v=3QZg97_fk14", "YouTube Video", "video");
    expect(videoMat.status).toBe("ready");
    expect(videoMat.type).toBe("video");
    expect(videoMat.url).toContain("youtube-nocookie.com/embed/3QZg97_fk14");
  });

  it("Google Drive provider is available only when operator secrets are configured", async () => {
    const missingProvider = new GoogleDriveStorageProvider({});
    await expect(missingProvider.isAvailable()).resolves.toBe(false);

    const configuredProvider = new GoogleDriveStorageProvider({
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    });
    await expect(configuredProvider.isAvailable()).resolves.toBe(true);
  });

  it("MaterialStorageResolver prefers Google Drive upload and keeps no-credential startup operational", async () => {
    const missingResolver = new MaterialStorageResolver({});
    await expect(missingResolver.isUploadAvailable()).resolves.toBe(false);
    expect(missingResolver.getUrlProvider().type).toBe("external_url");

    const configuredResolver = new MaterialStorageResolver({
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      GOOGLE_REFRESH_TOKEN: "refresh-token",
    });
    await expect(configuredResolver.isUploadAvailable()).resolves.toBe(true);
    await expect(configuredResolver.getUploadProvider()).resolves.toMatchObject({ type: "google_drive" });
  });
});
