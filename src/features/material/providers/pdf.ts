import { Material, MaterialType, SlideMetadata } from "@/core/types";
import { MaterialProvider } from "../contract";
import { installPolyfills } from "@/lib/polyfills";

export class PdfMaterialProvider implements MaterialProvider {
  readonly type: MaterialType = "pdf";

  supports(type: MaterialType): boolean {
    return type === "pdf";
  }

  async parse(source: string | File | Blob, name: string, totalPagesInput?: number): Promise<Material> {
    const url = typeof source === "string" ? source : URL.createObjectURL(source);

    // When given a File/Blob, use PDF.js to count the real page count client-side
    let estimatedPages = totalPagesInput && totalPagesInput > 0 ? totalPagesInput : 1;

    if (typeof source !== "string" && typeof window !== "undefined") {
      try {
        installPolyfills();
        const pdfjsLib = await import("pdfjs-dist");
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        }
        const doc = await pdfjsLib.getDocument(url).promise;
        estimatedPages = doc.numPages;
        // Don't destroy — the shared cache in usePdfDocument will pick this up
      } catch {
        // Keep estimatedPages as-is if PDF.js fails
      }
    }

    const slides: SlideMetadata[] = Array.from({ length: estimatedPages }, (_, i) => ({
      index: i + 1,
      title: `Page ${i + 1}`,
      notes: `Speaker notes for PDF page ${i + 1}`,
      contentUrl: url,
    }));

    return {
      id: `mat-pdf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      type: "pdf",
      url,
      totalPages: estimatedPages,
      slides,
      uploadedAt: Date.now(),
      status: "ready",
      metadata: {
        title: name,
        pageCount: estimatedPages,
        mimeType: "application/pdf",
      },
    };
  }

  async getSlide(material: Material, pageNumber: number): Promise<SlideMetadata> {
    const slide = material.slides[pageNumber - 1];
    if (!slide) {
      throw new Error(`Slide page ${pageNumber} out of range for PDF material ${material.name}`);
    }
    return slide;
  }
}
