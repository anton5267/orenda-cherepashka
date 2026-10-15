import assert from "node:assert/strict";
import { seedProducts } from "../shared/seedData.js";

const expected: Record<string, { currency: "UAH" | "USD"; prices: number[] }> = {
  "chatgpt-pro-shared": { currency: "UAH", prices: [1390, 1100, 1250, 1000] },
  "chatgpt-plus-shared": { currency: "UAH", prices: [110, 100] },
  "chatgpt-plus-shared-5": { currency: "UAH", prices: [280, 260] },
  "chatgpt-plus-personal-no-guarantee": { currency: "UAH", prices: [250] },
  "chatgpt-plus-personal-15-day-guarantee": { currency: "UAH", prices: [350] },
  "netflix-profile": { currency: "UAH", prices: [130, 115] },
  "netflix-personal-admin": { currency: "UAH", prices: [280] },
  "grok-super": { currency: "UAH", prices: [800, 2200] },
  "grok-super-shared": { currency: "UAH", prices: [185, 165] },
  "capcut-pro": { currency: "UAH", prices: [160, 150] },
  "capcut-pro-personal": { currency: "UAH", prices: [350, 300] },
  "gemini-pro": { currency: "UAH", prices: [130, 115] },
  "google-ai-pro-18-months": { currency: "UAH", prices: [790, 700] },
  "perplexity-pro": { currency: "UAH", prices: [130, 110] },
  "perplexity-pro-personal-12-months": { currency: "UAH", prices: [3290] },
  "gamma-ai": { currency: "UAH", prices: [230, 215] },
  "adobe-creative-cloud-shared": { currency: "UAH", prices: [330, 300] },
  "adobe-creative-cloud-personal": { currency: "UAH", prices: [380, 350] },
  "megogo-megopack": { currency: "UAH", prices: [135, 120] },
  "youtube-family": { currency: "UAH", prices: [65, 60] },
  "sweet-tv-l": { currency: "UAH", prices: [95, 85] },
  "spotify-family": { currency: "UAH", prices: [100, 90] },
  "microsoft-365-family": { currency: "UAH", prices: [150, 140] },
  "duolingo-super-family": { currency: "UAH", prices: [120, 110] },
  "leonardo-ai-personal": { currency: "UAH", prices: [320] },
  "surfshark-vpn": { currency: "UAH", prices: [95, 85] },
  "heygen-creator-personal": { currency: "UAH", prices: [550] },
  "clear-vpn": { currency: "UAH", prices: [250] },
  "gmail-mailbox": { currency: "USD", prices: [1.9, 1.7] },
  "canva-pro": { currency: "UAH", prices: [120, 110] },
  "canva-pro-personal-team": { currency: "UAH", prices: [190, 170] },
  "hbo-premium": { currency: "UAH", prices: [180, 160] },
  "amazon-prime-video-6-months": { currency: "UAH", prices: [550] },
  "figma-pro-personal-1-year": { currency: "UAH", prices: [790] },
  "elevenlabs-creator-131k": { currency: "UAH", prices: [590] }
};

assert.equal(seedProducts.length, 35, "Catalog must include all 35 supplied services.");
assert.deepEqual(
  seedProducts.map((product) => product.id).sort(),
  Object.keys(expected).sort(),
  "Catalog service IDs do not match the reviewed price list."
);

for (const product of seedProducts) {
  const priceList = expected[product.id];
  assert.ok(priceList, `Unexpected service in catalog: ${product.id}`);
  assert.deepEqual(
    product.pricingOptions.map(({ price, currency }) => ({ price, currency })),
    priceList.prices.map((price) => ({ price, currency: priceList.currency })),
    `Prices or currencies do not match the supplied list for ${product.name}.`
  );
}

for (const id of [
  "chatgpt-pro-shared",
  "chatgpt-plus-shared",
  "chatgpt-plus-shared-5",
  "chatgpt-plus-personal-no-guarantee",
  "chatgpt-plus-personal-15-day-guarantee"
]) {
  assert.equal(
    seedProducts.find((product) => product.id === id)?.isActive,
    false,
    `OpenAI subscription offer ${id} must remain unpublished in the public seed.`
  );
}

const grok = seedProducts.find((product) => product.id === "grok-super");
assert.equal(grok?.pricingOptions[1]?.label, "3 міс · за пакет");
assert.match(grok?.summary ?? "", /2200 грн за пакет на 3 місяці/);

const pricePointCount = seedProducts.reduce((count, product) => count + product.pricingOptions.length, 0);
console.log(`Catalog price smoke test passed: all ${seedProducts.length} products and ${pricePointCount} price points match.`);
