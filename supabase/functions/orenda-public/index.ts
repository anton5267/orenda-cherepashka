import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { errorMessage, getApiPath, httpError, jsonResponse, requiredEnv } from "../_shared/http.ts";
import { createSupabaseApiKeyFetch, readSupabaseSecretKey } from "../_shared/supabaseApiKeyHeaders.ts";

type JsonObject = Record<string, unknown>;
type Product = {
  id: string;
  name: string;
  isActive: boolean;
  pricingOptions: Array<{
    id: string;
    label: string;
    price: number;
    currency: "UAH" | "USD";
    compareAt: number | null;
    isActive: boolean;
  }>;
};

type PublicTelegramNewsItem = {
  id: string;
  title: string;
  dateLabel: string;
  content: string;
  sortOrder: number;
  isActive: true;
  sourceType: "telegram";
  sourceUrl: string;
  sourceMessageId: number;
  publishedAt: string;
  updatedAt: string;
};

let telegramFeedCache: { expiresAt: number; items: PublicTelegramNewsItem[] } | null = null;

function serviceClient() {
  const key = readSupabaseSecretKey((name) => Deno.env.get(name));
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY function secret");
  return createClient(requiredEnv("SUPABASE_URL"), key, {
    global: { fetch: createSupabaseApiKeyFetch(key) },
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Тіло запиту має бути JSON-об’єктом.");
  }
  return value as JsonObject;
}

function cleanText(value: unknown, min: number, max: number, label: string): string {
  if (typeof value !== "string") throw httpError(400, `Перевір поле «${label}».`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max) {
    throw httpError(400, `Поле «${label}» має містити від ${min} до ${max} символів.`);
  }
  return cleaned;
}

function optionalUtm(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length > 100 || /[<>\u0000-\u001f]/.test(value)) {
    throw httpError(400, "UTM-мітки мають містити не більше 100 безпечних символів.");
  }
  return value.trim() || null;
}

async function hashClientKey(secret: string, purpose: string, request: Request): Promise<string> {
  const clientIp = request.headers.get("x-real-ip") ?? request.headers.get("x-forwarded-for") ?? "unknown";
  const ip = clientIp.split(",")[0].trim().slice(0, 100) || "unknown";
  const hmacKey = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(`${purpose}:${ip}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function checkRateLimit(
  client: ReturnType<typeof serviceClient>,
  request: Request,
  purpose: string,
  max: number,
  seconds: number
) {
  const secretKey = readSupabaseSecretKey((name) => Deno.env.get(name));
  if (!secretKey) throw new Error("Missing Supabase secret API key function environment variable");
  const { data, error } = await client.rpc("consume_lead_rate_limit", {
    p_key_hash: await hashClientKey(secretKey, purpose, request),
    p_max_requests: max,
    p_window_seconds: seconds
  });
  if (error) throw error;
  return data === true;
}

async function readPublicContent(client: ReturnType<typeof serviceClient>, kind: string) {
  const query = client.from("site_content").select("payload, updated_at")
    .eq("kind", kind).eq("is_active", true).order("sort_order", { ascending: true });
  const { data, error } = kind === "review" ? await query.eq("is_moderated", true) : await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ ...row.payload, updatedAt: row.updated_at }));
}

function decodeTelegramEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (match, digits: string) => {
      const point = Number(digits);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    })
    .replace(/&#x([\da-f]+);/gi, (match, digits: string) => {
      const point = parseInt(digits, 16);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : match;
    });
}

function parseTelegramPublicHtml(html: string): PublicTelegramNewsItem[] {
  const channel = "arenda_cherepashka";
  const starts = [...html.matchAll(/<div\b[^>]*class="[^"]*\btgme_widget_message_wrap\b[^"]*"[^>]*>/g)];
  const seen = new Set<number>();
  const items: PublicTelegramNewsItem[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    if (start === undefined) continue;
    const block = html.slice(start, starts[index + 1]?.index ?? html.length);
    const post = block.match(new RegExp(`data-post="${channel}/(\\d+)"`));
    const textStart = block.search(/<div\b[^>]*class="[^"]*\btgme_widget_message_text\b[^"]*"[^>]*>/i);
    if (!post || textStart < 0) continue;

    const sourceMessageId = Number(post[1]);
    if (!Number.isSafeInteger(sourceMessageId) || seen.has(sourceMessageId)) continue;
    seen.add(sourceMessageId);
    const markup = block.slice(textStart);
    const openEnd = markup.indexOf(">");
    const closeAt = markup.indexOf("</div>", openEnd + 1);
    if (openEnd < 0 || closeAt < 0) continue;
    const message = decodeTelegramEntities(markup.slice(openEnd + 1, closeAt)
      .replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, ""))
      .replace(/[\t\f\v ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
    if (!message) continue;
    const [firstLine, ...rest] = message.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!firstLine) continue;
    const time = block.match(/<time\b[^>]*datetime="([^"]+)"/i)?.[1];
    const timestamp = time ? Date.parse(time) : Number.NaN;
    const publishedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString();
    const title = firstLine.length > 110 ? `${firstLine.slice(0, 107).trimEnd()}…` : firstLine;
    const body = [firstLine.length > 110 ? firstLine : "", ...rest].filter(Boolean).join("\n").trim();
    const fullContent = body || message;
    items.push({
      id: `telegram-${sourceMessageId}`, title,
      dateLabel: new Intl.DateTimeFormat("uk-UA", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv"
      }).format(new Date(publishedAt)),
      content: fullContent.length > 900 ? `${fullContent.slice(0, 897).trimEnd()}…` : fullContent,
      sortOrder: 0, isActive: true, sourceType: "telegram",
      sourceUrl: `https://t.me/${channel}/${sourceMessageId}`, sourceMessageId, publishedAt, updatedAt: publishedAt
    });
  }

  return items.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, 6).map((item, sortOrder) => ({ ...item, sortOrder }));
}

async function fetchPublicTelegramFeed(): Promise<PublicTelegramNewsItem[]> {
  const response = await fetch("https://t.me/s/arenda_cherepashka", {
    headers: { "user-agent": "OrendaCherepashka-NewsFeed/1.0" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Telegram channel returned HTTP ${response.status}`);
  const items = parseTelegramPublicHtml(await response.text());
  if (!items.length) throw new Error("No public Telegram posts were found");
  return items;
}

async function readFreshTelegramNews() {
  if (telegramFeedCache && telegramFeedCache.expiresAt > Date.now()) return telegramFeedCache.items;
  try {
    const items = await fetchPublicTelegramFeed();
    telegramFeedCache = { items, expiresAt: Date.now() + 10 * 60 * 1000 };
    return items;
  } catch (error) {
    console.error("Live Telegram news refresh failed:", errorMessage(error));
    return telegramFeedCache?.items ?? [];
  }
}

function validNeededBy(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, "Вкажи коректну дату, коли потрібна підписка.");
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) {
    throw httpError(400, "Вкажи коректну дату, коли потрібна підписка.");
  }
  return value;
}

async function createLead(request: Request, client: ReturnType<typeof serviceClient>) {
  const body = asObject(await request.json().catch(() => null));
  const name = cleanText(body.name, 2, 80, "ім’я");
  const contact = cleanText(body.contact, 3, 120, "контакт");
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (message.length > 1000) throw httpError(400, "Коментар має містити не більше 1000 символів.");
  const neededBy = validNeededBy(body.neededBy);
  const utmSource = optionalUtm(body.utmSource);
  const utmMedium = optionalUtm(body.utmMedium);
  const utmCampaign = optionalUtm(body.utmCampaign);
  const requestedItems = Array.isArray(body.items) ? body.items : [];
  if (requestedItems.length > 20) throw httpError(400, "У заявці може бути не більше 20 позицій.");
  const itemsToCreate = requestedItems.length
    ? requestedItems
    : typeof body.productId === "string" && body.productId.trim()
      ? [{ productId: body.productId, quantity: 1 }]
      : [];
  if (!itemsToCreate.length) throw httpError(400, "Оберіть товар і тариф для заявки.");

  if (!await checkRateLimit(client, request, "lead", 10, 600)) {
    return jsonResponse(request, { message: "Забагато заявок. Спробуй трохи пізніше." }, 429, { "Retry-After": "600" });
  }

  const items: Array<Record<string, unknown>> = [];
  for (const rawItem of itemsToCreate) {
    const item = asObject(rawItem);
    const productId = cleanText(item.productId, 1, 120, "товар");
    const quantity = Number(item.quantity ?? 1);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw httpError(400, "Перевір кількість товару.");
    }

    const { data: productRow, error: productError } = await client.from("site_content")
      .select("payload").eq("kind", "product").eq("id", productId).eq("is_active", true).maybeSingle();
    if (productError) throw productError;
    if (!productRow) throw httpError(400, "Обраний товар зараз недоступний.");

    const product = productRow.payload as Product;
    const activeOptions = product.pricingOptions?.filter((option) => option.isActive) ?? [];
    const options = activeOptions.length ? activeOptions : product.pricingOptions ?? [];
    const requestedOptionId = typeof item.pricingOptionId === "string" ? item.pricingOptionId.trim() : "";
    const option = requestedOptionId
      ? options.find((candidate) => candidate.id === requestedOptionId)
      : [...options].sort((left, right) => left.price - right.price)[0];
    if (!option) throw httpError(400, "Обраний тариф більше недоступний.");

    items.push({
      id: crypto.randomUUID(),
      productId: product.id,
      pricingOptionId: option.id,
      labelSnapshot: `${product.name} — ${option.label}`,
      unitPriceSnapshot: option.price,
      currency: option.currency === "USD" ? "USD" : "UAH",
      compareAtSnapshot: option.compareAt ?? null,
      quantity
    });
  }

  const { data, error } = await client.from("lead_requests").insert({
    name, contact, message, items, needed_by: neededBy,
    utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign
  }).select("id, name, contact, items, message, status, needed_by, utm_source, utm_medium, utm_campaign, created_at").single();
  if (error) throw error;

  const lead = {
    id: data.id,
    name: data.name,
    contact: data.contact,
    items: data.items,
    message: data.message,
    status: data.status,
    neededBy: data.needed_by,
    utmSource: data.utm_source,
    utmMedium: data.utm_medium,
    utmCampaign: data.utm_campaign,
    createdAt: data.created_at
  };
  await notifyLead(lead);
  return jsonResponse(request, lead, 201);
}

async function notifyLead(lead: Record<string, unknown>) {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const chatId = Deno.env.get("TELEGRAM_ADMIN_CHAT_ID");
  if (!token || !chatId) return;
  const items = Array.isArray(lead.items) ? lead.items as Array<Record<string, unknown>> : [];
  const itemLines = items.map((item) => {
    const currency = item.currency === "USD" ? "$" : "₴";
    return `${item.labelSnapshot} · ${item.quantity} × ${currency}${item.unitPriceSnapshot}`;
  });
  const message = [
    "Нова заявка з сайту Orenda",
    `Ім’я: ${lead.name}`,
    `Контакт: ${lead.contact}`,
    lead.neededBy ? `Потрібно з: ${lead.neededBy}` : "",
    itemLines.length ? `Товари:\n${itemLines.join("\n")}` : "",
    lead.utmSource ? `Джерело: ${[lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(" · ")}` : "",
    lead.message ? `Коментар: ${lead.message}` : "",
    `ID: ${lead.id}`
  ].filter(Boolean).join("\n").slice(0, 3500);

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message }),
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) console.error("Telegram lead notification failed with status", response.status);
  } catch (error) {
    console.error("Lead saved but Telegram notification failed:", errorMessage(error));
  }
}

async function recordAnalyticsEvent(request: Request, client: ReturnType<typeof serviceClient>) {
  const body = asObject(await request.json().catch(() => null));
  const eventName = body.eventName;
  if (!(["page_view", "product_view", "telegram_click"] as unknown[]).includes(eventName)) {
    throw httpError(400, "Невідомий тип події аналітики.");
  }
  const path = cleanText(body.path, 1, 200, "шлях");
  if (!/^\/(?:[A-Za-z0-9._~/-]*)$/.test(path)) throw httpError(400, "Некоректний шлях події.");
  const productSlug = body.productSlug === undefined || body.productSlug === null
    ? null : cleanText(body.productSlug, 1, 120, "товар");
  if (productSlug && !/^[\p{L}\p{N}._-]+$/u.test(productSlug)) throw httpError(400, "Некоректний товар.");
  const utmSource = optionalUtm(body.utmSource);
  const utmMedium = optionalUtm(body.utmMedium);
  const utmCampaign = optionalUtm(body.utmCampaign);

  if (!await checkRateLimit(client, request, "analytics", 120, 600)) {
    return jsonResponse(request, { message: "Забагато аналітичних подій." }, 429, { "Retry-After": "600" });
  }
  const { error } = await client.from("analytics_events").insert({
    event_name: eventName, path, product_slug: productSlug,
    utm_source: utmSource, utm_medium: utmMedium, utm_campaign: utmCampaign
  });
  if (error) throw error;
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { error: pruneError } = await client.from("analytics_events").delete().lt("created_at", cutoff);
  if (pruneError) console.error("Analytics retention cleanup failed:", errorMessage(pruneError));
  return jsonResponse(request, null, 204);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, null, 204);
  if (!(["GET", "POST"].includes(request.method))) {
    return jsonResponse(request, { message: "Метод не підтримується." }, 405);
  }

  try {
    const path = getApiPath(request);
    const client = serviceClient();
    if (request.method === "GET" && path === "/api/health") {
      const { error } = await client.from("site_settings").select("singleton").eq("singleton", true).maybeSingle();
      if (error) throw error;
      return jsonResponse(request, { ok: true, service: "orenda-cherepashka", provider: "supabase" });
    }
    if (request.method === "GET" && path === "/api/site") {
      const { data, error } = await client.from("site_settings").select("data").eq("singleton", true).maybeSingle();
      if (error) throw error;
      return jsonResponse(request, data?.data ?? {});
    }

    const publicKinds: Record<string, string> = {
      "/api/categories": "category", "/api/products": "product", "/api/faqs": "faq",
      "/api/news": "news", "/api/reviews": "review"
    };
    if (request.method === "GET" && publicKinds[path]) {
      const content = await readPublicContent(client, publicKinds[path]);
      if (path === "/api/news" && (Deno.env.get("TELEGRAM_AUTO_PUBLISH") ?? "true").toLowerCase() === "true") {
        const { data: settings, error: settingsError } = await client.from("site_settings")
          .select("data").eq("singleton", true).maybeSingle();
        if (settingsError) throw settingsError;
        if (settings?.data?.telegramAutoPublish !== false) {
          return jsonResponse(request, [...content, ...await readFreshTelegramNews()]);
        }
      }
      return jsonResponse(request, content);
    }
    if (request.method === "GET" && path === "/api/news/excluded") {
      const { data, error } = await client.from("site_content")
        .select("source_url,source_message_id")
        .eq("kind", "news").eq("source_type", "telegram").eq("is_active", false);
      if (error) throw error;
      return jsonResponse(request, (data ?? []).map((row) => ({
        sourceUrl: row.source_url,
        sourceMessageId: row.source_message_id
      })));
    }
    if (request.method === "POST" && path === "/api/leads") return await createLead(request, client);
    if (request.method === "POST" && path === "/api/analytics/events") return await recordAnalyticsEvent(request, client);
    return jsonResponse(request, { message: "Маршрут не знайдено." }, 404);
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status) : 500;
    if (status >= 500) console.error("Public API error:", errorMessage(error));
    const message = status >= 500 ? "Не вдалося виконати запит. Спробуй ще раз." : errorMessage(error);
    return jsonResponse(request, { message }, status || 500);
  }
});
