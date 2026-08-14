import { z } from "zod";

export const DeviceRoleSchema = z.enum(["host", "control", "audience", "confidence"]);
export const BriefUrgencySchema = z.enum(["info", "warning", "urgent"]);
export const TimerModeSchema = z.enum(["countdown", "countup", "timeofday"]);

export const RoomCreateSchema = z.object({
  title: z.string().min(1).max(100),
  hostUserId: z.string().min(1),
});

export const DeviceRequestJoinSchema = z.object({
  roomCode: z.string().min(4).max(10),
  deviceName: z.string().min(1).max(50),
  requestedRole: DeviceRoleSchema,
  userAgent: z.string(),
});

export const DeviceApproveSchema = z.object({
  targetDeviceId: z.string().min(1),
});

export const DeviceRejectSchema = z.object({
  targetDeviceId: z.string().min(1),
});

export const DeviceRemoveSchema = z.object({
  targetDeviceId: z.string().min(1),
});

export const PresentationStartSchema = z.object({
  materialId: z.string().min(1),
  startPage: z.number().int().positive().optional(),
});

export const SlideGotoSchema = z.object({
  pageNumber: z.number().int().positive(),
});

export const TimerSetSchema = z.object({
  duration: z.number().positive(),
  mode: TimerModeSchema.optional(),
  label: z.string().optional(),
});

export const BriefUpdateSchema = z.object({
  text: z.string().min(1).max(500),
  urgency: BriefUrgencySchema,
});

export const BriefClearSchema = z.object({});

export const DisplayBlankSchema = z.object({
  targetDisplayId: z.string().optional(),
  blank: z.boolean(),
});

export const ControlTakeoverSchema = z.object({
  reason: z.string().optional(),
});
