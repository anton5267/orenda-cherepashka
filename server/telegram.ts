import { env } from "./env.js";
import {
  recordTelegramWebhookEvent,
  upsertTelegramNews
} from "./store.js";
import type { Lead, TelegramWebhookUpdate } from "../shared/models.js";
import { formatCurrencyAmount } from "../shared/priceFormat.js";

function cleanTelegramText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function getChannelKey() {
  return env.telegramChannelId.replace(/^@/, "").trim().toLowerCase();
}

function isAllowedChannel(
  chat: NonNullable<TelegramWebhookUpdate["channel_post"]>["chat"]
) {
  const configured = getChannelKey();
  if (!configured) {
    return false;
  }

  return (
    String(chat.id) === configured ||
    (chat.username ? chat.username.toLowerCase() === configured : false)
  );
}

function sourceUrlForMessage(message: NonNullable<TelegramWebhookUpdate["channel_post"]>) {
  if (message.chat.username) {
    return `https://t.me/${message.chat.username}/${message.message_id}`;
  }

  const channelId = String(message.chat.id).replace(/^-100/, "");
  return `https://t.me/c/${channelId}/${message.message_id}`;
}

function splitNewsText(rawText: string) {
  const lines = cleanTelegramText(rawText).split("\n");
  const title = lines.shift()?.trim() || "Оновлення з Telegram";
  const content = lines.join("\n").trim() || title;

  return {
    title: title.slice(0, 140),
    content: content.slice(0, 5000)
  };
}

function eventDetails(update: TelegramWebhookUpdate) {
  const message = update.channel_post ?? update.edited_channel_post ?? null;
  return {
    message,
    eventType: update.edited_channel_post ? "edited_channel_post" : "channel_post",
    updateId: typeof update.update_id === "number" ? update.update_id : null,
    chatId: message?.chat.id ?? null,
    messageId: message?.message_id ?? null
  };
}

export async function handleTelegramUpdate(update: TelegramWebhookUpdate) {
  const details = eventDetails(update);

  if (!details.message) {
    recordTelegramWebhookEvent({
      updateId: details.updateId,
      eventType: "unsupported",
      chatId: null,
      messageId: null,
      status: "ignored"
    });
    return { ignored: true };
  }

  if (!isAllowedChannel(details.message.chat)) {
    recordTelegramWebhookEvent({
      updateId: details.updateId,
      eventType: details.eventType,
      chatId: details.chatId,
      messageId: details.messageId,
      status: "ignored",
      errorMessage: "Channel is not configured for this webhook."
    });
    return { ignored: true, forbidden: true };
  }

  if (!env.telegramAutoPublish) {
    recordTelegramWebhookEvent({
      updateId: details.updateId,
      eventType: details.eventType,
      chatId: details.chatId,
      messageId: details.messageId,
      status: "ignored",
      errorMessage: "Automatic publication is disabled."
    });
    return { ignored: true };
  }

  const { title, content } = splitNewsText(details.message.text ?? details.message.caption ?? "");
  const publishedAt = new Date(details.message.date * 1000).toISOString();
  const news = upsertTelegramNews({
    title,
    content,
    dateLabel: new Date(details.message.date * 1000).toLocaleDateString("uk-UA", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    }),
    sourceUrl: sourceUrlForMessage(details.message),
    sourceChatId: details.message.chat.id,
    sourceMessageId: details.message.message_id,
    publishedAt
  });

  recordTelegramWebhookEvent({
    updateId: details.updateId,
    eventType: details.eventType,
    chatId: details.chatId,
    messageId: details.messageId,
    status: "processed"
  });

  return { ignored: false, newsId: news.id };
}

export async function notifyLeadInTelegram(lead: Lead) {
  if (!env.telegramBotToken || !env.telegramAdminChatId) {
    return;
  }

  const itemSummary = lead.items
    .map((item) =>
      `${item.labelSnapshot} — ${item.quantity} × ${formatCurrencyAmount(item.unitPriceSnapshot, item.currency)}`
    )
    .join("\n");
  const text = [
    "Нова заявка з сайту",
    `Ім'я: ${lead.name}`,
    `Контакт: ${lead.contact}`,
    lead.neededBy ? `Потрібно з: ${lead.neededBy}` : "",
    itemSummary ? `Товари:\n${itemSummary}` : "",
    lead.utmSource ? `Джерело: ${[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" · ")}` : "",
    lead.message ? `Коментар: ${lead.message}` : "",
    `ID: ${lead.id}`
  ]
    .filter(Boolean)
    .join("\n");

  await telegramRequest("sendMessage", {
    chat_id: env.telegramAdminChatId,
    text
  });
}

async function telegramRequest(method: string, body: Record<string, unknown>) {
  if (!env.telegramBotToken) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  }

  const response = await fetch(
    `https://api.telegram.org/bot${env.telegramBotToken}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram API returned ${response.status}.`);
  }

  const payload = (await response.json()) as { ok?: boolean; description?: string };
  if (!payload.ok) {
    throw new Error(payload.description || "Telegram API request failed.");
  }

  return payload;
}

export async function configureTelegramWebhook() {
  if (!env.telegramBotToken || !env.telegramWebhookSecret) {
    return;
  }

  await telegramRequest("setWebhook", {
    url: `${env.publicSiteUrl.replace(/\/$/, "")}/api/telegram/webhook`,
    secret_token: env.telegramWebhookSecret,
    allowed_updates: ["channel_post", "edited_channel_post"]
  });
}
