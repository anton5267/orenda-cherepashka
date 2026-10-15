type HeaderInput = Headers | Record<string, string> | Array<[string, string]>;

export function readSupabaseSecretKey(
  getEnv: (name: string) => string | undefined
): string | undefined {
  const keyMap = getEnv("SUPABASE_SECRET_KEYS");
  if (keyMap) {
    try {
      const keys = JSON.parse(keyMap) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default.trim()) return keys.default.trim();
    } catch {
      // Fall back to the legacy variables if the new-key map is unavailable or malformed.
    }
  }
  return getEnv("SUPABASE_SECRET_KEY")?.trim() || getEnv("SUPABASE_SERVICE_ROLE_KEY")?.trim() || undefined;
}

export function readSupabasePublishableKey(
  getEnv: (name: string) => string | undefined
): string | undefined {
  const keyMap = getEnv("SUPABASE_PUBLISHABLE_KEYS");
  if (keyMap) {
    try {
      const keys = JSON.parse(keyMap) as Record<string, unknown>;
      if (typeof keys.default === "string" && keys.default.trim()) return keys.default.trim();
    } catch {
      // Fall back to legacy-compatible variables if the new-key map is unavailable.
    }
  }
  return getEnv("SUPABASE_PUBLISHABLE_KEY")?.trim() || getEnv("SUPABASE_ANON_KEY")?.trim() || undefined;
}

export function createSupabaseApiHeaders(
  apiKey: string,
  accessToken: string | null | undefined,
  initialHeaders?: HeaderInput
): Headers {
  const headers = new Headers(initialHeaders);
  headers.set("apikey", apiKey);

  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  else headers.delete("Authorization");

  return headers;
}

export function createSupabaseApiKeyFetch(
  apiKey: string,
  baseFetch: typeof fetch = fetch
): typeof fetch {
  if (!apiKey.startsWith("sb_secret_")) return baseFetch;

  return (input, init) => {
    const headers = new Headers(init?.headers);
    if (headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    return baseFetch(input, { ...init, headers });
  };
}
