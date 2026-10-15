import type { NewsItem } from "./types";

export interface ExcludedTelegramNewsSource {
  sourceUrl?: string | null;
  sourceMessageId?: number | null;
}

export function getTrustedTelegramSourceUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "t.me" || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function mergeTelegramNews(
  storedNews: NewsItem[],
  channelItems: NewsItem[],
  excludedSources: ExcludedTelegramNewsSource[] = []
): NewsItem[] {
  const merged = storedNews.filter((item) => item.isActive !== false);
  const excludedUrls = new Set(excludedSources.map((item) => item.sourceUrl).filter(Boolean));
  const excludedMessageIds = new Set(
    excludedSources
      .map((item) => item.sourceMessageId)
      .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id))
  );
  const knownUrls = new Set(merged.map((item) => item.sourceUrl).filter(Boolean));
  const knownMessageIds = new Set(
    merged
      .map((item) => item.sourceMessageId)
      .filter((id): id is number => typeof id === "number" && Number.isSafeInteger(id))
  );

  for (const item of channelItems) {
    if (item.isActive === false || item.sourceType !== "telegram") continue;
    if (
      (item.sourceUrl && (excludedUrls.has(item.sourceUrl) || knownUrls.has(item.sourceUrl))) ||
      (item.sourceMessageId !== undefined &&
        (excludedMessageIds.has(item.sourceMessageId) || knownMessageIds.has(item.sourceMessageId)))
    ) continue;
    merged.push(item);
    if (item.sourceUrl) knownUrls.add(item.sourceUrl);
    if (item.sourceMessageId !== undefined) knownMessageIds.add(item.sourceMessageId);
  }

  const manualNews = merged.filter((item) => item.sourceType !== "telegram");
  const telegramNews = merged
    .filter((item) => item.sourceType === "telegram")
    .sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt ?? "");
      const rightTime = Date.parse(right.publishedAt ?? "");
      return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0);
    });

  return [...manualNews, ...telegramNews];
}
