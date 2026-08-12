import { describe, expect, it, beforeEach } from "vitest";
import { createGoogleOAuthState, hashGoogleOAuthState } from "@/lib/google-drive/oauth";
import { clearMemoryOAuthTransactions, OAuthTransactionStore } from "@/lib/google-drive/oauth-transactions";

describe("Google OAuth state lifecycle", () => {
  beforeEach(() => {
    clearMemoryOAuthTransactions();
  });

  it("generates unique cryptographically sized states", () => {
    const first = createGoogleOAuthState();
    const second = createGoogleOAuthState();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(40);
  });

  it("persists and consumes a valid host-bound state once", async () => {
    const store = new OAuthTransactionStore({});
    const state = createGoogleOAuthState();
    const hash = await hashGoogleOAuthState(state);
    const now = Date.now();

    await store.create({
      id: "tx-valid",
      provider: "google_drive",
      stateHash: hash,
      hostUserId: "host-1",
      createdAt: now,
      expiresAt: now + 600_000,
      status: "pending",
      consumedAt: null,
    });

    await expect(store.consume("tx-valid", hash, "host-1", now)).resolves.toMatchObject({ status: "consumed" });
    await expect(store.consume("tx-valid", hash, "host-1", now)).resolves.toBeNull();
  });

  it("rejects invalid, expired, missing, and wrong-host states", async () => {
    const store = new OAuthTransactionStore({});
    const state = createGoogleOAuthState();
    const hash = await hashGoogleOAuthState(state);
    const wrongHash = await hashGoogleOAuthState("wrong-state");
    const now = Date.now();

    await store.create({
      id: "tx-expired",
      provider: "google_drive",
      stateHash: hash,
      hostUserId: "host-1",
      createdAt: now - 700_000,
      expiresAt: now - 1,
      status: "pending",
      consumedAt: null,
    });

    await store.create({
      id: "tx-pending",
      provider: "google_drive",
      stateHash: hash,
      hostUserId: "host-1",
      createdAt: now,
      expiresAt: now + 600_000,
      status: "pending",
      consumedAt: null,
    });

    await expect(store.consume("tx-missing", hash, "host-1", now)).resolves.toBeNull();
    await expect(store.consume("tx-expired", hash, "host-1", now)).resolves.toBeNull();
    await expect(store.consume("tx-pending", wrongHash, "host-1", now)).resolves.toBeNull();
    await expect(store.consume("tx-pending", hash, "host-2", now)).resolves.toBeNull();
  });
});
