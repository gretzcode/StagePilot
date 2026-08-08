export type TimerMode = "countdown" | "countup" | "timeofday";
export type TimerStatus = "idle" | "running" | "paused" | "expired";

export interface TimerState {
  mode: TimerMode;
  status: TimerStatus;
  duration: number; // in seconds
  startedAt: number | null; // ms timestamp
  pausedAt: number | null; // ms timestamp
  remaining: number; // calculated remaining seconds at last update
  label?: string;
  updatedAt: number;
}
