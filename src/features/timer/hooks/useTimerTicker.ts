import { useEffect, useState } from "react";

/**
 * High-precision local UI ticker hook that forces a component re-render
 * every 200ms when a timer is running.
 * This guarantees smooth 1-second countdown ticks with 0ms skip/jump artifacts.
 */
export function useTimerTicker(isRunning: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!isRunning) return;

    // Immediately update now timestamp on start
    setNow(Date.now());

    const interval = setInterval(() => {
      setNow(Date.now());
    }, 200);

    return () => clearInterval(interval);
  }, [isRunning]);

  return now;
}
