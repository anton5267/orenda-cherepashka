import { HttpError } from "./store.js";
import type { PublicAnalyticsEventInput } from "../shared/models.js";

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Тіло запиту має бути JSON-об'єктом.");
  }
  return value as Record<string, unknown>;
}

function textField(body: Record<string, unknown>, field: string, min: number, max: number) {
  const value = body[field];
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
    throw new HttpError(400, `Поле "${field}" має містити від ${min} до ${max} символів.`);
  }
}

export function validateLeadPayload(value: unknown) {
  const body = record(value);
  textField(body, "name", 2, 80);
  textField(body, "contact", 3, 120);
  if (body.message !== undefined && (typeof body.message !== "string" || body.message.length > 1000)) {
    throw new HttpError(400, "Коментар має містити не більше 1000 символів.");
  }
  if (body.items !== undefined && (!Array.isArray(body.items) || body.items.length > 20)) {
    throw new HttpError(400, "У заявці може бути не більше 20 позицій.");
  }
  if (body.neededBy !== undefined && body.neededBy !== null && body.neededBy !== "") {
    if (
      typeof body.neededBy !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(body.neededBy) ||
      Number.isNaN(Date.parse(`${body.neededBy}T00:00:00.000Z`)) ||
      new Date(`${body.neededBy}T00:00:00.000Z`).toISOString().slice(0, 10) !== body.neededBy
    ) {
      throw new HttpError(400, "Вкажи коректну дату, коли потрібна підписка.");
    }
  }
  for (const field of ["utmSource", "utmMedium", "utmCampaign"]) {
    const item = body[field];
    if (item !== undefined && item !== null && item !== "") {
      if (typeof item !== "string" || item.trim().length > 100 || /[<>\u0000-\u001f]/.test(item)) {
        throw new HttpError(400, "UTM-мітки мають містити не більше 100 безпечних символів.");
      }
    }
  }
}

export function validatePublicAnalyticsEvent(value: unknown): PublicAnalyticsEventInput {
  const body = record(value);
  const eventName = body.eventName;
  if (!(["page_view", "product_view", "telegram_click"] as const).includes(eventName as PublicAnalyticsEventInput["eventName"])) {
    throw new HttpError(400, "Невідомий тип події аналітики.");
  }
  if (
    typeof body.path !== "string" ||
    body.path.length > 200 ||
    !/^\/(?:[A-Za-z0-9._~/-]*)$/.test(body.path)
  ) {
    throw new HttpError(400, "Некоректний шлях аналітичної події.");
  }
  if (body.productSlug !== undefined && body.productSlug !== null) {
    textField(body, "productSlug", 1, 120);
    if (!/^[\p{L}\p{N}._-]+$/u.test(String(body.productSlug))) {
      throw new HttpError(400, "Некоректний ідентифікатор товару.");
    }
  }

  const normalized: PublicAnalyticsEventInput = {
    eventName: eventName as PublicAnalyticsEventInput["eventName"],
    path: body.path
  };
  for (const field of ["utmSource", "utmMedium", "utmCampaign"] as const) {
    const item = body[field];
    if (item !== undefined && item !== null) {
      if (typeof item !== "string" || item.trim().length > 100 || /[<>\u0000-\u001f]/.test(item)) {
        throw new HttpError(400, "UTM-мітки мають містити не більше 100 безпечних символів.");
      }
      const value = item.trim();
      if (value) normalized[field] = value;
    }
  }

  if (typeof body.productSlug === "string") normalized.productSlug = body.productSlug.trim();
  return normalized;
}

export function validateSettingsPayload(value: unknown) {
  const body = record(value);
  for (const field of ["telegramContactUrl", "telegramNewsChannelUrl"]) {
    if (body[field] !== undefined) {
      textField(body, field, 8, 300);
      if (!/^https:\/\/(?:www\.)?t\.me\/[\w\d_]+$/i.test(String(body[field]).trim())) {
        throw new HttpError(400, `Поле "${field}" має бути коректним Telegram URL.`);
      }
    }
  }
}

export function validateNewsPayload(value: unknown) {
  const body = record(value);
  for (const field of ["title", "dateLabel", "content"]) {
    if (body[field] !== undefined) {
      textField(body, field, 1, field === "content" ? 5000 : 240);
    }
  }
}
