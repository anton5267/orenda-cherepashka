export interface PublicTelegramNewsItem {
  id: string;
  title: string;
  dateLabel: string;
  content: string;
  sortOrder: number;
  isActive: true;
  sourceType: "telegram";
  sourceUrl: string;
  sourceMessageId: number;
  publishedAt: string;
  updatedAt: string;
}

const DEFAULT_CHANNEL = "arenda_cherepashka";

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([\da-f]+);/gi, (_match, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
}

function htmlToText(value: string): string {
  return decodeEntities(
    value
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(?:p|li|blockquote|div)>/gi, "\n")
      .replace(/<[^>]*>/g, "")
  )
    .replace(/[\t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
}

export function parsePublicTelegramPosts(
  html: string,
  channel = DEFAULT_CHANNEL,
  now = new Date()
): PublicTelegramNewsItem[] {
  const safeChannel = channel.replace(/[^A-Za-z0-9_]/g, "");
  if (!safeChannel) return [];

  const starts = [...html.matchAll(/<div\b[^>]*class="[^"]*\btgme_widget_message_wrap\b[^"]*"[^>]*>/g)];
  const seen = new Set<number>();
  const items: PublicTelegramNewsItem[] = [];

  for (let index = 0; index < starts.length; index += 1) {
    const start = starts[index].index;
    if (start === undefined) continue;
    const end = starts[index + 1]?.index ?? html.length;
    const block = html.slice(start, end);
    const postMatch = block.match(new RegExp(`data-post="${safeChannel}/(\\d+)"`));
    const textStart = block.search(/<div\b[^>]*class="[^"]*\btgme_widget_message_text\b[^"]*"[^>]*>/i);
    if (!postMatch || textStart < 0) continue;

    const messageId = Number(postMatch[1]);
    if (!Number.isSafeInteger(messageId) || seen.has(messageId)) continue;
    seen.add(messageId);

    const messageMarkup = block.slice(textStart);
    const openEnd = messageMarkup.indexOf(">");
    const closeAt = messageMarkup.indexOf("</div>", openEnd + 1);
    if (openEnd < 0 || closeAt < 0) continue;
    const text = htmlToText(messageMarkup.slice(openEnd + 1, closeAt));
    if (!text) continue;

    const timeMatch = block.match(/<time\b[^>]*datetime="([^"]+)"/i);
    const parsedTime = timeMatch?.[1] ? Date.parse(timeMatch[1]) : Number.NaN;
    const publishedAt = Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : now.toISOString();
    const [firstLine, ...rest] = text.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!firstLine) continue;
    const title = firstLine.length > 110 ? `${firstLine.slice(0, 107).trimEnd()}…` : firstLine;
    const body = [firstLine.length > 110 ? firstLine : "", ...rest].filter(Boolean).join("\n").trim();
    const fullContent = body || text;
    const content = fullContent.length > 900 ? `${fullContent.slice(0, 897).trimEnd()}…` : fullContent;

    items.push({
      id: `telegram-${messageId}`,
      title,
      dateLabel: new Intl.DateTimeFormat("uk-UA", {
        day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Kyiv"
      }).format(new Date(publishedAt)),
      content,
      sortOrder: 0,
      isActive: true,
      sourceType: "telegram",
      sourceUrl: `https://t.me/${safeChannel}/${messageId}`,
      sourceMessageId: messageId,
      publishedAt,
      updatedAt: publishedAt
    });
  }

  return items
    .sort((first, second) => Date.parse(second.publishedAt) - Date.parse(first.publishedAt))
    .slice(0, 6)
    .map((item, sortOrder) => ({ ...item, sortOrder }));
}

export async function fetchPublicTelegramFeed(
  fetcher: typeof fetch = fetch,
  channel = DEFAULT_CHANNEL
): Promise<PublicTelegramNewsItem[]> {
  const safeChannel = channel.replace(/[^A-Za-z0-9_]/g, "");
  if (!safeChannel) throw new Error("Invalid Telegram channel name");
  const response = await fetcher(`https://t.me/s/${safeChannel}`, {
    headers: { "user-agent": "OrendaCherepashka-NewsFeed/1.0" },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Telegram channel returned HTTP ${response.status}`);
  const items = parsePublicTelegramPosts(await response.text(), safeChannel);
  if (!items.length) throw new Error("No public Telegram posts were found");
  return items;
}
