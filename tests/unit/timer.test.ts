import { describe, it, expect } from "vitest";
import { formatTimeRemaining } from "@/lib/utils";

describe("Timer Architecture Utilities", () => {
  it("should correctly format remaining seconds into MM:SS display format", () => {
    expect(formatTimeRemaining(300)).toBe("05:00");
    expect(formatTimeRemaining(65)).toBe("01:05");
    expect(formatTimeRemaining(0)).toBe("00:00");
    expect(formatTimeRemaining(-10)).toBe("00:00");
  });
});
