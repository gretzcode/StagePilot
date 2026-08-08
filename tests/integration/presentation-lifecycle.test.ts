import { describe, it, expect } from "vitest";
import { createInitialSessionState } from "@/core/session/initial-state";
import { CommandDispatcher } from "@/core/commands/dispatcher";

describe("Phase 2 Presentation Lifecycle Integration Tests", () => {
  const roomId = "ROOM-LIFE";
  const hostUserId = "host-life";
  const hostDeviceId = "dev-life-host";

  it("Executes complete presentation lifecycle: Start -> Next -> Previous -> Goto -> Blank -> Exit", () => {
    let state = createInitialSessionState(roomId, roomId, "Lifecycle Room", hostUserId, hostDeviceId);

    // Register material deck
    state.materials.push({
      id: "mat-deck-1",
      name: "Keynote Presentation.pdf",
      type: "pdf",
      url: "http://example.com/keynote.pdf",
      totalPages: 10,
      slides: Array.from({ length: 10 }, (_, i) => ({ index: i + 1, title: `Slide ${i + 1}` })),
      uploadedAt: Date.now(),
      status: "ready",
    });

    // 1. PRESENTATION_START
    state = CommandDispatcher.dispatch(state, {
      type: "PRESENTATION_START",
      commandId: "cmd-start",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { materialId: "mat-deck-1", startPage: 1 },
    });
    expect(state.presentation.isPresenting).toBe(true);
    expect(state.presentation.currentPage).toBe(1);
    expect(state.presentation.currentSlide?.index).toBe(1);
    expect(state.presentation.nextSlide?.index).toBe(2);

    // 2. SLIDE_NEXT
    state = CommandDispatcher.dispatch(state, {
      type: "SLIDE_NEXT",
      commandId: "cmd-next-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    });
    expect(state.presentation.currentPage).toBe(2);
    expect(state.presentation.nextSlide?.index).toBe(3);

    // 3. SLIDE_PREVIOUS
    state = CommandDispatcher.dispatch(state, {
      type: "SLIDE_PREVIOUS",
      commandId: "cmd-prev-1",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    });
    expect(state.presentation.currentPage).toBe(1);

    // 4. SLIDE_GOTO page 5
    state = CommandDispatcher.dispatch(state, {
      type: "SLIDE_GOTO",
      commandId: "cmd-goto-5",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { pageNumber: 5 },
    });
    expect(state.presentation.currentPage).toBe(5);

    // 5. DISPLAY_BLANK
    state = CommandDispatcher.dispatch(state, {
      type: "DISPLAY_BLANK",
      commandId: "cmd-blank",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { blank: true },
    });
    expect(state.presentation.blanked).toBe(true);

    // 6. PRESENTATION_EXIT
    state = CommandDispatcher.dispatch(state, {
      type: "PRESENTATION_EXIT",
      commandId: "cmd-exit",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: {},
    });
    expect(state.presentation.isPresenting).toBe(false);
  });
});
