const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

function allowedOrigins(): Set<string> {
  const configured = Deno.env.get("APP_ORIGIN") ?? "";
  return new Set([
    ...configured.split(",").map((origin) => origin.trim()).filter(Boolean),
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:5173",
    "http://127.0.0.1:5173"
  ]);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
  if (allowedOrigins().has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      ...JSON_HEADERS,
      "Cache-Control": "no-store, max-age=0",
      ...extraHeaders
    }
  });
}

export function getApiPath(request: Request): string {
  const path = new URL(request.url).searchParams.get("path") ?? "";
  return path.startsWith("/api/") ? path : "";
}

export function getRouteId(path: string): string {
  try {
    return decodeURIComponent(path.split("/").filter(Boolean).at(-1) ?? "");
  } catch {
    return "";
  }
}

export function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing required function secret: ${name}`);
  return value;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error";
}

export function httpError(status: number, message: string): Error & { status: number } {
  return Object.assign(new Error(message), { status });
}
