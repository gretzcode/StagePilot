import { StageSessionState, AvailableSource } from "@/core/types";

/**
 * Computes all available presentation sources from the room state.
 *
 * Rules:
 * - Material sources: included if status !== "deleted"
 * - Screen share sources: included if status === "active"
 * - isLive is true ONLY if state.liveSource matches this source's type and id
 */
export function getAvailableSources(state: StageSessionState | null): AvailableSource[] {
  if (!state) return [];

  const sources: AvailableSource[] = [];
  const liveSource = state.liveSource;

  // Active Screen Share Sources (Ephemeral active realtime streams from Speakers)
  if (state.screenShareSources) {
    for (const [deviceId, screenSource] of Object.entries(state.screenShareSources)) {
      if (screenSource.status !== "active") continue;

      const isLive = Boolean(
        liveSource?.type === "screen_share" && liveSource.id === deviceId
      );

      sources.push({
        id: deviceId,
        type: "screen_share",
        title: `${screenSource.speakerName} — Screen Share`,
        ownerDeviceId: deviceId,
        ownerName: screenSource.speakerName,
        ownerRole: "speaker",
        status: isLive ? "live" : "available",
        isLive,
        createdAt: screenSource.startedAt || undefined,
      });
    }
  }

  return sources;
}
