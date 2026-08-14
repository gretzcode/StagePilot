import { StageCommand, StageSessionState } from "../types";
import { stageSessionReducer } from "../session/reducer";
import { InvalidCommandError } from "../errors/domain-error";
import {
  BriefUpdateSchema,
  BriefClearSchema,
  ControlTakeoverSchema,
  DeviceApproveSchema,
  DeviceRejectSchema,
  DeviceRemoveSchema,
  DeviceRequestJoinSchema,
  DisplayBlankSchema,
  PresentationStartSchema,
  RoomCreateSchema,
  SlideGotoSchema,
  TimerSetSchema,
} from "./validators";

export class CommandDispatcher {
  static validatePayload(command: StageCommand): void {
    try {
      switch (command.type) {
        case "ROOM_CREATE":
          RoomCreateSchema.parse(command.payload);
          break;
        case "DEVICE_REQUEST_JOIN":
          DeviceRequestJoinSchema.parse(command.payload);
          break;
        case "DEVICE_APPROVE":
          DeviceApproveSchema.parse(command.payload);
          break;
        case "DEVICE_REJECT":
          DeviceRejectSchema.parse(command.payload);
          break;
        case "DEVICE_REMOVE":
          DeviceRemoveSchema.parse(command.payload);
          break;
        case "PRESENTATION_START":
          PresentationStartSchema.parse(command.payload);
          break;
        case "SLIDE_GOTO":
          SlideGotoSchema.parse(command.payload);
          break;
        case "TIMER_SET":
          TimerSetSchema.parse(command.payload);
          break;
        case "BRIEF_UPDATE":
          BriefUpdateSchema.parse(command.payload);
          break;
        case "BRIEF_CLEAR":
          BriefClearSchema.parse(command.payload);
          break;
        case "DISPLAY_BLANK":
          DisplayBlankSchema.parse(command.payload);
          break;
        case "CONTROL_TAKEOVER":
          ControlTakeoverSchema.parse(command.payload);
          break;
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        throw new InvalidCommandError(`Invalid command payload for ${command.type}: ${err.message}`);
      }
      throw new InvalidCommandError(`Invalid command payload for ${command.type}`);
    }
  }

  static dispatch(state: StageSessionState, command: StageCommand): StageSessionState {
    this.validatePayload(command);
    return stageSessionReducer(state, command);
  }
}
