// Tests for database backups, writing to a temporary folder. Run with: npm test
import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./db.js";
import { backupDatabase } from "./backups.js";
import { play } from "./testHelpers.js";

let dir: string;

beforeEach(() => {
  openDatabase(":memory:");
  dir = mkdtempSync(join(tmpdir(), "squash-backup-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("backupDatabase", () => {
  it("writes a dated copy that contains the data", () => {
    play("trym", "ola", 3, 1);

    const file = backupDatabase(dir, new Date("2026-11-18T04:00:00.000Z"));

    assert.equal(file, join(dir, "squash-2026-11-18T04-00-00Z.db"));
    const copy = new DatabaseSync(file);
    // node:sqlite rows have a null prototype, so compare the value rather than the whole object.
    assert.equal((copy.prepare("SELECT COUNT(*) AS n FROM matches").get() as { n: number }).n, 1);
    copy.close();
  });

  it("keeps only the newest backups", () => {
    for (let day = 1; day <= 5; day++) {
      backupDatabase(dir, new Date(`2026-11-0${day}T04:00:00Z`), 3);
    }

    assert.deepEqual(readdirSync(dir).sort(), [
      "squash-2026-11-03T04-00-00Z.db",
      "squash-2026-11-04T04-00-00Z.db",
      "squash-2026-11-05T04-00-00Z.db",
    ]);
  });
});
