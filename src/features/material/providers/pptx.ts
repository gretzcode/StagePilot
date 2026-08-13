import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";

/**
 * PptxMaterialProvider — client-side metadata adapter for PPTX materials.
 *
 * This provider does NOT parse PPTX binary on the client. Actual rendering is
 * handled by PdfSlideViewer after the asset route converts the PPTX to PDF via
 * Google Drive's server-side export endpoint. This provider is responsible only
 * for constructing the normalized Material metadata object from information
 * supplied by the server (upload route, registry).
 *
 * @param slideCount - Number of slides, extracted by the server during upload
 *   via estimatePptxSlideCountFromBlob (ZIP central-directory scanner).
 */
export class PptxMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "pptx";

  supports(type: MaterialType): boolean {
    return type === "pptx";
  }

  async parse(source: string | File | Blob, name: string, slideCount?: number): Promise<Material> {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);

    // Use server-supplied slide count when available.
    // Fall back to 1 only as a last resort — the real count will be
    // discovered by PdfSlideViewer via onNumPagesDiscovered once the
    // converted PDF is loaded by PDF.js.
    const totalPages = (slideCount && slideCount > 0) ? slideCount : 1;

    const slides: SlideMetadata[] = Array.from({ length: totalPages }, (_, i) => ({
      index: i + 1,
      title: `Slide ${i + 1}`,
      contentUrl: url,
    }));

    return {
      id: `mat-pptx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "pptx",
      url,
      totalPages,
      slides,
      uploadedAt: Date.now(),
      status: "ready",
      metadata: {
        title: name,
        pageCount: totalPages,
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    const slide = material.slides[pageNumber - 1];
    if (!slide) {
      throw new Error(`Slide ${pageNumber} out of range for PPTX material ${material.name}`);
    }
    return slide;
  }
}
