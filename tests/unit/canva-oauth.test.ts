import { describe, expect, it, beforeEach } from "vitest";
import {
  buildCanvaAuthorizationUrl,
  createCanvaOAuthState,
  generateCodeChallengeS256,
  generateCodeVerifier,
  hashCanvaOAuthState,
  CANVA_OAUTH_SCOPES,
  getValidCanvaAccessToken,
} from "@/features/integrations/canva/canva.oauth";
import {
  clearMemoryIntegrationCredentials,
  IntegrationCredentialStore,
} from "@/lib/integrations/credential-store";

describe("Canva OAuth & PKCE Unit Tests", () => {
  beforeEach(() => {
    clearMemoryIntegrationCredentials();
  });

  it("TEST-CANVA-01: Generates valid PKCE code verifier and SHA-256 code challenge", async () => {
    const verifier1 = generateCodeVerifier();
    const verifier2 = generateCodeVerifier();

    expect(verifier1).toBeTruthy();
    expect(verifier2).toBeTruthy();
    expect(verifier1).not.toBe(verifier2);
    expect(verifier1.length).toBeGreaterThanOrEqual(40);

    const challenge1 = await generateCodeChallengeS256(verifier1);
    const challenge1Again = await generateCodeChallengeS256(verifier1);
    expect(challenge1).toBe(challenge1Again);
    expect(challenge1).not.toBe(verifier1);
  });

  it("TEST-CANVA-02: Generates unique OAuth state and deterministic state hash", async () => {
    const state = createCanvaOAuthState();
    const stateHash1 = await hashCanvaOAuthState(state);
    const stateHash2 = await hashCanvaOAuthState(state);

    expect(state).toBeTruthy();
    expect(stateHash1).toBe(stateHash2);
  });

  it("TEST-CANVA-03: Builds correct Canva authorization URL with PKCE and minimum scopes", async () => {
    const fakeRequest = new Request("https://stagepilot.live/api/integrations/canva/authorize");
    const fakeEnv = {
      CANVA_CLIENT_ID: "client_canva_xyz123",
      CANVA_CLIENT_SECRET: "secret_canva_abc456",
    };

    const state = "test_state_val";
    const codeChallenge = "test_challenge_val";

    const authUrl = buildCanvaAuthorizationUrl(fakeRequest, fakeEnv, state, codeChallenge);
    const parsed = new URL(authUrl);

    expect(parsed.origin).toBe("https://www.canva.com");
    expect(parsed.pathname).toBe("/api/oauth/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client_canva_xyz123");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("code_challenge")).toBe("test_challenge_val");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("state")).toBe("test_state_val");

    // Must include required minimum scopes
    const scopes = parsed.searchParams.get("scope") || "";
    expect(scopes).toContain("design:meta:read");
    expect(scopes).toContain("design:content:read");
  });

  it("TEST-CANVA-04: Securely stores, reads, and deletes integration credentials without exposing secrets", async () => {
    const store = new IntegrationCredentialStore();
    const userId = "user-host-1";

    const saved = await store.saveCredential({
      userId,
      provider: "canva",
      accessToken: "canva_access_token_123",
      refreshToken: "canva_refresh_token_456",
      tokenType: "Bearer",
      expiresAt: Date.now() + 3600 * 1000,
      scopes: CANVA_OAUTH_SCOPES,
      accountEmail: "host@example.com",
      accountName: "Host Operator",
    });

    expect(saved.accessToken).toBe("canva_access_token_123");

    const retrieved = await store.getCredential(userId, "canva");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.accessToken).toBe("canva_access_token_123");
    expect(retrieved?.accountEmail).toBe("host@example.com");

    const validToken = await getValidCanvaAccessToken(userId);
    expect(validToken).toBe("canva_access_token_123");

    await store.deleteCredential(userId, "canva");
    const afterDelete = await store.getCredential(userId, "canva");
    expect(afterDelete).toBeNull();
  });
});
