import { hashSync } from "bcryptjs";
import dotenv from "dotenv";

dotenv.config();

const isProduction = process.env.NODE_ENV === "production";
const defaultSessionSecret = "dev-session-secret-change-me";

function requireProductionEnv(name: string, value: string | undefined) {
  if (!isProduction) {
    return value ?? "";
  }

  if (!value || !value.trim()) {
    throw new Error(`${name} must be set in production.`);
  }

  return value;
}

function resolveAdminPasswordHash() {
  const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (adminPasswordHash) {
    return adminPasswordHash;
  }

  if (adminPassword) {
    if (isProduction && adminPassword.length < 12) {
      throw new Error("ADMIN_PASSWORD must be at least 12 characters in production.");
    }
    return hashSync(adminPassword, 10);
  }

  if (isProduction) {
    throw new Error("ADMIN_PASSWORD_HASH or ADMIN_PASSWORD must be set in production.");
  }

  return hashSync("admin1234", 10);
}

export const env = {
  host:
    process.env.HOST ??
    (isProduction ? "0.0.0.0" : "127.0.0.1"),
  port: Number(process.env.PORT ?? 4174),
  sessionSecret: isProduction
    ? requireProductionEnv("SESSION_SECRET", process.env.SESSION_SECRET)
    : process.env.SESSION_SECRET ?? defaultSessionSecret,
  secureCookies:
    process.env.SECURE_COOKIES === "true"
      ? true
      : process.env.SECURE_COOKIES === "false"
        ? false
        : isProduction,
  adminPasswordHash: resolveAdminPasswordHash(),
  sessionDurationMs: 1000 * 60 * 60 * 24,
  publicSiteUrl:
    process.env.PUBLIC_SITE_URL?.trim() ||
    process.env.RENDER_EXTERNAL_URL?.trim() ||
    "http://127.0.0.1:4174",
  publicApiAllowedOrigins: (process.env.PUBLIC_API_ALLOWED_ORIGINS ?? "https://anton5267.github.io")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN?.trim() || "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || "",
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID?.trim() || "",
  telegramAutoPublish: process.env.TELEGRAM_AUTO_PUBLISH !== "false",
  telegramAdminChatId: process.env.TELEGRAM_ADMIN_CHAT_ID?.trim() || ""
};
