import assert from "node:assert/strict";
import { fetchPublicTelegramFeed, parsePublicTelegramPosts } from "../shared/telegramPublicFeed";

const makePost = (id: number, time: string, title: string) =>
  `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="arenda_cherepashka/${id}"><div class="tgme_widget_message_text">${title}<br/>Деталі &amp; умови <a href="https://example.com">посилання</a></div><time datetime="${time}"></time></div></div>`;

const fixedNow = new Date("2026-10-15T00:00:00.000Z");
const html = [
  makePost(17, "2026-10-10T12:00:00+00:00", "Старіша новина"),
  makePost(18, "2026-10-12T12:00:00+00:00", "Найновіша новина"),
  makePost(18, "2026-10-12T12:00:00+00:00", "Дублікат"),
  `<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="other_channel/19"><div class="tgme_widget_message_text">Сторонній канал</div><time datetime="2026-10-13T12:00:00Z"></time></div></div>`
].join("");

const parsed = parsePublicTelegramPosts(html, "arenda_cherepashka", fixedNow);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].title, "Найновіша новина");
assert.equal(parsed[0].sourceUrl, "https://t.me/arenda_cherepashka/18");
assert.equal(parsed[0].sourceType, "telegram");
assert.equal(parsed[0].content, "Деталі & умови посилання");
assert.deepEqual(parsed.map((item) => item.sortOrder), [0, 1]);

const hostileMarkup = makePost(19, "2026-10-14T12:00:00Z", "Тест <scr<script>ipt> &amp;lt;script&amp;gt;");
const hostileParsed = parsePublicTelegramPosts(hostileMarkup, "arenda_cherepashka", fixedNow);
assert.equal(hostileParsed.length, 1);
assert.equal(hostileParsed[0].title.includes("<script>"), false);
assert.equal(hostileParsed[0].title.includes("&lt;script&gt;"), true);

const oversized = Array.from({ length: 8 }, (_, index) =>
  makePost(index + 100, new Date(Date.UTC(2026, 9, index + 1)).toISOString(), `Новина ${index + 1}`)
).join("");
assert.equal(parsePublicTelegramPosts(oversized, "arenda_cherepashka", fixedNow).length, 6);

let requestedUrl = "";
const fetched = await fetchPublicTelegramFeed(async (input) => {
  requestedUrl = String(input);
  return new Response(html, { status: 200 });
});
assert.equal(requestedUrl, "https://t.me/s/arenda_cherepashka");
assert.equal(fetched.length, 2);

console.log("Telegram public-feed parsing, sanitization, deduplication, ordering, and fetch checks passed.");
