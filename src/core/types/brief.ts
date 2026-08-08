export type BriefUrgency = "info" | "warning" | "urgent";

export interface BriefMessage {
  id: string;
  text: string;
  urgency: BriefUrgency;
  createdAt: number;
  authorDeviceId: string;
}

export interface BriefState {
  activeMessage: BriefMessage | null;
  history: BriefMessage[];
  updatedAt: number;
}
