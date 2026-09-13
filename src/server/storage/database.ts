import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export function transaction<T>(db: DatabaseSync, action: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const value = action(); db.exec('COMMIT'); return value; }
  catch (error) { try { db.exec('ROLLBACK'); } catch { /* preserve original failure */ } throw error; }
}

export function migrate(db: DatabaseSync) {
  const migrations = ['001_initial.sql', '002_live_runs.sql', '003_highlights.sql'].map((file, i) => {
    const sql = readFileSync(new URL(`./migrations/${file}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
    return { version: i + 1, sql, checksum: createHash('sha256').update(sql).digest('hex') };
  });
  transaction(db, () => {
    db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT');
    const rows = db.prepare('SELECT version, checksum FROM schema_migrations ORDER BY version').all();
    if (rows.some((r, i) => r.version !== i + 1 || !migrations[i])) throw new Error('Unsupported database migration version');
    for (const m of migrations) {
      const row = rows.find(r => r.version === m.version);
      if (row) { if (row.checksum !== m.checksum) throw new Error('Migration checksum mismatch'); continue; }
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations VALUES(?, ?, ?)').run(m.version, m.checksum, new Date().toISOString());
    }
  });
}

export function openDatabase(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=2000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
    migrate(db);
    return db;
  } catch (error) { db.close(); throw error; }
}
