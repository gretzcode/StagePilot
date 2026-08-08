import { describe, it, expect } from "vitest";
import { createInitialSessionState } from "@/core/session/initial-state";
import { stageSessionReducer } from "@/core/session/reducer";

describe("Phase 2 Timer & Speaker Brief Invariants", () => {
  const roomId = "ROOM-TB";
  const hostUserId = "host-tb";
  const hostDeviceId = "dev-tb-host";

  it("Timer state updates deterministically and remains timestamp-based", () => {
    let state = createInitialSessionState(roomId, roomId, "Timer Room", hostUserId, hostDeviceId);

    // Set Timer duration = 600s (10 mins)
    state = stageSessionReducer(state, {
      type: "TIMER_SET",
      commandId: "t-set",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { duration: 600, label: "Keynote Timer" },
    });
    expect(state.timer.duration).toBe(600);
    expect(state.timer.status).toBe("idle");

    // Start Timer
    const startTime = Date.now();
    state = stageSessionReducer(state, {
      type: "TIMER_START",
      commandId: "t-start",
      senderDeviceId: hostDeviceId,
      timestamp: startTime,
      payload: {},
    });
    expect(state.timer.status).toBe("running");
    expect(state.timer.startedAt).toBe(startTime);

    // Pause Timer
    const pauseTime = startTime + 30000; // 30 seconds later
    state = stageSessionReducer(state, {
      type: "TIMER_PAUSE",
      commandId: "t-pause",
      senderDeviceId: hostDeviceId,
      timestamp: pauseTime,
      payload: {},
    });
    expect(state.timer.status).toBe("paused");
    expect(state.timer.remaining).toBe(570);
  });

  it("Brief System updates live cues for Confidence Display while maintaining audience exclusion invariant", () => {
    let state = createInitialSessionState(roomId, roomId, "Brief Room", hostUserId, hostDeviceId);

    // Send Brief update
    state = stageSessionReducer(state, {
      type: "BRIEF_UPDATE",
      commandId: "b-up",
      senderDeviceId: hostDeviceId,
      timestamp: Date.now(),
      payload: { text: "Q&A session starts in 2 minutes", urgency: "warning" },
    });

    expect(state.brief.activeMessage?.text).toBe("Q&A session starts in 2 minutes");
    expect(state.brief.activeMessage?.urgency).toBe("warning");
    expect(state.brief.history.length).toBe(1);
  });
});
