import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { errorMessage, httpError, jsonResponse, requiredEnv } from "../_shared/http.ts";
import { createSupabaseApiKeyFetch } from "../_shared/supabaseApiKeyHeaders.ts";

type TelegramMessage = {
  message_id: number;
  date: number;
  chat: { id: number; username?: string };
  text?: string;
  caption?: string;
};

function serviceClient() {
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY function secret");
  return createClient(requiredEnv("SUPABASE_URL"), key, {
    global: { fetch: createSupabaseApiKeyFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function secureEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

function parseMessage(value: unknown): TelegramMessage {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, "Некоректний Telegram-допис.");
  const message = value as Record<string, unknown>;
  const chat = message.chat && typeof message.chat === "object" ? message.chat as Record<string, unknown> : null;
  if (!chat || !Number.isSafeInteger(message.message_id) || Number(message.message_id) < 1 ||
      !Number.isSafeInteger(message.date) || Number(message.date) < 0 || !Number.isSafeInteger(chat.id)) {
    throw httpError(400, "Некоректний Telegram-допис.");
  }
  for (const field of ["text", "caption"] as const) {
    if (message[field] !== undefined && (typeof message[field] !== "string" || message[field].length > 4096)) {
      throw httpError(400, "Завеликий або некоректний текст Telegram-допису.");
    }
  }
  return {
    message_id: Number(message.message_id),
    date: Number(message.date),
    chat: {
      id: Number(chat.id),
      ...(typeof chat.username === "string" ? { username: chat.username.slice(0, 64) } : {})
    },
    ...(typeof message.text === "string" ? { text: message.text } : {}),
    ...(typeof message.caption === "string" ? { caption: message.caption } : {})
  };
}

function cleanPostText(message: TelegramMessage): string {
  return (message.text ?? message.caption ?? "")
    .replace(/\r/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, 5000);
}

function sourceUrl(message: TelegramMessage): string {
  const username = message.chat.username ?? Deno.env.get("TELEGRAM_CHANNEL_USERNAME") ?? "arenda_cherepashka";
  if (/^[A-Za-z0-9_]{5,64}$/.test(username)) return `https://t.me/${username}/${message.message_id}`;
  const channelPath = String(message.chat.id).replace(/^-100/, "");
  return `https://t.me/c/${channelPath}/${message.message_id}`;
}

async function writeEvent(
  client: ReturnType<typeof serviceClient>,
  details: { updateId: number; chatId: number | null; messageId: number | null; eventType: string; status: "processed" | "ignored" | "failed"; errorMessage?: string }
) {
  const { error } = await client.from("telegram_webhook_events").upsert({
    update_id: details.updateId,
    chat_id: details.chatId === null ? null : String(details.chatId),
    message_id: details.messageId,
    event_type: details.eventType,
    status: details.status,
    error_message: details.errorMessage?.slice(0, 300) ?? null
  }, { onConflict: "update_id" });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse(request, { message: "Метод не підтримується." }, 405);
  let expectedSecret: string;
  try {
    expectedSecret = requiredEnv("TELEGRAM_WEBHOOK_SECRET");
  } catch (error) {
    console.error("Telegram webhook is not configured:", errorMessage(error));
    return jsonResponse(request, { message: "Webhook не налаштовано." }, 503);
  }
  if (!secureEqual(request.headers.get("x-telegram-bot-api-secret-token") ?? "", expectedSecret)) {
    return jsonResponse(request, { message: "Невірний webhook secret." }, 401);
  }

  let updateId: number | null = null;
  let message: TelegramMessage | null = null;
  let eventType = "unsupported";
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!Number.isSafeInteger(body.update_id) || Number(body.update_id) < 0) {
      throw httpError(400, "Некоректний Telegram update.");
    }
    updateId = Number(body.update_id);
    const rawMessage = body.channel_post ?? body.edited_channel_post;
    eventType = body.edited_channel_post ? "edited_channel_post" : body.channel_post ? "channel_post" : "unsupported";
    const client = serviceClient();

    const { data: previous, error: previousError } = await client.from("telegram_webhook_events")
      .select("status").eq("update_id", updateId).maybeSingle();
    if (previousError) throw previousError;
    if (previous && previous.status !== "failed") {
      return jsonResponse(request, { ok: true, duplicate: true });
    }

    if (rawMessage === undefined) {
      await writeEvent(client, { updateId, chatId: null, messageId: null, eventType, status: "ignored" });
      return jsonResponse(request, { ok: true, ignored: true });
    }
    message = parseMessage(rawMessage);
    if (String(message.chat.id) !== requiredEnv("TELEGRAM_CHANNEL_ID")) {
      return jsonResponse(request, { message: "Цей Telegram-канал не дозволено." }, 403);
    }

    const { data: settingsRow, error: settingsError } = await client.from("site_settings")
      .select("data").eq("singleton", true).single();
    if (settingsError) throw settingsError;
    const environmentEnabled = (Deno.env.get("TELEGRAM_AUTO_PUBLISH") ?? "true").toLowerCase() === "true";
    const autoPublish = environmentEnabled && settingsRow.data?.telegramAutoPublish !== false;
    const postText = cleanPostText(message);
    if (!autoPublish || !postText) {
      const reason = !autoPublish ? "auto_publish_disabled" : "empty_post";
      await writeEvent(client, {
        updateId, chatId: message.chat.id, messageId: message.message_id,
        eventType: `${eventType}_${reason}`, status: "ignored"
      });
      return jsonResponse(request, { ok: true, ignored: true, autoPublish });
    }

    const [firstLine, ...rest] = postText.split("\n");
    const title = (firstLine.trim() || "Оновлення Telegram-каналу").slice(0, 240);
    const content = (rest.join("\n").trim() || postText).slice(0, 5000);
    const publishedAt = new Date(message.date * 1000).toISOString();
    const link = sourceUrl(message);
    const { data: previousNews, error: newsLookupError } = await client.from("site_content")
      .select("id,sort_order,payload,is_active").eq("kind", "news")
      .eq("source_chat_id", String(message.chat.id)).eq("source_message_id", message.message_id).maybeSingle();
    if (newsLookupError) throw newsLookupError;
    let sortOrder = previousNews?.sort_order;
    if (sortOrder === undefined) {
      const { data: firstNews, error: orderError } = await client.from("site_content").select("sort_order")
        .eq("kind", "news").order("sort_order", { ascending: true }).limit(1).maybeSingle();
      if (orderError) throw orderError;
      sortOrder = Number(firstNews?.sort_order ?? 0) - 1;
    }
    const payload = {
      ...(previousNews?.payload ?? {}),
      id: previousNews?.id ?? `telegram-${message.chat.id}-${message.message_id}`,
      title, dateLabel: new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium" }).format(new Date(publishedAt)),
      content, sortOrder, isActive: previousNews?.is_active ?? true, sourceType: "telegram", sourceUrl: link,
      sourceChatId: message.chat.id, sourceMessageId: message.message_id,
      publishedAt, updatedAt: new Date().toISOString()
    };
    const { error: upsertError } = await client.from("site_content").upsert({
      kind: "news", id: payload.id, payload, sort_order: sortOrder, is_active: payload.isActive,
      is_moderated: true, updated_at: payload.updatedAt, source_type: "telegram",
      source_url: link, source_chat_id: String(message.chat.id),
      source_message_id: message.message_id, published_at: publishedAt
    }, { onConflict: "source_chat_id,source_message_id" });
    if (upsertError) throw upsertError;
    await writeEvent(client, {
      updateId, chatId: message.chat.id, messageId: message.message_id,
      eventType, status: "processed"
    });
    return jsonResponse(request, { ok: true, published: true, newsId: payload.id });
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status) : 500;
    if (status >= 500) console.error("Telegram webhook error:", errorMessage(error));
    if (updateId !== null && status >= 500) {
      try {
        await writeEvent(serviceClient(), {
          updateId, chatId: message?.chat.id ?? null, messageId: message?.message_id ?? null,
          eventType, status: "failed", errorMessage: errorMessage(error)
        });
      } catch (eventError) {
        console.error("Could not record failed Telegram event:", errorMessage(eventError));
      }
    }
    return jsonResponse(request, {
      message: status >= 500 ? "Не вдалося обробити Telegram-допис." : errorMessage(error)
    }, status || 500);
  }
});
