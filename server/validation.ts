import { HttpError } from "./store.js";

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
