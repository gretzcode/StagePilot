export interface IntegrationCredential {
  id: string;
  userId: string;
  provider: "canva" | "google_drive" | string;
  accessToken: string;
  refreshToken?: string | null;
  tokenType: string;
  expiresAt: number;
  scopes: string[];
  accountEmail?: string | null;
  accountName?: string | null;
  createdAt: number;
  updatedAt: number;
}

const memoryCredentials = new Map<string, IntegrationCredential>();

export class IntegrationCredentialStore {
  private db: D1Database | null = null;

  constructor(env?: Record<string, unknown> | null) {
    if (env && typeof env === "object" && "DB" in env && env.DB) {
      this.db = env.DB as D1Database;
    }
  }

  private getKey(userId: string, provider: string): string {
    return `${userId}:${provider}`;
  }

  async saveCredential(cred: Omit<IntegrationCredential, "id" | "createdAt" | "updatedAt">): Promise<IntegrationCredential> {
    const now = Date.now();
    const id = `cred-${cred.provider}-${cred.userId}`;
    const fullCredential: IntegrationCredential = {
      ...cred,
      id,
      createdAt: now,
      updatedAt: now,
    };

    if (this.db) {
      try {
        await this.db
          .prepare(
            `INSERT INTO integration_credentials (
              id, user_id, provider, access_token, refresh_token, token_type, expires_at, scopes, account_email, account_name, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
              access_token = excluded.access_token,
              refresh_token = COALESCE(excluded.refresh_token, integration_credentials.refresh_token),
              token_type = excluded.token_type,
              expires_at = excluded.expires_at,
              scopes = excluded.scopes,
              account_email = COALESCE(excluded.account_email, integration_credentials.account_email),
              account_name = COALESCE(excluded.account_name, integration_credentials.account_name),
              updated_at = excluded.updated_at`
          )
          .bind(
            id,
            cred.userId,
            cred.provider,
            cred.accessToken,
            cred.refreshToken || null,
            cred.tokenType || "Bearer",
            cred.expiresAt,
            cred.scopes.join(" "),
            cred.accountEmail || null,
            cred.accountName || null,
            now,
            now
          )
          .run();
      } catch (err) {
        console.warn("[IntegrationCredentialStore] D1 save failed, falling back to memory:", err);
      }
    }

    memoryCredentials.set(this.getKey(cred.userId, cred.provider), fullCredential);
    return fullCredential;
  }

  async getCredential(userId: string, provider: string): Promise<IntegrationCredential | null> {
    if (this.db) {
      try {
        const row = await this.db
          .prepare(`SELECT * FROM integration_credentials WHERE user_id = ? AND provider = ? LIMIT 1`)
          .bind(userId, provider)
          .first<Record<string, unknown>>();

        if (row) {
          const cred: IntegrationCredential = {
            id: String(row.id),
            userId: String(row.user_id),
            provider: String(row.provider),
            accessToken: String(row.access_token),
            refreshToken: row.refresh_token ? String(row.refresh_token) : null,
            tokenType: String(row.token_type || "Bearer"),
            expiresAt: Number(row.expires_at),
            scopes: typeof row.scopes === "string" ? row.scopes.split(" ").filter(Boolean) : [],
            accountEmail: row.account_email ? String(row.account_email) : null,
            accountName: row.account_name ? String(row.account_name) : null,
            createdAt: Number(row.created_at),
            updatedAt: Number(row.updated_at),
          };
          memoryCredentials.set(this.getKey(userId, provider), cred);
          return cred;
        }
      } catch (err) {
        console.warn("[IntegrationCredentialStore] D1 read failed, falling back to memory:", err);
      }
    }

    return memoryCredentials.get(this.getKey(userId, provider)) || null;
  }

  async deleteCredential(userId: string, provider: string): Promise<boolean> {
    memoryCredentials.delete(this.getKey(userId, provider));

    if (this.db) {
      try {
        await this.db
          .prepare(`DELETE FROM integration_credentials WHERE user_id = ? AND provider = ?`)
          .bind(userId, provider)
          .run();
        return true;
      } catch (err) {
        console.warn("[IntegrationCredentialStore] D1 delete failed:", err);
      }
    }

    return true;
  }
}

export function clearMemoryIntegrationCredentials(): void {
  memoryCredentials.clear();
}
