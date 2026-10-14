import assert from "node:assert/strict";
import { getTelegramPromotionExpiry } from "../shared/newsDates.js";

const septemberPromotion = getTelegramPromotionExpiry(
  "🎆17.09 - 20.09🎆",
  "2026-09-17T06:00:04.000Z"
);
assert.equal(septemberPromotion?.toISOString(), "2026-09-20T00:00:00.000Z");

const newYearPromotion = getTelegramPromotionExpiry(
  "30.12 — 02.01",
  "2026-12-29T10:00:00.000Z"
);
assert.equal(newYearPromotion?.toISOString(), "2027-01-02T00:00:00.000Z");

assert.equal(getTelegramPromotionExpiry("Нові підключення щодня", "2026-09-17"), null);
assert.equal(getTelegramPromotionExpiry("31.02 - 35.02", "2026-02-01"), null);

console.log("Telegram promotion date checks passed.");
