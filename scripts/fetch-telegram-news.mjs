import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const channel = "arenda_cherepashka";
const feedUrl = `https://t.me/s/${channel}`;
const outputPath = resolve(rootDir, "public/telegram-news.json");

function decodeEntities(value) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function htmlToText(value) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|li|blockquote|div)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parsePosts(html) {
  const starts = [...html.matchAll(/<div\b[^>]*class="[^"]*\btgme_widget_message_wrap\b[^"]*"[^>]*>/g)];
  const seen = new Set();
  const items = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    const end = starts[index + 1]?.index ?? html.length;
    const block = html.slice(start, end);
    const postMatch = block.match(new RegExp(`data-post="${channel}/(\\d+)"`));
    const textStart = block.search(/<div\b[^>]*class="[^"]*\btgme_widget_message_text\b[^\"]*"[^>]*>/i);

    if (!postMatch || textStart < 0) continue;

    const id = Number(postMatch[1]);
    if (seen.has(id)) continue;
    seen.add(id);

    const messageMarkup = block.slice(textStart);
    const openEnd = messageMarkup.indexOf(">");
    const closeAt = messageMarkup.indexOf("</div>", openEnd + 1);
    if (openEnd < 0 || closeAt < 0) continue;

    const content = htmlToText(messageMarkup.slice(openEnd + 1, closeAt));
    if (!content) continue;

    const timeMatch = block.match(/<time\b[^>]*datetime="([^"]+)"/i);
    const publishedAt = timeMatch?.[1] ?? new Date().toISOString();
    const dateLabel = new Intl.DateTimeFormat("uk-UA", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Kyiv"
    }).format(new Date(publishedAt));
    const [firstLine, ...rest] = content.split("\n").map((line) => line.trim()).filter(Boolean);
    const title = firstLine.length > 110 ? `${firstLine.slice(0, 107).trimEnd()}…` : firstLine;
    const body = [firstLine.length > 110 ? firstLine : "", ...rest]
      .filter(Boolean)
      .join("\n")
      .trim();
    const fullContent = body || content;

    items.push({
      id: `telegram-${id}`,
      title,
      dateLabel,
      content: fullContent.length > 900 ? `${fullContent.slice(0, 897).trimEnd()}…` : fullContent,
      sortOrder: items.length,
      isActive: true,
      sourceType: "telegram",
      sourceUrl: `https://t.me/${channel}/${id}`,
      sourceMessageId: id,
      publishedAt,
      updatedAt: publishedAt
    });
  }

  return items
    .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))
    .slice(0, 6)
    .map((item, index) => ({ ...item, sortOrder: index }));
}

const response = await fetch(feedUrl, {
  headers: { "user-agent": "OrendaCherepashka-NewsFeed/1.0 (+https://anton5267.github.io/orenda-cherepashka/)" },
  signal: AbortSignal.timeout(15000)
});

if (!response.ok) {
  throw new Error(`Telegram channel returned HTTP ${response.status}`);
}

const items = parsePosts(await response.text());
if (items.length === 0) {
  throw new Error("No public Telegram posts were found; refusing to publish an empty news feed.");
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  `${JSON.stringify({ channelUrl: `https://t.me/${channel}`, fetchedAt: new Date().toISOString(), items }, null, 2)}\n`,
  "utf8"
);
console.log(`Fetched ${items.length} Telegram posts for @${channel}.`);
