import assert from "node:assert/strict";
import { formatCurrencyAmount } from "../shared/priceFormat.js";

assert.equal(formatCurrencyAmount(1.9, "USD"), "1,90 $");
assert.equal(formatCurrencyAmount(1390, "UAH").replace(/\s/g, " "), "1 390 грн");
assert.equal(formatCurrencyAmount(2200, "UAH").replace(/\s/g, " "), "2 200 грн");

console.log("Currency formatting checks passed.");
