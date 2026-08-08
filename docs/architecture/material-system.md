# Material Presentation Engine Abstraction

The presentation engine decouples material formats (PDF, PPTX, URL, Image) from presentation controllers.

## Core Abstraction Contracts

```typescript
export interface MaterialProvider {
  type: MaterialType;
  supports(type: MaterialType): boolean;
  parse(source: string | File | Blob, name: string): Promise<Material>;
  getSlide(material: Material, pageNumber: number): Promise<SlideMetadata>;
}

export interface PresentationAdapter {
  registerProvider(provider: MaterialProvider): void;
  loadMaterial(source: string | File | Blob, name: string, type: MaterialType): Promise<Material>;
}
```

## Supported Format Strategy
- **PDF**: Rendered client-side via PDFJS or Canvas abstraction.
- **PPTX**: Parsed into slide metadata & canvas elements.
- **URL**: Embedded iframe / web snapshot view.
- **IMAGE**: Fullscreen image renderer with aspect ratio preservation.
