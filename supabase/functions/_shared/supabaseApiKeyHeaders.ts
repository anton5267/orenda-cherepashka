type HeaderInput = Headers | Record<string, string> | Array<[string, string]>;

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
