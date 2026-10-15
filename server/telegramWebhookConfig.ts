const telegramWebhookPath = "/api/telegram/webhook";

export function resolveTelegramWebhookBaseUrl(
  explicitBaseUrl: string | undefined,
  renderExternalUrl: string | undefined
) {
  return explicitBaseUrl?.trim() || renderExternalUrl?.trim() || "";
}

export function hasTelegramWebhookCredentials(botToken: string, secret: string) {
  if (!botToken) return false;
  if (!secret) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET is required when TELEGRAM_BOT_TOKEN is configured.");
  }
  return true;
}

export function buildTelegramWebhookPayload(baseUrl: string, secret: string) {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(secret)) {
    throw new Error("TELEGRAM_WEBHOOK_SECRET must use 1–256 letters, numbers, underscores, or hyphens.");
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("Set TELEGRAM_WEBHOOK_BASE_URL or RENDER_EXTERNAL_URL to a valid HTTPS service URL.");
  }

  if (
    parsedBaseUrl.protocol !== "https:" ||
    parsedBaseUrl.username ||
    parsedBaseUrl.password ||
    parsedBaseUrl.search ||
    parsedBaseUrl.hash
  ) {
    throw new Error("Telegram webhook service URL must be a clean HTTPS URL without credentials, query, or fragment.");
  }

  return {
    url: new URL(telegramWebhookPath, parsedBaseUrl.origin).toString(),
    secret_token: secret,
    allowed_updates: ["channel_post", "edited_channel_post"]
  };
}
