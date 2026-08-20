/**
 * StagePilot Source Manager & Live Source Types
 *
 * Distinct from persistent Materials and ephemeral Screen Shares:
 * - Material: Persistent presentation asset (PDF, Canva, Video, URL)
 * - ScreenShareSource: Ephemeral realtime screen stream from a Speaker
 * - LiveSourceReference: Authoritative pointer to which source is currently LIVE on stage
 */

export type SourceType = "material" | "screen_share";

export interface LiveSourceReference {
  /** Type of the live source */
  type: SourceType;
  /** Identifier: materialId for material, deviceId for screen_share */
  id: string;
  /** Owner device ID */
  ownerDeviceId?: string;
  /** Display name of the source owner */
  ownerName?: string;
  /** Role of the source owner */
  ownerRole?: "host" | "speaker" | "operator";
  /** Descriptive title / name of the source */
  title: string;
  /** Epoch timestamp when this source was taken LIVE */
  takenLiveAt: number;
}

export type SourceAvailabilityStatus = "available" | "live" | "offline" | "stopped" | "unavailable";

export interface AvailableSource {
  /** Unique identifier for the source */
  id: string;
  /** Type of source */
  type: SourceType;
  /** Display title */
  title: string;
  /** Owner device ID */
  ownerDeviceId?: string;
  /** Owner name for badge */
  ownerName?: string;
  /** Owner role for badge */
  ownerRole?: "host" | "speaker" | "operator";
  /** Current status */
  status: SourceAvailabilityStatus;
  /** Whether this source is currently LIVE on stage */
  isLive: boolean;
  /** Number of pages/slides if applicable */
  totalPages?: number;
  /** Associated media / material type if material */
  mediaType?: string;
  /** Epoch timestamp when source was added/started */
  createdAt?: number;
}
