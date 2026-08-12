export type OAuthTransactionStatus = "pending" | "consumed";

export interface OAuthTransaction {
  id: string;
  provider: "google_drive";
  stateHash: string;
  hostUserId: string;
  createdAt: number;
  expiresAt: number;
  status: OAuthTransactionStatus;
  consumedAt?: number | null;
}

type D1Binding = {
  prepare: (sql: string) => {
    bind: (...args: unknown[]) => {
      first: <T>() => Promise<T | null>;
      run: () => Promise<unknown>;
    };
  };
};

const memoryTransactions = new Map<string, OAuthTransaction>();

export class OAuthTransactionStore {
  private d1: D1Binding | null = null;

  constructor(env?: Record<string, unknown> | null) {
    if (env?.DB && typeof (env.DB as { prepare?: unknown }).prepare === "function") {
      this.d1 = env.DB as D1Binding;
    }
  }

  async create(transaction: OAuthTransaction): Promise<void> {
    if (this.d1) {
      await this.d1
        .prepare(
          `INSERT INTO oauth_transactions (
            id, provider, state_hash, host_user_id, created_at, expires_at, status, consumed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          transaction.id,
          transaction.provider,
          transaction.stateHash,
          transaction.hostUserId,
          transaction.createdAt,
          transaction.expiresAt,
          transaction.status,
          transaction.consumedAt || null
        )
        .run();
      return;
    }
    memoryTransactions.set(transaction.id, transaction);
  }

  async findById(id: string): Promise<OAuthTransaction | null> {
    if (this.d1) {
      const row = await this.d1
        .prepare(`SELECT * FROM oauth_transactions WHERE id = ?`)
        .bind(id)
        .first<Record<string, unknown>>();
      return row ? this.mapRow(row) : null;
    }
    return memoryTransactions.get(id) || null;
  }

  async consume(id: string, stateHash: string, hostUserId: string, now = Date.now()): Promise<OAuthTransaction | null> {
    const transaction = await this.findById(id);
    if (
      !transaction ||
      transaction.provider !== "google_drive" ||
      transaction.stateHash !== stateHash ||
      transaction.hostUserId !== hostUserId ||
      transaction.status !== "pending" ||
      transaction.expiresAt <= now
    ) {
      return null;
    }

    if (this.d1) {
      await this.d1
        .prepare(
          `UPDATE oauth_transactions
           SET status = 'consumed', consumed_at = ?
           WHERE id = ? AND state_hash = ? AND host_user_id = ? AND status = 'pending' AND expires_at > ?`
        )
        .bind(now, id, stateHash, hostUserId, now)
        .run();
      const consumed = await this.findById(id);
      return consumed?.status === "consumed" ? consumed : null;
    }

    transaction.status = "consumed";
    transaction.consumedAt = now;
    memoryTransactions.set(id, transaction);
    return transaction;
  }

  private mapRow(row: Record<string, unknown>): OAuthTransaction {
    return {
      id: row.id as string,
      provider: "google_drive",
      stateHash: row.state_hash as string,
      hostUserId: row.host_user_id as string,
      createdAt: row.created_at as number,
      expiresAt: row.expires_at as number,
      status: row.status as OAuthTransactionStatus,
      consumedAt: (row.consumed_at as number) || null,
    };
  }
}

export function clearMemoryOAuthTransactions(): void {
  memoryTransactions.clear();
}
