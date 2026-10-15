import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { listCategories, listFaqs, listNews, listProducts } from "../server/store.js";

const categories = listCategories(true);
const products = listProducts(true);
const faqs = listFaqs(true);
const news = listNews(true);
const priceOptionCount = products.reduce((count, product) => count + product.pricingOptions.length, 0);

if (products.length !== 35 || priceOptionCount !== 62) {
  throw new Error("Каталог не збігається з підтвердженим переліком 35 товарів / 62 тарифів.");
}

function sqlText(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function sqlJson(value: unknown): string {
  return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function sqlNullableText(value: unknown): string {
  return typeof value === "string" && value.length ? sqlText(value) : "null";
}

function sqlNullableInteger(value: unknown): string {
  return Number.isSafeInteger(value) ? String(value) : "null";
}

const updatedAt = new Date().toISOString();
const records = [
  ...categories.map((payload) => ({ kind: "category", payload })),
  ...products.map((payload) => ({ kind: "product", payload })),
  ...faqs.map((payload) => ({ kind: "faq", payload })),
  ...news.map((payload) => ({ kind: "news", payload }))
];

const rows = records.map(({ kind, payload }) => {
  const item = payload as Record<string, unknown>;
  const columns = [
    sqlText(kind), sqlText(String(item.id)), sqlJson(item),
    String(Number.isFinite(Number(item.sortOrder)) ? Math.trunc(Number(item.sortOrder)) : 0),
    item.isActive === false ? "false" : "true",
    kind !== "review" && item.isModerated !== false ? "true" : "false",
    sqlText(typeof item.updatedAt === "string" ? item.updatedAt : updatedAt),
    kind === "news" ? sqlNullableText(item.sourceType === "telegram" ? "telegram" : "manual") : "null",
    kind === "news" ? sqlNullableText(item.sourceUrl) : "null",
    kind === "news" && item.sourceChatId !== undefined ? sqlText(String(item.sourceChatId)) : "null",
    kind === "news" ? sqlNullableInteger(item.sourceMessageId) : "null",
    kind === "news" ? sqlNullableText(item.publishedAt) : "null"
  ];
  return `  (${columns.join(", ")})`;
});

const sql = [
  "begin;",
  "do $guard$ begin if exists (select 1 from public.site_content) then raise exception 'Refusing seed import: public.site_content is not empty'; end if; end $guard$;",
  "insert into public.site_content (kind, id, payload, sort_order, is_active, is_moderated, updated_at, source_type, source_url, source_chat_id, source_message_id, published_at)",
  "values",
  rows.join(",\n"),
  "on conflict (kind, id) do nothing;",
  "commit;",
  ""
].join("\n");

const outputPath = resolve(process.argv[2] ?? ".local/orenda-content-seed.sql");
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, sql, "utf8");
console.log(`Generated ${records.length} content rows (${products.length} products, ${priceOptionCount} prices) at ${outputPath}.`);
