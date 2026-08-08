export const APP_CONFIG = {
  name: "StagePilot",
  version: "0.1.0-phase0",
  description: "Realtime Stage Control System for VJs, Show Callers, & Event Technical Crews",
  defaultTimerDuration: 300, // 5 minutes in seconds
  roomCodeLength: 6,
  heartbeatIntervalMs: 15000,
  maxReconnectAttempts: 10,
  supportedRoles: ["host", "control", "audience", "confidence"] as const,
  supportedMaterialTypes: ["pdf", "pptx", "url", "image"] as const,
};
