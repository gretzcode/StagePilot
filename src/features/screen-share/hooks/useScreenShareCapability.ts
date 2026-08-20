"use client";

import { useState, useEffect } from "react";

export type ScreenShareCapability = "supported" | "unsupported" | "unknown";

/**
 * Detects whether the current browser/device supports screen sharing.
 * Uses actual API capability detection rather than user-agent sniffing.
 */
export function useScreenShareCapability(): ScreenShareCapability {
  const [capability, setCapability] = useState<ScreenShareCapability>("unknown");

  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setCapability("unsupported");
      return;
    }

    try {
      if (
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getDisplayMedia === "function"
      ) {
        setCapability("supported");
      } else {
        setCapability("unsupported");
      }
    } catch {
      setCapability("unsupported");
    }
  }, []);

  return capability;
}
