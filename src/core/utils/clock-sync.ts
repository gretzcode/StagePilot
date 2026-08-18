/**
 * Global Clock Synchronizer (SNTP-style Offset Compensation)
 *
 * In distributed web applications, client device system clocks can drift or be manually set
 * minutes/seconds ahead or behind the server clock (Cloudflare Workers / Host).
 *
 * This module dynamically calculates and filters the clock offset (serverTime - localTime)
 * from server responses and WebSocket messages, ensuring that all timers, timestamps,
 * and media sync calculate identical elapsed times across all screens regardless of client clock skew.
 */

let globalServerOffsetMs = 0;
let hasSynced = false;

export function updateServerTimeOffset(serverTimestamp: number, requestSentAt?: number): void {
  if (!serverTimestamp || typeof serverTimestamp !== "number" || isNaN(serverTimestamp)) return;

  const now = Date.now();
  // If round-trip time (RTT) is known, compensate for one-way network transit latency
  const latency = requestSentAt ? Math.max(0, Math.floor((now - requestSentAt) / 2)) : 0;
  const estimatedServerTime = serverTimestamp + latency;
  const newOffset = estimatedServerTime - now;

  if (!hasSynced) {
    globalServerOffsetMs = newOffset;
    hasSynced = true;
  } else {
    // Smooth exponentially weighted moving average (EWMA) to prevent jitter from network spikes
    globalServerOffsetMs = Math.round(globalServerOffsetMs * 0.75 + newOffset * 0.25);
  }
}

export function getSyncedNow(): number {
  return Date.now() + globalServerOffsetMs;
}

export function getServerTimeOffset(): number {
  return globalServerOffsetMs;
}

export function resetClockSync(): void {
  globalServerOffsetMs = 0;
  hasSynced = false;
}
