import { NormalizedZoomRegion, PresentationZoomState } from "@/core/types";

export interface ZoomCalculationResult {
  scale: number;
  panX: number;
  panY: number;
  region: NormalizedZoomRegion;
}

/**
 * Calculates resolution-independent zoom scale and pan percentage offsets
 * from a normalized presentation-space selection region.
 *
 * Guaranteed to preserve presentation aspect ratio and prevent content overflow.
 *
 * @param region Normalized bounding box (x, y, width, height in range [0, 1])
 * @param maxScale Maximum allowed zoom level (default: 5.0)
 */
export function calculateZoomFromRegion(
  region: NormalizedZoomRegion,
  maxScale: number = 5.0
): ZoomCalculationResult {
  // 1. Clamp & sanitize normalized coordinates
  const cleanX = Math.max(0, Math.min(region.x, 1));
  const cleanY = Math.max(0, Math.min(region.y, 1));
  const cleanWidth = Math.max(0.01, Math.min(region.width, 1 - cleanX));
  const cleanHeight = Math.max(0.01, Math.min(region.height, 1 - cleanY));

  // 2. Aspect-Ratio Preserving Scale:
  // To fit the selected region into the container, scale is determined
  // by the dimension that needs the least magnification (min(1/w, 1/h)).
  const rawScale = Math.min(1 / cleanWidth, 1 / cleanHeight);
  const scale = Math.max(1.0, Math.min(Math.round(rawScale * 100) / 100, maxScale));

  if (scale <= 1.0) {
    return {
      scale: 1.0,
      panX: 0,
      panY: 0,
      region: { x: 0, y: 0, width: 1, height: 1 },
    };
  }

  // 3. Center point of selected region in normalized coordinates [0, 1]
  const centerX = cleanX + cleanWidth / 2;
  const centerY = cleanY + cleanHeight / 2;

  // 4. Normalized translation percentage relative to center (0.5, 0.5)
  const rawPanX = (0.5 - centerX) * 100;
  const rawPanY = (0.5 - centerY) * 100;

  // 5. Edge Containment Bounding Box:
  // At scale S, max allowed translation before black border shows is ± 50 * (1 - 1/S) %
  const maxPan = 50 * (1 - 1 / scale);
  const panX = Math.max(-maxPan, Math.min(rawPanX, maxPan));
  const panY = Math.max(-maxPan, Math.min(rawPanY, maxPan));

  return {
    scale,
    panX: Math.round(panX * 100) / 100,
    panY: Math.round(panY * 100) / 100,
    region: {
      x: Math.round(cleanX * 1000) / 1000,
      y: Math.round(cleanY * 1000) / 1000,
      width: Math.round(cleanWidth * 1000) / 1000,
      height: Math.round(cleanHeight * 1000) / 1000,
    },
  };
}

/**
 * Calculates new pan offsets from drag pixel delta on a scaled viewport,
 * clamped strictly to content bounds.
 */
export function calculatePanDelta(
  deltaPixelsX: number,
  deltaPixelsY: number,
  renderedWidth: number,
  renderedHeight: number,
  currentScale: number,
  currentPanX: number,
  currentPanY: number
): { panX: number; panY: number } {
  if (currentScale <= 1.0 || renderedWidth <= 0 || renderedHeight <= 0) {
    return { panX: 0, panY: 0 };
  }

  const deltaPercentX = (deltaPixelsX / (renderedWidth * currentScale)) * 100;
  const deltaPercentY = (deltaPixelsY / (renderedHeight * currentScale)) * 100;

  const maxPan = 50 * (1 - 1 / currentScale);
  const nextPanX = Math.max(-maxPan, Math.min(currentPanX + deltaPercentX, maxPan));
  const nextPanY = Math.max(-maxPan, Math.min(currentPanY + deltaPercentY, maxPan));

  return {
    panX: Math.round(nextPanX * 100) / 100,
    panY: Math.round(nextPanY * 100) / 100,
  };
}

/**
 * Generates hardware-accelerated CSS transform style for presentation zoom.
 */
export function getZoomTransformStyle(
  zoom?: PresentationZoomState,
  isSmoothTransition: boolean = true
): React.CSSProperties {
  const scale = zoom?.scale || 1.0;
  const panX = zoom?.panX || 0;
  const panY = zoom?.panY || 0;

  return {
    transform: `scale(${scale}) translate(${panX}%, ${panY}%)`,
    transformOrigin: "center center",
    transition: isSmoothTransition ? "transform 220ms cubic-bezier(0.2, 0, 0, 1)" : "none",
    willChange: "transform",
  };
}
