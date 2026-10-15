import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { errorMessage, getApiPath, getRouteId, httpError, jsonResponse, requiredEnv } from "../_shared/http.ts";

type JsonObject = Record<string, unknown>;
const kindByRoute: Record<string, string> = {
  categories: "category", products: "product", faqs: "faq", news: "news", reviews: "review"
};

function serviceClient() {
  const key = Deno.env.get("SUPABASE_SECRET_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("Missing SUPABASE_SECRET_KEY function secret");
  return createClient(requiredEnv("SUPABASE_URL"), key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw httpError(400, "Некоректні дані.");
  return value as JsonObject;
}

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function numeric(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function flag(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function optionalSafeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function requiredText(value: unknown, max: number, label: string): string {
  const result = text(value, max);
  if (!result) throw httpError(400, `Заповни поле «${label}».`);
  return result;
}

function slugFrom(value: string): string {
  return value.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 180);
}

function preparePayload(kind: string, input: JsonObject, existing?: JsonObject): JsonObject {
  const payload = { ...(existing ?? {}), ...input };
  const id = existing?.id ? String(existing.id) : text(input.id, 120) || crypto.randomUUID();
  const sortOrder = Math.trunc(numeric(payload.sortOrder, 0));
  const isActive = flag(payload.isActive);
  const updatedAt = new Date().toISOString();

  if (kind === "category") {
    const name = requiredText(payload.name, 120, "назву категорії");
    return { ...payload, id, name, slug: text(payload.slug, 180) || slugFrom(name), icon: text(payload.icon, 20) || "✨", sortOrder, isActive, updatedAt };
  }
  if (kind === "product") {
    const name = requiredText(payload.name, 160, "назву товару");
    const categoryId = requiredText(payload.categoryId, 120, "категорію");
    const summary = requiredText(payload.summary, 600, "короткий опис");
    const logo = requiredText(payload.logo, 500, "логотип");
    if (!Array.isArray(payload.pricingOptions) || !payload.pricingOptions.length || payload.pricingOptions.length > 30) {
      throw httpError(400, "Додай хоча б один тариф і перевір їхню кількість.");
    }
    const pricingOptions = payload.pricingOptions.map((raw, index) => {
      const item = asObject(raw);
      const label = requiredText(item.label, 140, "назву тарифу");
      const price = Number(item.price);
      const compareAt = item.compareAt === null || item.compareAt === "" || item.compareAt === undefined
        ? null : Number(item.compareAt);
      if (!Number.isFinite(price) || price < 0 || (compareAt !== null && (!Number.isFinite(compareAt) || compareAt < 0))) {
        throw httpError(400, "Перевір ціну та ціну до знижки кожного тарифу.");
      }
      if (item.currency !== "UAH" && item.currency !== "USD") throw httpError(400, "Вкажи валюту тарифу.");
      return {
        id: text(item.id, 120) || crypto.randomUUID(),
        label, price, currency: item.currency,
        compareAt,
        sortOrder: Math.trunc(numeric(item.sortOrder, index + 1)),
        isActive: flag(item.isActive)
      };
    });
    const details = Array.isArray(payload.details)
      ? payload.details.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean).slice(0, 30)
      : [];
    return {
      ...payload, id, name, slug: text(payload.slug, 180) || slugFrom(name), categoryId,
      summary, details, logo, isHot: flag(payload.isHot, false), sortOrder, isActive,
      pricingOptions, updatedAt
    };
  }
  if (kind === "faq") {
    return {
      ...payload, id,
      question: requiredText(payload.question, 300, "запитання"),
      answer: requiredText(payload.answer, 4000, "відповідь"),
      sortOrder, isActive, updatedAt
    };
  }
  if (kind === "news") {
    const publishedAt = typeof payload.publishedAt === "string" && Number.isFinite(Date.parse(payload.publishedAt))
      ? payload.publishedAt : undefined;
    const sourceType = payload.sourceType === "telegram" ? "telegram" : "manual";
    return {
      ...payload, id,
      title: requiredText(payload.title, 240, "заголовок новини"),
      dateLabel: text(payload.dateLabel, 120),
      content: requiredText(payload.content, 5000, "текст новини"),
      sortOrder, isActive, sourceType,
      sourceUrl: text(payload.sourceUrl, 500) || undefined,
      sourceChatId: optionalSafeInteger(payload.sourceChatId),
      sourceMessageId: optionalSafeInteger(payload.sourceMessageId),
      publishedAt, updatedAt
    };
  }
  if (kind === "review") {
    const rating = Math.round(numeric(payload.rating, 0));
    if (rating < 1 || rating > 5) throw httpError(400, "Оцінка має бути від 1 до 5.");
    const createdAt = typeof payload.createdAt === "string" && Number.isFinite(Date.parse(payload.createdAt))
      ? payload.createdAt : updatedAt;
    return {
      ...payload, id,
      name: requiredText(payload.name, 120, "автора відгуку"),
      rating,
      content: requiredText(payload.content, 2000, "текст відгуку"),
      sortOrder, isActive,
      isModerated: flag(payload.isModerated, false),
      createdAt, updatedAt
    };
  }
  throw httpError(404, "Невідомий тип даних.");
}

function contentRow(kind: string, payload: JsonObject) {
  return {
    kind,
    id: String(payload.id),
    payload,
    sort_order: Number(payload.sortOrder ?? 0),
    is_active: Boolean(payload.isActive),
    is_moderated: kind !== "review" || Boolean(payload.isModerated),
    updated_at: new Date().toISOString(),
    source_type: kind === "news" ? payload.sourceType ?? "manual" : null,
    source_url: kind === "news" ? payload.sourceUrl ?? null : null,
    source_chat_id: kind === "news" && payload.sourceChatId != null ? String(payload.sourceChatId) : null,
    source_message_id: kind === "news" ? payload.sourceMessageId ?? null : null,
    published_at: kind === "news" ? payload.publishedAt ?? null : null
  };
}

function mapContent(row: { payload: JsonObject; updated_at: string }) {
  return { ...row.payload, updatedAt: row.updated_at };
}

async function saveContent(client: ReturnType<typeof serviceClient>, kind: string, payload: JsonObject) {
  const { data, error } = await client.from("site_content").upsert(contentRow(kind, payload), { onConflict: "kind,id" })
    .select("payload, updated_at").single();
  if (error) throw error;
  return mapContent(data);
}

async function requireCategory(client: ReturnType<typeof serviceClient>, categoryId: string) {
  const { data, error } = await client.from("site_content").select("id")
    .eq("kind", "category").eq("id", categoryId).maybeSingle();
  if (error) throw error;
  if (!data) throw httpError(400, "Категорію не знайдено.");
}

async function bulkContent(client: ReturnType<typeof serviceClient>, kind: string, body: JsonObject) {
  const ids = Array.isArray(body.ids)
    ? [...new Set(body.ids.filter((id): id is string => typeof id === "string").map((id) => id.trim()).filter(Boolean))].slice(0, 200)
    : [];
  const action = text(body.action, 32);
  if (!ids.length) throw httpError(400, "Не вибрано жодного запису.");

  if (kind === "lead") {
    if (!["new", "contacted", "closed"].includes(action)) throw httpError(400, "Непідтримувана дія для заявок.");
    const { data, error } = await client.from("lead_requests").update({ status: action }).in("id", ids).select("id");
    if (error) throw error;
    return { count: data?.length ?? 0 };
  }

  if (action === "delete") {
    if (kind === "category") {
      const { data: products, error: productError } = await client.from("site_content").select("payload")
        .eq("kind", "product");
      if (productError) throw productError;
      const inUse = (products ?? []).some((row) => ids.includes(String(row.payload.categoryId)));
      if (inUse) throw httpError(409, "Спочатку перенеси товари з категорії або видали їх.");
    }
    const { data, error } = await client.from("site_content").delete().eq("kind", kind).in("id", ids).select("id");
    if (error) throw error;
    return { count: data?.length ?? 0 };
  }

  let patch: JsonObject;
  if (action === "activate") patch = { isActive: true };
  else if (action === "deactivate") patch = { isActive: false };
  else if (kind === "review" && action === "moderate") patch = { isModerated: true };
  else if (kind === "review" && action === "unmoderate") patch = { isModerated: false };
  else throw httpError(400, "Непідтримувана bulk-дія.");

  const { data: rows, error: readError } = await client.from("site_content").select("kind,id,payload")
    .eq("kind", kind).in("id", ids);
  if (readError) throw readError;
  const updates = (rows ?? []).map((row) => {
    const payload = { ...row.payload, ...patch, updatedAt: new Date().toISOString() };
    return contentRow(kind, payload);
  });
  if (updates.length) {
    const { error } = await client.from("site_content").upsert(updates, { onConflict: "kind,id" });
    if (error) throw error;
  }
  return { count: updates.length };
}

async function listContent(client: ReturnType<typeof serviceClient>, kind: string) {
  const { data, error } = await client.from("site_content").select("payload,updated_at")
    .eq("kind", kind).order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapContent);
}

async function handleAdmin(request: Request, client: ReturnType<typeof serviceClient>, path: string) {
  if (request.method === "GET" && path === "/api/admin/session") return jsonResponse(request, { authenticated: true });
  if (request.method === "GET" && path === "/api/admin/analytics") {
    const { data, error } = await client.rpc("get_analytics_summary", { p_period_days: 30 });
    if (error) throw error;
    return jsonResponse(request, data);
  }
  if (request.method === "GET" && path === "/api/admin/telegram/events") {
    const { data, error } = await client.from("telegram_webhook_events")
      .select("id,update_id,chat_id,message_id,event_type,status,error_message,created_at")
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw error;
    return jsonResponse(request, (data ?? []).map((event) => ({
      id: event.id, updateId: event.update_id, chatId: event.chat_id,
      messageId: event.message_id, eventType: event.event_type, status: event.status,
      errorMessage: event.error_message, createdAt: event.created_at
    })));
  }

  if (path === "/api/admin/settings") {
    if (request.method === "GET") {
      const { data, error } = await client.from("site_settings").select("data").eq("singleton", true).single();
      if (error) throw error;
      return jsonResponse(request, data.data);
    }
    if (request.method === "PATCH") {
      const body = asObject(await request.json().catch(() => null));
      const { data: current, error: readError } = await client.from("site_settings").select("data")
        .eq("singleton", true).single();
      if (readError) throw readError;
      const allowedStringKeys = [
        "siteName", "telegramContactUrl", "telegramNewsChannelUrl", "telegramReviewsChannelUrl",
        "heroTitle", "heroSubtitle", "footerDescription", "leadTitle", "leadSubtitle"
      ];
      const patch: JsonObject = {};
      for (const key of allowedStringKeys) {
        if (body[key] !== undefined) {
          const value = requiredText(body[key], 2000, key);
          if (key.startsWith("telegram") && !/^https:\/\/(?:www\.)?t\.me\/[\w\d_]+$/i.test(value)) {
            throw httpError(400, `Поле «${key}» має бути коректним Telegram-посиланням.`);
          }
          patch[key] = value;
        }
      }
      if (body.telegramAutoPublish !== undefined) {
        if (typeof body.telegramAutoPublish !== "boolean") throw httpError(400, "Перевір налаштування автопублікації.");
        patch.telegramAutoPublish = body.telegramAutoPublish;
      }
      const next = { ...(current.data ?? {}), ...patch };
      const { data, error } = await client.from("site_settings")
        .upsert({ singleton: true, data: next, updated_at: new Date().toISOString() }, { onConflict: "singleton" })
        .select("data").single();
      if (error) throw error;
      return jsonResponse(request, data.data);
    }
  }

  if (path === "/api/admin/leads" && request.method === "GET") {
    const { data, error } = await client.from("lead_requests")
      .select("id,name,contact,items,message,status,needed_by,utm_source,utm_medium,utm_campaign,created_at")
      .order("created_at", { ascending: false }).limit(1000);
    if (error) throw error;
    return jsonResponse(request, (data ?? []).map((lead) => ({
      id: lead.id, name: lead.name, contact: lead.contact, items: lead.items,
      message: lead.message, status: lead.status, neededBy: lead.needed_by,
      utmSource: lead.utm_source, utmMedium: lead.utm_medium,
      utmCampaign: lead.utm_campaign, createdAt: lead.created_at
    })));
  }
  if (path === "/api/admin/leads/bulk" && request.method === "PATCH") {
    return jsonResponse(request, await bulkContent(client, "lead", asObject(await request.json().catch(() => null))));
  }
  if (/^\/api\/admin\/leads\/[^/]+$/.test(path) && request.method === "PATCH") {
    const body = asObject(await request.json().catch(() => null));
    const status = text(body.status, 24);
    if (!["new", "contacted", "closed"].includes(status)) throw httpError(400, "Некоректний статус заявки.");
    const { data, error } = await client.from("lead_requests").update({ status }).eq("id", getRouteId(path))
      .select("id,name,contact,items,message,status,needed_by,utm_source,utm_medium,utm_campaign,created_at").maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, "Заявку не знайдено.");
    return jsonResponse(request, {
      id: data.id, name: data.name, contact: data.contact, items: data.items,
      message: data.message, status: data.status, neededBy: data.needed_by,
      utmSource: data.utm_source, utmMedium: data.utm_medium,
      utmCampaign: data.utm_campaign, createdAt: data.created_at
    });
  }

  const segments = path.split("/").filter(Boolean);
  const section = segments[2] ?? "";
  const kind = kindByRoute[section];
  if (!kind) return jsonResponse(request, { message: "Маршрут не знайдено." }, 404);
  const collectionPath = `/api/admin/${section}`;
  if (path === collectionPath && request.method === "GET") return jsonResponse(request, await listContent(client, kind));
  if (path === `${collectionPath}/bulk` && request.method === "PATCH") {
    return jsonResponse(request, await bulkContent(client, kind, asObject(await request.json().catch(() => null))));
  }
  if (path === collectionPath && request.method === "POST") {
    const payload = preparePayload(kind, asObject(await request.json().catch(() => null)));
    if (kind === "product") await requireCategory(client, String(payload.categoryId));
    return jsonResponse(request, await saveContent(client, kind, payload), 201);
  }

  const id = getRouteId(path);
  if (segments.length !== 4 || !id) return jsonResponse(request, { message: "Маршрут не знайдено." }, 404);
  if (request.method === "PATCH") {
    const { data: row, error } = await client.from("site_content").select("payload,updated_at")
      .eq("kind", kind).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!row) throw httpError(404, "Запис не знайдено.");
    const payload = preparePayload(kind, asObject(await request.json().catch(() => null)), { ...row.payload, id });
    if (kind === "product") await requireCategory(client, String(payload.categoryId));
    return jsonResponse(request, await saveContent(client, kind, payload));
  }
  if (request.method === "DELETE") {
    if (kind === "news") {
      const { data: existing, error: readError } = await client.from("site_content")
        .select("payload,source_type").eq("kind", kind).eq("id", id).maybeSingle();
      if (readError) throw readError;
      if (!existing) throw httpError(404, "Запис не знайдено.");
      if (existing.source_type === "telegram" || existing.payload.sourceType === "telegram") {
        await saveContent(client, kind, {
          ...existing.payload,
          isActive: false,
          updatedAt: new Date().toISOString()
        });
        return jsonResponse(request, null, 204);
      }
    }
    if (kind === "category") {
      const { data: products, error: readError } = await client.from("site_content").select("payload")
        .eq("kind", "product");
      if (readError) throw readError;
      if ((products ?? []).some((row) => String(row.payload.categoryId) === id)) {
        throw httpError(409, "Спочатку перенеси товари з категорії або видали їх.");
      }
    }
    const { data, error } = await client.from("site_content").delete().eq("kind", kind).eq("id", id)
      .select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw httpError(404, "Запис не знайдено.");
    return jsonResponse(request, null, 204);
  }
  return jsonResponse(request, { message: "Метод не підтримується." }, 405);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return jsonResponse(request, null, 204);
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) {
    return jsonResponse(request, { message: "Метод не підтримується." }, 405);
  }
  try {
    const path = getApiPath(request);
    const client = serviceClient();
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.replace(/^Bearer\s+/i, "").trim();
    if (!token || token === (Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "")) {
      return jsonResponse(request, { message: "Потрібна авторизація." }, 401);
    }
    const { data, error } = await client.auth.getUser(token);
    if (error || !data.user) return jsonResponse(request, { message: "Сесію завершено. Увійди знову." }, 401);
    const adminEmail = requiredEnv("ADMIN_EMAIL").toLowerCase();
    if (data.user.email?.toLowerCase() !== adminEmail) {
      return jsonResponse(request, { message: "Цей акаунт не має прав адміністратора." }, 403);
    }
    return await handleAdmin(request, client, path);
  } catch (error) {
    const status = typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status) : 500;
    if (status >= 500) console.error("Admin API error:", errorMessage(error));
    return jsonResponse(request, {
      message: status >= 500 ? "Не вдалося виконати запит." : errorMessage(error)
    }, status || 500);
  }
});
