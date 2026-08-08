import { describe, it, expect } from "vitest";
import { CommandDispatcher } from "@/core/commands/dispatcher";
import { createInitialSessionState } from "@/core/session/initial-state";
import { StageCommand } from "@/core/types";

describe("CommandDispatcher Integration", () => {
  it("should validate payload schema and execute state transition", () => {
    const hostId = "host-user-1";
    const hostDevId = "dev-host-1";
    const initialState = createInitialSessionState("ROOM01", "ROOM01", "Test Room", hostId, hostDevId);

    const cmd: StageCommand = {
      type: "TIMER_SET",
      commandId: "c-timer-1",
      senderDeviceId: hostDevId,
      timestamp: Date.now(),
      payload: {
        duration: 900,
        mode: "countdown",
        label: "Main Keynote",
      },
    };

    const nextState = CommandDispatcher.dispatch(initialState, cmd);
    expect(nextState.timer.duration).toBe(900);
    expect(nextState.timer.label).toBe("Main Keynote");
    expect(nextState.version).toBe(initialState.version + 1);
  });
});
