import { DeviceRole } from "./device";
import { BriefUrgency } from "./brief";
import { TimerMode } from "./timer";
import { Material, NormalizedZoomRegion } from "./presentation";

export type StageCommandType =
  | "ROOM_CREATE"
  | "DEVICE_REQUEST_JOIN"
  | "DEVICE_APPROVE"
  | "DEVICE_REJECT"
  | "DEVICE_REMOVE"
  | "MATERIAL_ADD"
  | "MATERIAL_UPDATE"
  | "MATERIAL_REMOVE"
  | "PRESENTATION_START"
  | "PRESENTATION_EXIT"
  | "SLIDE_NEXT"
  | "SLIDE_PREVIOUS"
  | "SLIDE_GOTO"
  | "TIMER_SET"
  | "TIMER_START"
  | "TIMER_PAUSE"
  | "TIMER_RESET"
  | "BRIEF_UPDATE"
  | "BRIEF_CLEAR"
  | "DISPLAY_BLANK"
  | "DISPLAY_SHOW"
  | "MEDIA_PLAY"
  | "MEDIA_PAUSE"
  | "MEDIA_SEEK"
  | "MEDIA_STOP"
  | "MEDIA_DURATION_UPDATE"
  | "CONTROL_TAKEOVER"
  | "ZOOM_SET"
  | "ZOOM_RESET";

export interface BaseCommand {
  type: StageCommandType;
  commandId: string;
  senderDeviceId: string;
  timestamp: number;
}

export interface RoomCreateCommand extends BaseCommand {
  type: "ROOM_CREATE";
  payload: {
    title: string;
    hostUserId: string;
  };
}

export interface DeviceRequestJoinCommand extends BaseCommand {
  type: "DEVICE_REQUEST_JOIN";
  payload: {
    roomCode: string;
    deviceName: string;
    requestedRole: DeviceRole;
    userAgent: string;
  };
}

export interface DeviceApproveCommand extends BaseCommand {
  type: "DEVICE_APPROVE";
  payload: {
    targetDeviceId: string;
  };
}

export interface DeviceRejectCommand extends BaseCommand {
  type: "DEVICE_REJECT";
  payload: {
    targetDeviceId: string;
  };
}

export interface DeviceRemoveCommand extends BaseCommand {
  type: "DEVICE_REMOVE";
  payload: {
    targetDeviceId: string;
  };
}

export interface MaterialRemoveCommand extends BaseCommand {
  type: "MATERIAL_REMOVE";
  payload: {
    materialId: string;
  };
}

export interface PresentationStartCommand extends BaseCommand {
  type: "PRESENTATION_START";
  payload: {
    materialId: string;
    startPage?: number;
  };
}

export interface PresentationExitCommand extends BaseCommand {
  type: "PRESENTATION_EXIT";
  payload: Record<string, never>;
}

export interface SlideNextCommand extends BaseCommand {
  type: "SLIDE_NEXT";
  payload: Record<string, never>;
}

export interface SlidePreviousCommand extends BaseCommand {
  type: "SLIDE_PREVIOUS";
  payload: Record<string, never>;
}

export interface SlideGotoCommand extends BaseCommand {
  type: "SLIDE_GOTO";
  payload: {
    pageNumber: number;
  };
}

export interface TimerSetCommand extends BaseCommand {
  type: "TIMER_SET";
  payload: {
    duration: number; // in seconds
    mode?: TimerMode;
    label?: string;
  };
}

export interface TimerStartCommand extends BaseCommand {
  type: "TIMER_START";
  payload: Record<string, never>;
}

export interface TimerPauseCommand extends BaseCommand {
  type: "TIMER_PAUSE";
  payload: Record<string, never>;
}

export interface TimerResetCommand extends BaseCommand {
  type: "TIMER_RESET";
  payload: Record<string, never>;
}

export interface BriefUpdateCommand extends BaseCommand {
  type: "BRIEF_UPDATE";
  payload: {
    text: string;
    urgency: BriefUrgency;
  };
}

export interface BriefClearCommand extends BaseCommand {
  type: "BRIEF_CLEAR";
  payload: Record<string, never>;
}

export interface DisplayBlankCommand extends BaseCommand {
  type: "DISPLAY_BLANK";
  payload: {
    targetDisplayId?: string; // omit to blank all
    blank: boolean;
  };
}

export interface DisplayShowCommand extends BaseCommand {
  type: "DISPLAY_SHOW";
  payload: {
    targetDisplayId?: string;
  };
}

export interface MaterialAddCommand extends BaseCommand {
  type: "MATERIAL_ADD";
  payload: {
    material: Material;
  };
}

export interface MaterialUpdateCommand extends BaseCommand {
  type: "MATERIAL_UPDATE";
  payload: {
    material: Material;
  };
}

export interface MediaPlayCommand extends BaseCommand {
  type: "MEDIA_PLAY";
  payload?: {
    currentTime?: number;
  };
}

export interface MediaPauseCommand extends BaseCommand {
  type: "MEDIA_PAUSE";
  payload?: {
    currentTime?: number;
  };
}

export interface MediaSeekCommand extends BaseCommand {
  type: "MEDIA_SEEK";
  payload: {
    targetTime: number;
  };
}

export interface MediaStopCommand extends BaseCommand {
  type: "MEDIA_STOP";
  payload?: Record<string, never>;
}

export interface MediaDurationUpdateCommand extends BaseCommand {
  type: "MEDIA_DURATION_UPDATE";
  payload: {
    duration: number;
  };
}

export interface ControlTakeoverCommand extends BaseCommand {
  type: "CONTROL_TAKEOVER";
  payload: {
    reason?: string;
  };
}

export interface ZoomSetCommand extends BaseCommand {
  type: "ZOOM_SET";
  payload: {
    scale: number;
    panX?: number;
    panY?: number;
    region?: NormalizedZoomRegion;
  };
}

export interface ZoomResetCommand extends BaseCommand {
  type: "ZOOM_RESET";
  payload?: Record<string, never>;
}

export type StageCommand =
  | RoomCreateCommand
  | DeviceRequestJoinCommand
  | DeviceApproveCommand
  | DeviceRejectCommand
  | DeviceRemoveCommand
  | MaterialAddCommand
  | MaterialUpdateCommand
  | MaterialRemoveCommand
  | PresentationStartCommand
  | PresentationExitCommand
  | SlideNextCommand
  | SlidePreviousCommand
  | SlideGotoCommand
  | TimerSetCommand
  | TimerStartCommand
  | TimerPauseCommand
  | TimerResetCommand
  | BriefUpdateCommand
  | BriefClearCommand
  | DisplayBlankCommand
  | DisplayShowCommand
  | MediaPlayCommand
  | MediaPauseCommand
  | MediaSeekCommand
  | MediaStopCommand
  | MediaDurationUpdateCommand
  | ControlTakeoverCommand
  | ZoomSetCommand
  | ZoomResetCommand;
