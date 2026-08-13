import { MaterialSourceType, MaterialType } from "@/core/types";

export interface MaterialRecord {
  id: string;
  ownerUserId: string;
  roomCode?: string;
  sourceType: MaterialSourceType;
  materialType: MaterialType;
  storageProvider?: "external_url" | "google_drive" | "r2";
  storageReference?: string;
  title: string;
  originalFileName?: string;
  mimeType?: string;
  sizeBytes: number;
  objectKey?: string | null;
  externalUrl?: string | null;
  slideCount: number;
  status: "ready" | "expired" | "deleted";
  createdAt: number;
  expiresAt: number;
  deletedAt?: number | null;
}

// In-memory D1 database fallback for local development / Vitest
const memoryD1Registry = new Map<string, MaterialRecord>();

export class MaterialRegistryService {
  private d1Binding: {
    prepare: (sql: string) => {
      bind: (...args: unknown[]) => {
        first: <T>() => Promise<T | null>;
        all: <T>() => Promise<{ results: T[] }>;
        run: () => Promise<unknown>;
      };
    };
  } | null = null;

  constructor(env?: Record<string, unknown> | null) {
    if (env?.DB && typeof (env.DB as { prepare: unknown }).prepare === "function") {
      this.d1Binding = env.DB as unknown as MaterialRegistryService["d1Binding"];
    }
  }

  async createMaterial(record: MaterialRecord): Promise<MaterialRecord> {
    if (this.d1Binding) {
      const sql = `
        INSERT INTO material_registry (
          id, owner_user_id, room_code, source_type, material_type, title,
          original_file_name, mime_type, size_bytes, object_key, external_url,
          slide_count, status, created_at, expires_at, deleted_at,
          storage_provider, storage_reference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      await this.d1Binding
        .prepare(sql)
        .bind(
          record.id,
          record.ownerUserId,
          record.roomCode || null,
          record.sourceType,
          record.materialType,
          record.title,
          record.originalFileName || null,
          record.mimeType || null,
          record.sizeBytes || 0,
          record.objectKey || null,
          record.externalUrl || null,
          record.slideCount || 1,
          record.status,
          record.createdAt,
          record.expiresAt,
          record.deletedAt || null,
          record.storageProvider || "external_url",
          record.storageReference || record.externalUrl || record.objectKey || null
        )
        .run();
    } else {
      memoryD1Registry.set(record.id, record);
    }
    return record;
  }

  async getMaterialById(id: string): Promise<MaterialRecord | null> {
    if (this.d1Binding) {
      const sql = `SELECT * FROM material_registry WHERE id = ?`;
      const row = await this.d1Binding.prepare(sql).bind(id).first<Record<string, unknown>>();
      if (!row) return null;
      return this.mapRowToRecord(row);
    }

    const record = memoryD1Registry.get(id);
    if (!record) return null;
    return record;
  }

  async getMaterialsByOwner(ownerUserId: string): Promise<MaterialRecord[]> {
    if (this.d1Binding) {
      const sql = `SELECT * FROM material_registry WHERE owner_user_id = ? AND status != 'deleted' ORDER BY created_at DESC`;
      const { results } = await this.d1Binding.prepare(sql).bind(ownerUserId).all<Record<string, unknown>>();
      return results.map((r) => this.mapRowToRecord(r));
    }

    return Array.from(memoryD1Registry.values()).filter(
      (r) => r.ownerUserId === ownerUserId && r.status !== "deleted"
    );
  }

  async getMaterialsByRoomCode(roomCode: string): Promise<MaterialRecord[]> {
    if (!roomCode) return [];
    const upper = roomCode.toUpperCase();
    if (this.d1Binding) {
      const sql = `SELECT * FROM material_registry WHERE UPPER(room_code) = ? AND status != 'deleted' ORDER BY created_at ASC`;
      const { results } = await this.d1Binding.prepare(sql).bind(upper).all<Record<string, unknown>>();
      return results.map((r) => this.mapRowToRecord(r));
    }

    return Array.from(memoryD1Registry.values()).filter(
      (r) => r.roomCode?.toUpperCase() === upper && r.status !== "deleted"
    );
  }

  async markExpired(materialId: string): Promise<void> {
    if (this.d1Binding) {
      const sql = `UPDATE material_registry SET status = 'expired' WHERE id = ?`;
      await this.d1Binding.prepare(sql).bind(materialId).run();
    } else {
      const record = memoryD1Registry.get(materialId);
      if (record) {
        record.status = "expired";
      }
    }
  }

  async deleteMaterial(materialId: string): Promise<void> {
    if (this.d1Binding) {
      const sql = `DELETE FROM material_registry WHERE id = ?`;
      await this.d1Binding.prepare(sql).bind(materialId).run();
    }
    memoryD1Registry.delete(materialId);
  }

  async deleteMaterialsByRoomCode(roomCode: string): Promise<void> {
    if (!roomCode) return;
    const upper = roomCode.toUpperCase();
    if (this.d1Binding) {
      const sql = `DELETE FROM material_registry WHERE UPPER(room_code) = ?`;
      await this.d1Binding.prepare(sql).bind(upper).run();
    }
    for (const [id, record] of Array.from(memoryD1Registry.entries())) {
      if (record.roomCode?.toUpperCase() === upper) {
        memoryD1Registry.delete(id);
      }
    }
  }

  private mapRowToRecord(row: Record<string, unknown>): MaterialRecord {
    return {
      id: row.id as string,
      ownerUserId: row.owner_user_id as string,
      roomCode: (row.room_code as string) || undefined,
      sourceType: row.source_type as MaterialSourceType,
      materialType: row.material_type as MaterialType,
      storageProvider: (row.storage_provider as "external_url" | "google_drive" | "r2") || "external_url",
      storageReference: (row.storage_reference as string) || (row.external_url as string) || (row.object_key as string) || "",
      title: row.title as string,
      originalFileName: (row.original_file_name as string) || undefined,
      mimeType: (row.mime_type as string) || undefined,
      sizeBytes: (row.size_bytes as number) || 0,
      objectKey: (row.object_key as string) || null,
      externalUrl: (row.external_url as string) || null,
      slideCount: (row.slide_count as number) || 1,
      status: row.status as "ready" | "expired" | "deleted",
      createdAt: row.created_at as number,
      expiresAt: row.expires_at as number,
      deletedAt: (row.deleted_at as number) || null,
    };
  }
}

export class StorageRegistryResolver {
  private env?: Record<string, unknown>;

  constructor(env?: Record<string, unknown>) {
    this.env = env;
  }

  getRegistry(): MaterialRegistryService {
    const d1 = (this.env?.DB || (process.env as Record<string, unknown>)?.DB) as unknown as Record<string, unknown> | undefined;
    return new MaterialRegistryService(d1);
  }
}

export function clearMemoryD1Registry(): void {
  memoryD1Registry.clear();
}
