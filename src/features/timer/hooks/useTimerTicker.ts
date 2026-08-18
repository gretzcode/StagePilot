import { useEffect, useState } from "react";
import { getSyncedNow } from "@/core/utils/clock-sync";

/**
 * High-precision local UI ticker hook that forces a component re-render
 * every 200ms when a timer is running.
 * Uses synchronized server clock to guarantee identical seconds countdown across all devices.
 */
export function useTimerTicker(isRunning: boolean): number {
  const [now, setNow] = useState(() => getSyncedNow());

  useEffect(() => {
    if (!isRunning) return;

    // Immediately update now timestamp on start
    setNow(getSyncedNow());

    const interval = setInterval(() => {
      setNow(getSyncedNow());
    }, 200);

    return () => clearInterval(interval);
  }, [isRunning]);

  return now;
}
