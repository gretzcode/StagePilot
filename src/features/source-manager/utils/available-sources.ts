import { StageSessionState, AvailableSource } from "@/core/types";

/**
 * Computes all available presentation sources from the room state.
 *
 * Rules:
 * - Screen share sources: included if status === "active"
 * - Speaker materials: included if material.ownerRole === "speaker" or uploaded by speaker
 * - Active prepared material: included if currently selected for presentation
 * - isLive is true ONLY if state.liveSource matches this source's type and id
 */
export function getAvailableSources(state: StageSessionState | null): AvailableSource[] {
  if (!state) return [];

  const sources: AvailableSource[] = [];
  const liveSource = state.liveSource;

  // 1. Active Screen Share Sources (Ephemeral active realtime streams from Speakers)
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

  // 2. Speaker Materials (Materials owned by speakers or active in presentation)
  if (state.materials) {
    for (const mat of state.materials) {
      if (mat.status === "deleted") continue;

      const isSpeakerMaterial =
        mat.ownerRole === "speaker" ||
        (mat.ownerDeviceId && state.devices[mat.ownerDeviceId]?.role === "speaker");

      if (isSpeakerMaterial || (state.presentation?.materialId === mat.id && mat.ownerRole !== "host")) {
        const isLive = Boolean(
          liveSource?.type === "material" && liveSource.id === mat.id
        );

        if (!sources.some((s) => s.id === mat.id && s.type === "material")) {
          sources.push({
            id: mat.id,
            type: "material",
            title: `${mat.ownerName || "Speaker"} — ${mat.name}`,
            ownerDeviceId: mat.ownerDeviceId,
            ownerName: mat.ownerName || "Speaker",
            ownerRole: "speaker",
            status: isLive ? "live" : "available",
            isLive,
            totalPages: mat.totalPages || mat.slides?.length || 1,
            mediaType: mat.type,
            createdAt: mat.uploadedAt || undefined,
          });
        }
      }
    }
  }

  return sources;
}
