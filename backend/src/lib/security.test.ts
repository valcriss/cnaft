import test from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./security.js";

test("hashPassword returns salt:key format", async () => {
  const hash = await hashPassword("My-S3cret!");
  const parts = hash.split(":");
  assert.equal(parts.length, 2);
  assert.ok(parts[0].length > 0);
  assert.ok(parts[1].length > 0);
});

test("verifyPassword validates correct password and rejects wrong one", async () => {
  const password = "Another-S3cret!";
  const hash = await hashPassword(password);

  const ok = await verifyPassword(password, hash);
  const ko = await verifyPassword("bad-password", hash);

  assert.equal(ok, true);
  assert.equal(ko, false);
});

test("verifyPassword rejects malformed hashes", async () => {
  const result = await verifyPassword("any", "not-a-valid-hash");
  assert.equal(result, false);
});
