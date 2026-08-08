import { Material, MaterialType } from "@/core/types";
import { MaterialProvider, MaterialRenderer, PresentationAdapter } from "./contract";
import { PdfMaterialProvider } from "./providers/pdf";
import { PptxMaterialProvider } from "./providers/pptx";
import { UrlMaterialProvider } from "./providers/url";
import { ImageMaterialProvider } from "./providers/image";

export class PresentationAdapterImpl implements PresentationAdapter {
  private providers: Map<MaterialType, MaterialProvider> = new Map();
  private renderers: Map<MaterialType, MaterialRenderer> = new Map();

  constructor() {
    // Register default built-in providers
    this.registerProvider(new PdfMaterialProvider());
    this.registerProvider(new PptxMaterialProvider());
    this.registerProvider(new UrlMaterialProvider());
    this.registerProvider(new ImageMaterialProvider());
  }

  registerProvider(provider: MaterialProvider): void {
    this.providers.set(provider.type, provider);
  }

  registerRenderer(renderer: MaterialRenderer): void {
    this.renderers.set(renderer.type, renderer);
  }

  getProvider(type: MaterialType): MaterialProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new Error(`No MaterialProvider registered for type '${type}'`);
    }
    return provider;
  }

  getRenderer(type: MaterialType): MaterialRenderer {
    const renderer = this.renderers.get(type);
    if (!renderer) {
      throw new Error(`No MaterialRenderer registered for type '${type}'`);
    }
    return renderer;
  }

  async loadMaterial(
    source: string | File | Blob,
    name: string,
    type: MaterialType
  ): Promise<Material> {
    const provider = this.getProvider(type);
    return provider.parse(source, name);
  }
}

export const defaultPresentationAdapter = new PresentationAdapterImpl();
