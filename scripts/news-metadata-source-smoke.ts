import assert from "node:assert/strict";
import { loadNewsForMetadata } from "./newsMetadataSource.js";
import { getTrustedTelegramSourceUrl } from "../src/newsFeed.js";

const channelItem = {
  id: "telegram-51",
  title: "Оновлення каналу",
  dateLabel: "15 жовтня 2026 р.",
  content: "Новий допис",
  sortOrder: 1,
  isActive: true,
  sourceType: "telegram" as const,
  sourceUrl: "https://t.me/arenda_cherepashka/51",
  sourceMessageId: 51,
  publishedAt: "2026-10-15T10:00:00.000Z"
};

assert.equal(getTrustedTelegramSourceUrl("https://t.me/arenda_cherepashka/51"), "https://t.me/arenda_cherepashka/51");
assert.equal(getTrustedTelegramSourceUrl("javascript:alert(1)"), null);
assert.equal(getTrustedTelegramSourceUrl("https://t.me.evil.example/fake"), null);

const seeded = await loadNewsForMetadata({ channelItems: [channelItem] });
assert(seeded.some((item) => item.id === channelItem.id), "Local metadata should include the bundled Telegram snapshot.");
assert(seeded.some((item) => item.id === "news-claude-pause"), "Local metadata should preserve manually managed seed news.");

const inactive = { ...channelItem, id: "inactive-news", isActive: false };
const storedItem = { ...channelItem, id: "manual-news", sourceType: "manual" as const, sourceUrl: undefined, sourceMessageId: undefined };
const requests: string[] = [];
let requestHeaders: Headers | undefined;
const live = await loadNewsForMetadata({
  supabaseUrl: "https://orenda-project.supabase.co",
  publishableKey: "sb_publishable_orenda_test",
  channelItems: [channelItem],
  fetcher: async (input, init) => {
    const url = new URL(String(input));
    requests.push(url.searchParams.get("path") ?? "");
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify(url.searchParams.get("path") === "/api/news" ? [storedItem, inactive] : []), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
});
assert.deepEqual(requests.sort(), ["/api/news", "/api/news/excluded"]);
assert.equal(requestHeaders?.get("apikey"), "sb_publishable_orenda_test");
assert.equal(requestHeaders?.get("Authorization"), null);
assert(live.some((item) => item.id === "manual-news"));
assert(live.some((item) => item.id === channelItem.id));
assert(!live.some((item) => item.id === "inactive-news"));

await assert.rejects(
  () => loadNewsForMetadata({ supabaseUrl: "https://orenda-project.supabase.co" }),
  /Both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/
);
await assert.rejects(
  () => loadNewsForMetadata({
    supabaseUrl: "https://orenda-project.supabase.co",
    publishableKey: "sb_secret_never-public"
  }),
  /server-only Supabase key/
);
await assert.rejects(
  () => loadNewsForMetadata({
    supabaseUrl: "https://orenda-project.supabase.co",
    publishableKey: "sb_publishable_orenda_test",
    fetcher: async () => new Response("offline", { status: 503 })
  }),
  /HTTP 503/
);

console.log("Static news SEO merges active database and Telegram updates, excludes archived news, and rejects unsafe builds.");
