// Entry point for `npm run backup`: writes a snapshot of the database to the backup folder.
// Safe to run while the bot and website are running (SQLite WAL mode allows a reader next to the writer).
import { backupDir, databasePath } from "./config.js";
import { openDatabase } from "./db.js";
import { backupDatabase } from "./backups.js";

openDatabase(databasePath);
console.log(`Backup written: ${backupDatabase(backupDir)}`);
