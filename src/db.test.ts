// Tests for the transaction helper. Run with: npm test
import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { getPlayer, openDatabase, transaction, upsertPlayer } from "./db.js";

beforeEach(() => {
  openDatabase(":memory:");
});

describe("transaction", () => {
  it("can be nested: the inner call joins the outer transaction", () => {
    transaction(() => {
      upsertPlayer("trym", "Trym", null, 1000);
      transaction(() => upsertPlayer("ola", "Ola", null, 1000));
    });

    assert.ok(getPlayer("trym"));
    assert.ok(getPlayer("ola"));
  });

  it("an error in the inner part rolls back the outer writes too (all or nothing)", () => {
    assert.throws(() =>
      transaction(() => {
        upsertPlayer("trym", "Trym", null, 1000);
        transaction(() => {
          upsertPlayer("ola", "Ola", null, 1000);
          throw new Error("boom");
        });
      }),
    );

    assert.equal(getPlayer("trym"), undefined);
    assert.equal(getPlayer("ola"), undefined);
  });

  it("a caught inner error still lets the outer transaction decide", () => {
    transaction(() => {
      upsertPlayer("trym", "Trym", null, 1000);
      try {
        transaction(() => {
          throw new Error("inner fails");
        });
      } catch {
        // the outer code handled it and carries on
      }
    });

    assert.ok(getPlayer("trym"));
  });
});
