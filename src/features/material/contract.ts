import { Material, MaterialType, SlideMetadata } from "@/core/types";

export interface MaterialRenderContext {
  containerElement?: HTMLElement;
  width?: number;
  height?: number;
  devicePixelRatio?: number;
}

export interface MaterialProvider {
  type: MaterialType;
  supports(type: MaterialType): boolean;
  parse(source: string | File | Blob, name: string): Promise<Material>;
  getSlide(material: Material, pageNumber: number): Promise<SlideMetadata>;
}

export interface MaterialRenderer {
  type: MaterialType;
  renderSlide(
    material: Material,
    pageNumber: number,
    context: MaterialRenderContext
  ): Promise<void>;
  cleanup?(): void;
}

export interface PresentationAdapter {
  registerProvider(provider: MaterialProvider): void;
  registerRenderer(renderer: MaterialRenderer): void;
  getProvider(type: MaterialType): MaterialProvider;
  getRenderer(type: MaterialType): MaterialRenderer;
  loadMaterial(source: string | File | Blob, name: string, type: MaterialType): Promise<Material>;
}
