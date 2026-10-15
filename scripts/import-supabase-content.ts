import { createClient } from "@supabase/supabase-js";
import { seedSiteSettings } from "../shared/seedData.js";
import { listCategories, listFaqs, listNews, listProducts } from "../server/store.js";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const replace = args.has("--replace");
const projectRefArg = process.argv.find((arg) => arg.startsWith("--project-ref="));
const expectedProjectRef = projectRefArg?.slice("--project-ref=".length).trim() ?? "";

if (replace && !apply) throw new Error("--replace має використовуватися разом із --apply.");

const categories = listCategories(true);
const products = listProducts(true);
const faqs = listFaqs(true);
const news = listNews(true);
const priceOptionCount = products.reduce((count, product) => count + product.pricingOptions.length, 0);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value) ?? "null";
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(",")}}`;
}

console.log(JSON.stringify({
  mode: apply ? (replace ? "apply-and-replace-matching-content" : "apply-to-empty-project") : "dry-run",
  products: products.length,
  priceOptions: priceOptionCount,
  categories: categories.length,
  faqs: faqs.length,
  news: news.length,
  reviewsImported: 0,
  customerLeadsImported: 0
}, null, 2));

if (products.length !== 35 || priceOptionCount !== 62) {
  throw new Error("Каталог не збігається з підтвердженим переліком 35 товарів / 62 тарифів; імпорт зупинено.");
}
if (!apply) {
  console.log("Dry run only. To write, specify --apply and the authorized project ref.");
  process.exit(0);
}

const projectUrl = process.env.SUPABASE_URL?.trim() ?? "";
const secretKey = process.env.SUPABASE_SECRET_KEY?.trim() ?? process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";
if (!projectUrl || !secretKey || !expectedProjectRef) {
  throw new Error("Для --apply потрібні SUPABASE_URL, SUPABASE_SECRET_KEY і --project-ref.");
}
const parsedUrl = new URL(projectUrl);
if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== `${expectedProjectRef}.supabase.co`) {
  throw new Error("Project ref не збігається з HTTPS URL. Перевір, що це саме окремий Orenda-проєкт.");
}

const supabase = createClient(parsedUrl.origin, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const { data: existingRows, error: rowsError } = await supabase.from("site_content").select("kind,id").limit(1);
if (rowsError) throw new Error(`Не вдалося перевірити таблицю site_content: ${rowsError.message}`);
if (existingRows?.length && !replace) {
  throw new Error("У проєкті вже є контент. Імпорт зупинено; --replace перезаписує записи каталогу з однаковими ID.");
}

const { data: currentSettings, error: settingsError } = await supabase.from("site_settings")
  .select("data").eq("singleton", true).single();
if (settingsError) throw new Error(`Не вдалося перевірити site_settings: ${settingsError.message}`);
if (stableJson(currentSettings.data) !== stableJson(seedSiteSettings) && !replace) {
  throw new Error("Налаштування сайту вже відрізняються від початкових. Перевір їх перед імпортом або явно додай --replace.");
}

async function importKind(kind: string, records: Array<Record<string, unknown>>) {
  if (!records.length) return;
  const rows = records.map((payload) => ({
    kind,
    id: String(payload.id),
    payload,
    sort_order: Number(payload.sortOrder ?? 0),
    is_active: Boolean(payload.isActive),
    is_moderated: kind !== "review" || Boolean(payload.isModerated),
    updated_at: typeof payload.updatedAt === "string" ? payload.updatedAt : new Date().toISOString(),
    source_type: kind === "news" ? payload.sourceType ?? "manual" : null,
    source_url: kind === "news" ? payload.sourceUrl ?? null : null,
    source_chat_id: kind === "news" && payload.sourceChatId != null ? String(payload.sourceChatId) : null,
    source_message_id: kind === "news" ? payload.sourceMessageId ?? null : null,
    published_at: kind === "news" ? payload.publishedAt ?? null : null
  }));
  const { error } = await supabase.from("site_content").upsert(rows, { onConflict: "kind,id" });
  if (error) throw new Error(`Імпорт ${kind} завершився помилкою: ${error.message}`);
}

await importKind("category", categories as unknown as Array<Record<string, unknown>>);
await importKind("product", products as unknown as Array<Record<string, unknown>>);
await importKind("faq", faqs as unknown as Array<Record<string, unknown>>);
await importKind("news", news as unknown as Array<Record<string, unknown>>);
const { error: updateSettingsError } = await supabase.from("site_settings")
  .upsert({ singleton: true, data: seedSiteSettings, updated_at: new Date().toISOString() }, { onConflict: "singleton" });
if (updateSettingsError) throw new Error(`Налаштування не імпортовано: ${updateSettingsError.message}`);

console.log("Контент каталогу імпортовано. Відгуки та заявки клієнтів навмисно не переносилися.");
