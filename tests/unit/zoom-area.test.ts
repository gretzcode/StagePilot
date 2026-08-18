import { describe, it, expect } from "vitest";
import {
  calculateZoomFromRegion,
  calculatePanDelta,
  getZoomTransformStyle,
} from "@/features/material/utils/zoom-calculator";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { StageCommand } from "@/core/types";

describe("Synchronized Presentation Zoom Area", () => {
  describe("zoom-calculator mathematical model", () => {
    it("returns normal 1.0 zoom for full slide selection (0,0 to 1,1)", () => {
      const result = calculateZoomFromRegion({
        x: 0,
        y: 0,
        width: 1,
        height: 1,
      });

      expect(result.scale).toBe(1.0);
      expect(result.panX).toBe(0);
      expect(result.panY).toBe(0);
    });

    it("calculates exact 2.0x centered zoom for 50% central region", () => {
      const result = calculateZoomFromRegion({
        x: 0.25,
        y: 0.25,
        width: 0.5,
        height: 0.5,
      });

      expect(result.scale).toBe(2.0);
      expect(result.panX).toBe(0);
      expect(result.panY).toBe(0);
    });

    it("calculates correct offset and clamps pan to content boundaries for top-left selection", () => {
      const result = calculateZoomFromRegion({
        x: 0,
        y: 0,
        width: 0.5,
        height: 0.5,
      });

      expect(result.scale).toBe(2.0);
      // Center is (0.25, 0.25) -> rawPan is +25%
      // maxPan at 2.0x is 50 * (1 - 1/2) = 25%
      expect(result.panX).toBe(25);
      expect(result.panY).toBe(25);
    });

    it("calculates correct offset and clamps pan for bottom-right selection", () => {
      const result = calculateZoomFromRegion({
        x: 0.5,
        y: 0.5,
        width: 0.5,
        height: 0.5,
      });

      expect(result.scale).toBe(2.0);
      // Center is (0.75, 0.75) -> rawPan is -25%
      expect(result.panX).toBe(-25);
      expect(result.panY).toBe(-25);
    });

    it("preserves aspect ratio for arbitrary rectangular selections", () => {
      // 80% width, 20% height
      const result = calculateZoomFromRegion({
        x: 0.1,
        y: 0.4,
        width: 0.8,
        height: 0.2,
      });

      // min(1/0.8, 1/0.2) = min(1.25, 5.0) = 1.25
      expect(result.scale).toBe(1.25);
      expect(result.panX).toBe(0);
      expect(result.panY).toBe(0);
    });

    it("caps scale at maximum limit (5.0x)", () => {
      const result = calculateZoomFromRegion(
        {
          x: 0.45,
          y: 0.45,
          width: 0.02,
          height: 0.02,
        },
        5.0
      );

      expect(result.scale).toBe(5.0);
    });

    it("handles zero or out-of-bounds coordinates safely", () => {
      const result = calculateZoomFromRegion({
        x: -0.5,
        y: 1.5,
        width: 0,
        height: 0,
      });

      expect(result.scale).toBeGreaterThanOrEqual(1.0);
      expect(isNaN(result.panX)).toBe(false);
      expect(isNaN(result.panY)).toBe(false);
    });
  });

  describe("pan offset calculation", () => {
    it("returns zero pan if scale is 1.0", () => {
      const result = calculatePanDelta(100, 100, 1920, 1080, 1.0, 0, 0);
      expect(result.panX).toBe(0);
      expect(result.panY).toBe(0);
    });

    it("calculates resolution-independent percentage delta on scaled viewport", () => {
      const result = calculatePanDelta(
        192, // 10% of 1920 width
        0,
        1920,
        1080,
        2.0, // 2.0x scale
        0,
        0
      );

      // deltaPercentX = (192 / (1920 * 2)) * 100 = 5%
      expect(result.panX).toBe(5);
      expect(result.panY).toBe(0);
    });
  });

  describe("CSS transform generator", () => {
    it("generates valid CSS transform with scale and translate", () => {
      const style = getZoomTransformStyle({
        scale: 2.5,
        panX: 12.5,
        panY: -10,
      });

      expect(style.transform).toBe("scale(2.5) translate(12.5%, -10%)");
      expect(style.transformOrigin).toBe("center center");
      expect(style.willChange).toBe("transform");
    });
  });

  describe("Lifecycle & Session Reducer synchronization", () => {
    it("resets zoom on SLIDE_NEXT", () => {
      const initialState = createInitialSessionState("test-room", "ROOM123", "Test Room", "host-1");
      initialState.presentation.isPresenting = true;
      initialState.presentation.materialId = "mat-1";
      initialState.presentation.totalSlides = 5;
      initialState.presentation.currentSlide = 1;
      initialState.presentation.zoom = { scale: 2.5, panX: 10, panY: 10 };

      const nextCommand: StageCommand = {
        type: "SLIDE_NEXT",
        commandId: "cmd-1",
        senderDeviceId: "host-1",
        timestamp: Date.now(),
      };

      const newState = stageSessionReducer(initialState, nextCommand);
      expect(newState.presentation.currentSlide).toBe(2);
      expect(newState.presentation.zoom).toEqual({
        scale: 1.0,
        panX: 0,
        panY: 0,
        updatedAt: expect.any(Number),
      });
    });

    it("resets zoom on SLIDE_PREVIOUS", () => {
      const initialState = createInitialSessionState("test-room", "ROOM123", "Test Room", "host-1");
      initialState.presentation.isPresenting = true;
      initialState.presentation.materialId = "mat-1";
      initialState.presentation.totalSlides = 5;
      initialState.presentation.currentSlide = 3;
      initialState.presentation.zoom = { scale: 3.0, panX: -15, panY: 20 };

      const prevCommand: StageCommand = {
        type: "SLIDE_PREVIOUS",
        commandId: "cmd-2",
        senderDeviceId: "host-1",
        timestamp: Date.now(),
      };

      const newState = stageSessionReducer(initialState, prevCommand);
      expect(newState.presentation.currentSlide).toBe(2);
      expect(newState.presentation.zoom).toEqual({
        scale: 1.0,
        panX: 0,
        panY: 0,
        updatedAt: expect.any(Number),
      });
    });

    it("resets zoom on SLIDE_GOTO", () => {
      const initialState = createInitialSessionState("test-room", "ROOM123", "Test Room", "host-1");
      initialState.presentation.isPresenting = true;
      initialState.presentation.materialId = "mat-1";
      initialState.presentation.totalSlides = 10;
      initialState.presentation.currentSlide = 2;
      initialState.presentation.zoom = { scale: 2.0, panX: 5, panY: 5 };

      const gotoCommand: StageCommand = {
        type: "SLIDE_GOTO",
        commandId: "cmd-3",
        senderDeviceId: "host-1",
        timestamp: Date.now(),
        payload: { pageNumber: 7 },
      };

      const newState = stageSessionReducer(initialState, gotoCommand);
      expect(newState.presentation.currentSlide).toBe(7);
      expect(newState.presentation.zoom).toEqual({
        scale: 1.0,
        panX: 0,
        panY: 0,
        updatedAt: expect.any(Number),
      });
    });

    it("updates zoom state on ZOOM_SET and clamps boundaries", () => {
      const initialState = createInitialSessionState("test-room", "ROOM123", "Test Room", "host-1");
      initialState.presentation.isPresenting = true;

      const zoomCommand: StageCommand = {
        type: "ZOOM_SET",
        commandId: "cmd-4",
        senderDeviceId: "host-1",
        timestamp: Date.now(),
        payload: {
          scale: 2.0,
          panX: 10,
          panY: -15,
          region: { x: 0.2, y: 0.3, width: 0.5, height: 0.5 },
        },
      };

      const newState = stageSessionReducer(initialState, zoomCommand);
      expect(newState.presentation.zoom?.scale).toBe(2.0);
      expect(newState.presentation.zoom?.panX).toBe(10);
      expect(newState.presentation.zoom?.panY).toBe(-15);
      expect(newState.presentation.zoom?.region).toEqual({
        x: 0.2,
        y: 0.3,
        width: 0.5,
        height: 0.5,
      });
    });

    it("resets zoom on ZOOM_RESET", () => {
      const initialState = createInitialSessionState("test-room", "ROOM123", "Test Room", "host-1");
      initialState.presentation.isPresenting = true;
      initialState.presentation.zoom = { scale: 3.5, panX: 20, panY: -20 };

      const resetCommand: StageCommand = {
        type: "ZOOM_RESET",
        commandId: "cmd-5",
        senderDeviceId: "host-1",
        timestamp: Date.now(),
      };

      const newState = stageSessionReducer(initialState, resetCommand);
      expect(newState.presentation.zoom).toEqual({
        scale: 1.0,
        panX: 0,
        panY: 0,
        updatedAt: expect.any(Number),
      });
    });
  });
});
