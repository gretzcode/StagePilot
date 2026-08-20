import { describe, it, expect, beforeEach } from "vitest";
import { updateServerTimeOffset, getSyncedNow, getServerTimeOffset, resetClockSync } from "@/core/utils/clock-sync";
import { formatStageTimer } from "@/features/timer/utils/timer-formatter";

describe("Clock Sync & Timer Skew Compensation", () => {
  beforeEach(() => {
    resetClockSync();
  });

  it("calculates correct server offset when local clock is ahead", () => {
    const localNow = Date.now();
    const serverTimestamp = localNow - 44000; // Client is 44s ahead of server

    updateServerTimeOffset(serverTimestamp, localNow);

    expect(getServerTimeOffset()).toBe(-44000);
    expect(Math.abs(getSyncedNow() - serverTimestamp)).toBeLessThanOrEqual(5);
  });

  it("calculates correct server offset when local clock is behind", () => {
    const localNow = Date.now();
    const serverTimestamp = localNow + 30000; // Client is 30s behind server

    updateServerTimeOffset(serverTimestamp, localNow);

    expect(getServerTimeOffset()).toBe(30000);
    expect(Math.abs(getSyncedNow() - serverTimestamp)).toBeLessThanOrEqual(5);
  });

  it("formats 10-minute timer as 10:00 or 09:59 on first second even with 44s clock skew", () => {
    const serverStartedAt = 1000000;
    // Client device local time is 44 seconds ahead (1044000)
    const localClientNow = 1044000;
    
    // Without sync: localClientNow - serverStartedAt = 44s elapsed -> 09:16!
    const unadjustedResult = formatStageTimer("running", 600, 600, serverStartedAt, localClientNow);
    expect(unadjustedResult.formattedTime).toBe("09:16");

    // With sync: update server time offset (-44000ms)
    updateServerTimeOffset(serverStartedAt, localClientNow); // server timestamp is 1000000, local is 1044000

    // Adjusted now:
    const adjustedNow = localClientNow + getServerTimeOffset(); // 1000000
    const syncedResult = formatStageTimer("running", 600, 600, serverStartedAt, adjustedNow);

    expect(syncedResult.formattedTime).toBe("10:00");
  });
});
