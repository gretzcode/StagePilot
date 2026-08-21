import { ParticipantRole } from "@/core/types";

/**
 * Standardized URL Route Builders for StagePilot.
 *
 * Ensures:
 * 1. Consistent query parameter names (`roomCode`, `role`, `grant`, `redirect`, `deviceId`).
 * 2. Proper percent-encoding of all dynamic values and nested redirect targets.
 * 3. Consistent casing (room codes always uppercase, roles always normalized).
 * 4. Single source of truth for all page and API routes across the application.
 */

export const ROUTES = {
  home: () => "/",

  login: (redirectUrl?: string) => {
    if (!redirectUrl) return "/login";
    return `/login?redirect=${encodeURIComponent(redirectUrl)}`;
  },

  dashboard: () => "/dashboard",

  join: (options?: { roomCode?: string; role?: ParticipantRole }) => {
    const params = new URLSearchParams();
    if (options?.roomCode) params.set("roomCode", options.roomCode.trim().toUpperCase());
    if (options?.role) params.set("role", options.role.toLowerCase());
    const query = params.toString();
    return query ? `/join?${query}` : "/join";
  },

  control: (roomCode: string, role?: ParticipantRole | "control") => {
    const params = new URLSearchParams();
    params.set("roomCode", (roomCode || "").trim().toUpperCase());
    if (role) {
      // Normalize "control" alias to "operator"
      const normalizedRole = role === "control" ? "operator" : role.toLowerCase();
      params.set("role", normalizedRole);
    }
    return `/control?${params.toString()}`;
  },

  presentation: (roomCode: string, role?: ParticipantRole | "control") => {
    const params = new URLSearchParams();
    params.set("roomCode", (roomCode || "").trim().toUpperCase());
    if (role) {
      const normalizedRole = role === "control" ? "operator" : role.toLowerCase();
      params.set("role", normalizedRole);
    }
    return `/control/presentation?${params.toString()}`;
  },

  displayAudience: (roomCode: string, grant?: string) => {
    const params = new URLSearchParams();
    params.set("roomCode", (roomCode || "").trim().toUpperCase());
    if (grant) params.set("grant", grant);
    return `/display/audience?${params.toString()}`;
  },

  displayConfidence: (roomCode: string, grant?: string) => {
    const params = new URLSearchParams();
    params.set("roomCode", (roomCode || "").trim().toUpperCase());
    if (grant) params.set("grant", grant);
    return `/display/confidence?${params.toString()}`;
  },
};

export const API_ROUTES = {
  auth: {
    login: "/api/auth/login",
    logout: "/api/auth/logout",
    me: "/api/auth/me",
  },
  room: {
    active: "/api/room/active",
    list: "/api/room/list",
    create: "/api/room/create",
    delete: "/api/room/delete",
    validate: "/api/room/validate",
    displayGrant: (roomCode: string) =>
      `/api/room/display-grant?roomCode=${encodeURIComponent((roomCode || "").trim().toUpperCase())}`,
  },
  material: {
    upload: "/api/material/upload",
    url: "/api/material/url",
    resolve: (materialId: string, roomCode: string) =>
      `/api/material/resolve?materialId=${encodeURIComponent(materialId)}&roomCode=${encodeURIComponent(
        (roomCode || "").trim().toUpperCase()
      )}`,
    delete: "/api/material/delete",
  },
  integrations: {
    canva: {
      authorize: "/api/integrations/canva/authorize",
      callback: "/api/integrations/canva/callback",
      designs: "/api/integrations/canva/designs",
      disconnect: "/api/integrations/canva/disconnect",
      import: "/api/integrations/canva/import",
      status: "/api/integrations/canva/status",
    },
    googleDrive: {
      connect: "/api/google-drive/connect",
      callback: "/api/google-drive/callback",
      disconnect: "/api/google-drive/disconnect",
      status: "/api/google-drive/status",
    },
  },
  ws: (options: {
    roomCode: string;
    deviceId: string;
    role: string;
    deviceName?: string;
    displayGrant?: string;
  }) => {
    const params = new URLSearchParams();
    params.set("roomCode", (options.roomCode || "").trim().toUpperCase());
    params.set("deviceId", options.deviceId);
    params.set("role", options.role.toLowerCase());
    params.set("deviceName", options.deviceName || "Device");
    if (options.displayGrant) params.set("grant", options.displayGrant);
    return `/api/ws?${params.toString()}`;
  },
};
