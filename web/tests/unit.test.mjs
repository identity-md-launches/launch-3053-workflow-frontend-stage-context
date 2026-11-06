// Unit checks for the manifest helpers: the canonical ABI hash must reproduce the handoff's
// abiHash for each pinned ABI, and key order must not change it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ABI_SOURCE, HANDOFF, abiHash, canonical, readJson } from "../scripts/lib.mjs";

test("canonical JSON sorts keys at every level", () => {
  assert.equal(canonical({ b: 1, a: [{ d: 2, c: 3 }] }), '{"a":[{"c":3,"d":2}],"b":1}');
});

test("pinned ABIs hash to the handoff abiHash", () => {
  for (const c of readJson(HANDOFF).contracts) {
    const abi = JSON.parse(readFileSync(join(ABI_SOURCE, `${c.name}.json`), "utf8"));
    assert.equal(abiHash(abi), c.abiHash, c.name);
  }
});
