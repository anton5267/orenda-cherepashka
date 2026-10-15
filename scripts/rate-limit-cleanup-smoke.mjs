import assert from "node:assert/strict";
import { pruneExpiredRateLimitEntries } from "../server-dist/server/rateLimitEntries.js";

const entries = new Map([
  ["active", { count: 3, resetAt: 20_000 }],
  ["expired", { count: 5, resetAt: 9_999 }],
  ["boundary", { count: 1, resetAt: 10_000 }]
]);

assert.equal(pruneExpiredRateLimitEntries(entries, 10_000), 2);
assert.deepEqual([...entries.keys()], ["active"]);
assert.equal(pruneExpiredRateLimitEntries(entries, 10_000), 0);
console.log("Rate-limit cleanup smoke test passed: expired client entries are pruned safely.");
