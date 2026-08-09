import { TimerStatus } from "@/core/types";

export interface FormattedTimerResult {
  formattedTime: string;
  isOvertime: boolean;
  isWarning: boolean;
  isCritical: boolean;
  isFinished: boolean;
  remainingSeconds: number;
}

/**
 * Format stage timer countdown and overtime calculation.
 * When elapsed time > duration, automatically switches to negative overtime increment count (e.g. -00:01, -01:15).
 */
export function formatStageTimer(
  status: TimerStatus,
  duration: number,
  remaining: number,
  startedAt: number | null,
  now = Date.now()
): FormattedTimerResult {
  let isOvertime = false;
  let diffSeconds = remaining;

  if (status === "running" && startedAt) {
    const elapsedSeconds = Math.floor((now - startedAt) / 1000);
    if (elapsedSeconds > duration) {
      isOvertime = true;
      diffSeconds = elapsedSeconds - duration;
    } else {
      diffSeconds = duration - elapsedSeconds;
    }
  } else if (status === "paused" && remaining < 0) {
    isOvertime = true;
    diffSeconds = Math.abs(remaining);
  }

  const mins = Math.floor(diffSeconds / 60);
  const secs = diffSeconds % 60;
  const formattedTime = `${isOvertime ? "-" : ""}${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const remainingSeconds = isOvertime ? -diffSeconds : diffSeconds;
  const isWarning = !isOvertime && remainingSeconds > 0 && remainingSeconds <= 120;
  const isCritical = !isOvertime && remainingSeconds > 0 && remainingSeconds <= 30;
  const isFinished = isOvertime || (remainingSeconds === 0 && status === "running");

  return {
    formattedTime,
    isOvertime,
    isWarning,
    isCritical,
    isFinished,
    remainingSeconds,
  };
}
