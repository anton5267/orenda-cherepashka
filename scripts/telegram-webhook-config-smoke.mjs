import assert from "node:assert/strict";

const publicSiteUrl = "https://anton5267.github.io/orenda-cherepashka";
const renderApiUrl = "https://orenda-cherepashka.onrender.com";
process.env.NODE_ENV = "development";
process.env.PUBLIC_SITE_URL = publicSiteUrl;
process.env.RENDER_EXTERNAL_URL = renderApiUrl;
delete process.env.TELEGRAM_WEBHOOK_BASE_URL;

const { env } = await import("../server-dist/server/env.js?telegram-webhook-smoke");
const {
  buildTelegramWebhookPayload,
  hasTelegramWebhookCredentials,
  resolveTelegramWebhookBaseUrl
} = await import("../server-dist/server/telegramWebhookConfig.js");

assert.equal(env.publicSiteUrl, publicSiteUrl, "Canonical storefront URL should remain the GitHub Pages URL.");
assert.equal(env.telegramWebhookBaseUrl, renderApiUrl, "Render's API URL should be used for the Telegram callback.");
assert.equal(hasTelegramWebhookCredentials("", ""), false);
assert.equal(hasTelegramWebhookCredentials("", "secret_token"), false);
assert.equal(hasTelegramWebhookCredentials("bot-token", "secret_token"), true);
assert.throws(() => hasTelegramWebhookCredentials("bot-token", ""), /WEBHOOK_SECRET is required/);
assert.equal(
  resolveTelegramWebhookBaseUrl(" https://api.example.test/ ", renderApiUrl),
  "https://api.example.test/",
  "An explicit webhook base URL should override Render's default."
);
assert.deepEqual(
  buildTelegramWebhookPayload(env.telegramWebhookBaseUrl, "test_secret-123"),
  {
    url: `${renderApiUrl}/api/telegram/webhook`,
    secret_token: "test_secret-123",
    allowed_updates: ["channel_post", "edited_channel_post"]
  }
);
assert.notEqual(
  buildTelegramWebhookPayload(publicSiteUrl, "test_secret").url,
  buildTelegramWebhookPayload(env.telegramWebhookBaseUrl, "test_secret").url,
  "A storefront URL must never be substituted for the API webhook URL."
);
assert.throws(() => buildTelegramWebhookPayload("http://api.example.test", "test_secret"), /HTTPS URL/);
assert.throws(() => buildTelegramWebhookPayload("", "test_secret"), /valid HTTPS service URL/);
assert.throws(() => buildTelegramWebhookPayload(renderApiUrl, "secret with spaces"), /TELEGRAM_WEBHOOK_SECRET/);
assert.throws(() => buildTelegramWebhookPayload(renderApiUrl, "x".repeat(257)), /TELEGRAM_WEBHOOK_SECRET/);

console.log("Telegram webhook config smoke test passed: canonical site and HTTPS API callback stay separate.");
