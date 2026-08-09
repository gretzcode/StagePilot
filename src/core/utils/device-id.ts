"use client";

/**
 * Retrieves a persistent device ID for a given role and roomCode bound to the local browser instance.
 * To prevent URL sharing security vulnerabilities (where copying an approved URL bypasses approval in Incognito Mode),
 * each browser instance generates and persists its OWN device ID in local storage.
 */
export function getPersistentDeviceId(role: string, roomCode: string, _searchParamDeviceId?: string | null): string {
  if (typeof window === "undefined") {
    return `dev-${role}-${Date.now().toString(36)}`;
  }

  const storageKey = `stagepilot_dev_id_${role}_${(roomCode || "default").toUpperCase()}`;
  try {
    const existing = localStorage.getItem(storageKey);
    if (existing && existing.trim()) {
      return existing.trim();
    }

    const newId = `dev-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    localStorage.setItem(storageKey, newId);
    return newId;
  } catch {
    return `dev-${role}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  }
}
