import assert from "node:assert/strict";
import { mergeTelegramNews } from "../src/newsFeed";
import type { NewsItem } from "../shared/models";

function news(overrides: Partial<NewsItem> & Pick<NewsItem, "id" | "title">): NewsItem {
  return {
    dateLabel: "15 жовтня 2026 р.",
    content: overrides.title,
    sortOrder: 0,
    isActive: true,
    ...overrides
  };
}

const merged = mergeTelegramNews(
  [
    news({ id: "manual-1", title: "Ручна новина", sourceType: "manual" }),
    news({
      id: "telegram-chat-3",
      title: "Відредагована версія з бази",
      sourceType: "telegram",
      sourceUrl: "https://t.me/arenda_cherepashka/3",
      sourceMessageId: 3,
      publishedAt: "2026-10-15T10:00:00Z"
    })
  ],
  [
    news({
      id: "telegram-3",
      title: "Стара копія з каналу",
      sourceType: "telegram",
      sourceUrl: "https://t.me/arenda_cherepashka/3",
      sourceMessageId: 3,
      publishedAt: "2026-10-15T10:00:00Z"
    }),
    news({
      id: "telegram-4",
      title: "Свіжий допис зі стрічки",
      sourceType: "telegram",
      sourceUrl: "https://t.me/arenda_cherepashka/4",
      sourceMessageId: 4,
      publishedAt: "2026-10-15T12:00:00Z"
    }),
    news({
      id: "telegram-2",
      title: "Прихований допис",
      sourceType: "telegram",
      sourceUrl: "https://t.me/arenda_cherepashka/2",
      sourceMessageId: 2,
      publishedAt: "2026-10-15T09:00:00Z"
    })
  ],
  [{ sourceUrl: "https://t.me/arenda_cherepashka/2", sourceMessageId: 2 }]
);

assert.deepEqual(merged.map((item) => item.title), [
  "Ручна новина",
  "Свіжий допис зі стрічки",
  "Відредагована версія з бази"
]);
assert.equal(merged.filter((item) => item.sourceMessageId === 3).length, 1, "A persisted Telegram edit should replace the feed duplicate.");
assert.equal(merged.some((item) => item.sourceMessageId === 2), false, "An archived Telegram item must stay hidden from the fallback feed.");

console.log("Telegram news merge, deduplication, ordering, and archive exclusion passed.");
