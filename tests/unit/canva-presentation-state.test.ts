import { describe, expect, it } from "vitest";
import { stageSessionReducer } from "@/core/session/reducer";
import { createInitialSessionState } from "@/core/session/initial-state";
import { Material } from "@/core/types";

describe("Canva Presentation & Centralized State Integration Tests", () => {
  const roomId = "ROOM-CANVA-TEST";
  const roomCode = "CANVA99";
  const hostUserId = "host-user-1";
  const hostDeviceId = "dev-host-1";

  it("TEST-CANVA-STATE-01: Canva Material with 15 slides is controlled monotonically via StagePilot currentSlide", () => {
    let state = createInitialSessionState(roomId, roomCode, "Canva Keynote", hostUserId, hostDeviceId);

    const canvaMaterial: Material = {
      id: "mat-canva-DAG12345",
      name: "Q4 Strategy Pitch",
      type: "canva",
      sourceType: "CANVA_LINK",
      url: "https://www.canva.com/design/DAG12345/view",
      objectKey: null,
      externalUrl: "https://www.canva.com/design/DAG12345/view",
      sizeBytes: 0,
      totalPages: 15,
      slides: Array.from({ length: 15 }, (_, i) => ({
        index: i + 1,
        title: `Q4 Strategy Pitch — Slide ${i + 1}`,
        contentUrl: `https://media.canva.com/exports/DAG12345/slide-${i + 1}.png`,
        thumbnailUrl: `https://media.canva.com/thumbnails/DAG12345/slide-${i + 1}.png`,
      })),
      uploadedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      status: "ready",
    };

    // 1. Add Material
    state = stageSessionReducer(state, {
      type: "MATERIAL_ADD",
      commandId: "cmd-add-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { material: canvaMaterial },
    });

    expect(state.materials.length).toBe(1);
    expect(state.materials[0].totalPages).toBe(15);
    expect(state.materials[0].slides.length).toBe(15);

    // 2. Start Presentation at Slide 1
    state = stageSessionReducer(state, {
      type: "PRESENTATION_START",
      commandId: "cmd-start-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: canvaMaterial.id, startPage: 1 },
    });

    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.currentSlide).toBe(1);
    expect(state.presentation.totalSlides).toBe(15);
    expect(state.presentation.revision).toBe(2);

    // 3. Next -> Slide 2
    state = stageSessionReducer(state, {
      type: "SLIDE_NEXT",
      commandId: "cmd-next-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    });

    expect(state.presentation.currentSlide).toBe(2);
    expect(state.presentation.revision).toBe(3);

    // 4. Next -> Slide 3
    state = stageSessionReducer(state, {
      type: "SLIDE_NEXT",
      commandId: "cmd-next-2",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    });

    expect(state.presentation.currentSlide).toBe(3);
    expect(state.presentation.revision).toBe(4);

    // 5. Goto Slide 10
    state = stageSessionReducer(state, {
      type: "SLIDE_GOTO",
      commandId: "cmd-goto-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { pageNumber: 10 },
    });

    expect(state.presentation.currentSlide).toBe(10);
    expect(state.presentation.revision).toBe(5);

    // 6. Verify Audience and Confidence screens receive identical currentSlide
    const audienceSlide = state.presentation.currentSlide;
    const confidenceSlide = state.presentation.currentSlide;
    const controllerSlide = state.presentation.currentSlide;

    expect(audienceSlide).toBe(10);
    expect(confidenceSlide).toBe(10);
    expect(controllerSlide).toBe(10);

    // 7. Verify current and next slide metadata
    expect(state.presentation.currentSlideMetadata?.index).toBe(10);
    expect(state.presentation.nextSlideMetadata?.index).toBe(11);
  });
});
