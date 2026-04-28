import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { parse, serialize } from "cookie";
import { env } from "./env.js";

const SESSION_COOKIE = "admin_session";

function sign(payload: string) {
  return createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
}

export function issueAdminSession(response: Response) {
  const expiresAt = Date.now() + env.sessionDurationMs;
  const payload = `admin:${expiresAt}`;
  const signature = sign(payload);

  response.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE, `${payload}.${signature}`, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      maxAge: Math.floor(env.sessionDurationMs / 1000),
      secure: env.secureCookies
    })
  );
}

export function clearAdminSession(response: Response) {
  response.setHeader(
    "Set-Cookie",
    serialize(SESSION_COOKIE, "", {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: env.secureCookies,
      expires: new Date(0)
    })
  );
}

export function hasAdminSession(request: Request) {
  const cookies = parse(request.headers.cookie ?? "");
  const raw = cookies[SESSION_COOKIE];

  if (!raw) {
    return false;
  }

  const lastDot = raw.lastIndexOf(".");
  if (lastDot === -1) {
    return false;
  }

  const payload = raw.slice(0, lastDot);
  const signature = raw.slice(lastDot + 1);
  const expected = sign(payload);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return false;
  }

  const [, expiresAtRaw] = payload.split(":");
  const expiresAt = Number(expiresAtRaw);

  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}
