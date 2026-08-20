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

  // 1. Materials (Host, Speaker, Operator)
  if (Array.isArray(state.materials)) {
    for (const mat of state.materials) {
      if (mat.status === "deleted") continue;

      const isLive = Boolean(
        liveSource?.type === "material" && liveSource.id === mat.id
      );

      sources.push({
        id: mat.id,
        type: "material",
        title: mat.name,
        ownerDeviceId: mat.ownerDeviceId,
        ownerName: mat.ownerName || (mat.ownerRole === "host" ? "Host" : undefined),
        ownerRole: mat.ownerRole || (mat.ownerDeviceId ? "speaker" : "host"),
        status: isLive ? "live" : mat.status === "ready" ? "available" : "unavailable",
        isLive,
        totalPages: mat.totalPages || mat.slides?.length || 1,
        mediaType: mat.type || mat.mediaType,
        createdAt: mat.uploadedAt,
      });
    }
  }

  // 2. Screen Share Sources (Ephemeral active streams)
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
