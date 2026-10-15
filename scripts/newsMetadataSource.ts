import { seedNews } from "../shared/seedData.js";
import type { NewsItem } from "../shared/models.js";
import { getTrustedTelegramSourceUrl, mergeTelegramNews } from "../src/newsFeed.js";
import { createSupabaseApiHeaders } from "../supabase/functions/_shared/supabaseApiKeyHeaders.js";
import { fetchWithNetworkRetries } from "./liveMetadataFetch.js";

export type NewsMetadataRecord = Pick<
  NewsItem,
  "id" | "title" | "dateLabel" | "content" | "isActive" | "sourceType" | "sourceUrl" | "sourceMessageId" | "publishedAt"
>;

type MetadataSourceMode = "auto" | "live" | "seed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMetadataNews(value: unknown): value is NewsMetadataRecord {
  if (!isRecord(value)) return false;
  const sourceType = value.sourceType;
  const sourceMessageId = value.sourceMessageId;
  const publishedAt = value.publishedAt;
  const sourceUrl = value.sourceUrl;

  return typeof value.id === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value.id) &&
    typeof value.title === "string" && value.title.trim().length > 0 && value.title.length <= 300 &&
    typeof value.dateLabel === "string" && value.dateLabel.length <= 120 &&
    typeof value.content === "string" && value.content.length <= 12000 &&
    typeof value.isActive === "boolean" &&
    (sourceType === undefined || sourceType === "manual" || sourceType === "telegram") &&
    (sourceMessageId === undefined || (typeof sourceMessageId === "number" && Number.isSafeInteger(sourceMessageId) && sourceMessageId > 0)) &&
    (publishedAt === undefined || (typeof publishedAt === "string" && Number.isFinite(Date.parse(publishedAt)))) &&
    (sourceUrl === undefined || sourceUrl === "" || getTrustedTelegramSourceUrl(sourceUrl) !== null);
}

function validateActiveNews(value: unknown, description: string): NewsMetadataRecord[] {
  if (!Array.isArray(value)) throw new Error(`${description} did not return a news list.`);
  const activeRows = value.filter((item) => isRecord(item) && item.isActive === true);
  if (!activeRows.every(isMetadataNews)) throw new Error(`${description} returned invalid active news; refusing to publish incomplete article pages.`);
  return activeRows as NewsMetadataRecord[];
}

function parseExcludedSources(value: unknown): Array<{ sourceUrl?: string; sourceMessageId?: number }> {
  if (!Array.isArray(value)) throw new Error("Supabase excluded-news endpoint did not return a list.");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("Supabase returned an invalid excluded-news record.");
    const sourceUrl = typeof item.sourceUrl === "string" ? item.sourceUrl : undefined;
    const sourceMessageId = typeof item.sourceMessageId === "number" && Number.isSafeInteger(item.sourceMessageId)
      ? item.sourceMessageId
      : undefined;
    if (sourceUrl && !getTrustedTelegramSourceUrl(sourceUrl)) throw new Error("Supabase returned an unsafe excluded-news URL.");
    return { sourceUrl, sourceMessageId };
  });
}

export async function loadNewsForMetadata(options: {
  supabaseUrl?: string;
  publishableKey?: string;
  mode?: MetadataSourceMode;
  channelItems?: unknown;
  fetcher?: typeof fetch;
}): Promise<NewsMetadataRecord[]> {
  const mode = options.mode ?? "auto";
  const channelItems = validateActiveNews(options.channelItems ?? [], "Telegram snapshot")
    .filter((item) => item.sourceType === "telegram");

  if (mode === "seed") return mergeTelegramNews(seedNews, channelItems) as NewsMetadataRecord[];

  const configuredUrl = options.supabaseUrl?.trim() ?? "";
  const publishableKey = options.publishableKey?.trim() ?? "";
  if (!configuredUrl && !publishableKey && mode === "auto") {
    return mergeTelegramNews(seedNews, channelItems) as NewsMetadataRecord[];
  }
  if (!configuredUrl || !publishableKey) {
    throw new Error("Both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required for live news metadata.");
  }
  if (publishableKey.startsWith("sb_secret_") || publishableKey.startsWith("service_role")) {
    throw new Error("A server-only Supabase key cannot be used to build public news metadata.");
  }

  let projectOrigin: string;
  try {
    const parsedUrl = new URL(configuredUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash ||
        !parsedUrl.hostname.endsWith(".supabase.co")) throw new Error();
    projectOrigin = parsedUrl.origin;
  } catch {
    throw new Error("VITE_SUPABASE_URL must be the HTTPS origin of the Orenda Supabase project.");
  }

  const requestJson = async (path: string): Promise<unknown> => {
    const endpoint = new URL("/functions/v1/orenda-public", projectOrigin);
    endpoint.searchParams.set("path", path);
    const headers = createSupabaseApiHeaders(publishableKey, null, { Accept: "application/json" });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetchWithNetworkRetries(options.fetcher ?? fetch, endpoint, {
        method: "GET",
        headers,
        signal: controller.signal,
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`Supabase news metadata returned HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Supabase news metadata returned HTTP")) throw error;
      throw new Error("Could not fetch live Supabase news metadata; refusing to publish a stale sitemap.");
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const storedBody = await requestJson("/api/news");
  const excludedBody = await requestJson("/api/news/excluded");
  const storedNews = validateActiveNews(storedBody, "Supabase news endpoint");
  const excludedSources = parseExcludedSources(excludedBody);
  const merged = mergeTelegramNews(storedNews, channelItems, excludedSources) as NewsMetadataRecord[];
  const ids = merged.map((item) => item.id);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate news IDs would overwrite generated article pages.");
  return merged;
}
