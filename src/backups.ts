// Database backups: a dated snapshot in a folder, keeping only the newest few. Used by `npm run backup` (backup.ts),
// which runs daily on the server (deploy/squash-backup.timer).
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { vacuumInto } from "./db.js";

export const BACKUPS_TO_KEEP = 14;
const BACKUP_FILE = /^squash-.+\.db$/;

// Writes backups/squash-2026-11-18T04-00-00Z.db and deletes all but the newest `keep`. Returns the new file's path.
// The timestamp has no ":" (not allowed in Windows file names), and ISO timestamps sort by name = by time.
export function backupDatabase(dir: string, now = new Date(), keep = BACKUPS_TO_KEEP): string {
  mkdirSync(dir, { recursive: true });
  const stamp = now.toISOString().replace(/\.\d{3}Z$/, "Z").replaceAll(":", "-");
  const file = join(dir, `squash-${stamp}.db`);
  vacuumInto(file);

  const backups = readdirSync(dir).filter((name) => BACKUP_FILE.test(name)).sort(); // oldest first
  for (const old of backups.slice(0, Math.max(0, backups.length - keep))) {
    rmSync(join(dir, old));
  }
  return file;
}
