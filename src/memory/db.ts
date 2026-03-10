import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let db: Database.Database;

export function initializeDb(dataDir: string): void {
    if (!db) {
        // Ensure the directory exists
        if (!fs.existsSync(dataDir)) {
            console.log(`  📂 Creating data directory: ${dataDir}`);
            fs.mkdirSync(dataDir, { recursive: true });
        }

        const dbPath = path.resolve(dataDir, "gravity-claw.db");
        console.log(`  🗄️ Initializing database at: ${dbPath}`);

        db = new Database(dbPath);
        db.pragma("journal_mode = WAL");
        db.pragma("foreign_keys = ON");
        initSchema(db);
    }
}

export function getDb(): Database.Database {
    if (!db) {
        throw new Error("Database not initialized. Call initializeDb() first.");
    }
    return db;
}

function initSchema(db: Database.Database): void {
    db.exec(`
    -- Raw conversation messages (short-term buffer)
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat
      ON messages(chat_id, created_at DESC);

    -- Core memories (long-term extracted facts)
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'general',
      source TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- FTS5 index on memories for fast full-text retrieval
    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      category,
      content=memories,
      content_rowid=id,
      tokenize='porter unicode61'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, category)
        VALUES (new.id, new.content, new.category);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category)
        VALUES ('delete', old.id, old.content, old.category);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, category)
        VALUES ('delete', old.id, old.content, old.category);
      INSERT INTO memories_fts(rowid, content, category)
        VALUES (new.id, new.content, new.category);
    END;

    -- Conversation summaries (compressed past conversations)
    CREATE TABLE IF NOT EXISTS summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

// ── Message CRUD ────────────────────────────────────────────────

export interface StoredMessage {
    id: number;
    chat_id: string;
    role: "user" | "assistant";
    content: string;
    created_at: string;
}

export function saveMessage(
    chatId: string,
    role: "user" | "assistant",
    content: string
): void {
    getDb()
        .prepare("INSERT INTO messages (chat_id, role, content) VALUES (?, ?, ?)")
        .run(chatId, role, content);
}

export function getRecentMessages(
    chatId: string,
    limit: number = 20
): StoredMessage[] {
    return getDb()
        .prepare(
            `SELECT * FROM messages
       WHERE chat_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
        )
        .all(chatId, limit) as StoredMessage[];
}

// ── Memory CRUD ─────────────────────────────────────────────────

export interface StoredMemory {
    id: number;
    content: string;
    category: string;
    source: string | null;
    created_at: string;
    updated_at: string;
}

export function saveMemory(
    content: string,
    category: string = "general",
    source?: string
): number {
    const result = getDb()
        .prepare(
            "INSERT INTO memories (content, category, source) VALUES (?, ?, ?)"
        )
        .run(content, category, source || null);
    return result.lastInsertRowid as number;
}

export function searchMemories(
    query: string,
    limit: number = 10
): StoredMemory[] {
    // Use FTS5 match with ranking
    const results = getDb()
        .prepare(
            `SELECT m.*, rank
       FROM memories_fts fts
       JOIN memories m ON m.id = fts.rowid
       WHERE memories_fts MATCH ?
       ORDER BY rank
       LIMIT ?`
        )
        .all(query, limit) as StoredMemory[];

    return results;
}

export function getAllMemories(): StoredMemory[] {
    return getDb()
        .prepare("SELECT * FROM memories ORDER BY updated_at DESC")
        .all() as StoredMemory[];
}

export function deleteMemory(id: number): void {
    getDb().prepare("DELETE FROM memories WHERE id = ?").run(id);
}

export function getMemoryCount(): number {
    const row = getDb()
        .prepare("SELECT COUNT(*) as count FROM memories")
        .get() as { count: number };
    return row.count;
}

// ── Summary CRUD ────────────────────────────────────────────────

export function saveSummary(
    chatId: string,
    summary: string,
    messageCount: number
): void {
    getDb()
        .prepare(
            "INSERT INTO summaries (chat_id, summary, message_count) VALUES (?, ?, ?)"
        )
        .run(chatId, summary, messageCount);
}

export function getRecentSummaries(limit: number = 5): { summary: string; created_at: string }[] {
    return getDb()
        .prepare(
            "SELECT summary, created_at FROM summaries ORDER BY created_at DESC LIMIT ?"
        )
        .all(limit) as { summary: string; created_at: string }[];
}

// ── Cleanup ─────────────────────────────────────────────────────

export function closeDb(): void {
    if (db) {
        db.close();
    }
}
