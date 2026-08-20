/**
 * Screen Share Source Types
 *
 * Represents a realtime screen-share source owned by a Speaker.
 * This is conceptually separate from Materials (persistent presentation assets).
 * Screen sharing is a realtime source, not a material upload.
 */

export type ScreenShareStatus = "starting" | "active" | "stopped" | "failed";

export interface ScreenShareSource {
  /** Device ID of the Speaker who owns this source */
  deviceId: string;
  /** Display name of the Speaker */
  speakerName: string;
  /** Current lifecycle status */
  status: ScreenShareStatus;
  /** Epoch ms when screen sharing started */
  startedAt: number | null;
  /** Epoch ms when screen sharing stopped */
  stoppedAt: number | null;
  /** Epoch ms of last state update */
  updatedAt: number;
}
