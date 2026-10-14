import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import Database from "better-sqlite3";
import type {
  BulkMutationResult,
  Category,
  CreateLeadInput,
  FaqItem,
  Lead,
  LeadItem,
  LeadStatus,
  NewsItem,
  PricingOption,
  Product,
  Review,
  SiteSettings
} from "../shared/models.js";
import {
  seedCategories,
  seedFaqs,
  seedNews,
  seedProducts,
  seedReviews,
  seedSiteSettings
} from "../shared/seedData.js";

type DbBool = 0 | 1;

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  icon: string;
  sort_order: number;
  is_active: DbBool;
  updated_at: string | null;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
  category_id: string;
  summary: string;
  details_json: string;
  logo: string;
  is_hot: DbBool;
  is_active: DbBool;
  sort_order: number;
  updated_at: string | null;
};

type PricingRow = {
  id: string;
  product_id: string;
  label: string;
  price: number;
  compare_at: number | null;
  sort_order: number;
  is_active: DbBool;
};

type FaqRow = {
  id: string;
  question: string;
  answer: string;
  sort_order: number;
  is_active: DbBool;
  updated_at: string | null;
};

type NewsRow = {
  id: string;
  title: string;
  date_label: string;
  content: string;
  sort_order: number;
  is_active: DbBool;
  source_type: "manual" | "telegram" | null;
  source_url: string | null;
  source_chat_id: number | null;
  source_message_id: number | null;
  published_at: string | null;
  updated_at: string | null;
};

type ReviewRow = {
  id: string;
  name: string;
  rating: number;
  content: string;
  sort_order: number;
  is_active: DbBool;
  is_moderated: DbBool;
  created_at: string;
  updated_at: string | null;
};

type LeadRow = {
  id: string;
  name: string;
  contact: string;
  product_id: string | null;
  message: string;
  status: LeadStatus;
  created_at: string;
};

type LeadItemRow = {
  id: string;
  lead_id: string;
  product_id: string;
  pricing_option_id: string | null;
  label_snapshot: string;
  unit_price_snapshot: number;
  compare_at_snapshot: number | null;
  quantity: number;
};

type BulkPayload = {
  ids?: unknown;
  action?: unknown;
};

type LeadPayload = Partial<Lead> &
  Partial<CreateLeadInput> & {
    productId?: unknown;
    items?: unknown;
  };

type NormalizedLeadItem = LeadItem;

export class HttpError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

const databasePath =
  process.env.DATABASE_PATH?.trim() ||
  resolve(process.cwd(), "data", "site.db");
mkdirSync(dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

export const databaseFilePath = databasePath;

export function createDatabaseBackup(destinationPath: string) {
  return db.backup(destinationPath);
}

export function closeDatabaseConnection() {
  if (db.open) {
    db.close();
  }
}

function nowIso() {
  return new Date().toISOString();
}

function boolToInt(value: boolean | number | undefined, fallback = true): DbBool {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (typeof value === "number") {
    return value ? 1 : 0;
  }

  return fallback ? 1 : 0;
}

function intToBool(value: number) {
  return value === 1;
}

function normalizeText(value: unknown, fieldName: string) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    throw new HttpError(400, `Поле "${fieldName}" є обов'язковим.`);
  }

  return text;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNumber(value: unknown, fallback = 0) {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value)
        : fallback;

  if (!Number.isFinite(numeric)) {
    throw new HttpError(400, "Некоректне числове значення.");
  }

  return numeric;
}

function normalizePositiveInt(value: unknown, fieldName: string, fallback = 1) {
  const numeric = Math.round(normalizeNumber(value, fallback));
  if (numeric < 1) {
    throw new HttpError(400, `Поле "${fieldName}" повинно бути більше нуля.`);
  }

  return numeric;
}

function normalizeIdList(value: unknown) {
  if (!Array.isArray(value)) {
    throw new HttpError(400, "Передай масив ids для bulk-операції.");
  }

  const ids = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!ids.length) {
    throw new HttpError(400, "Масив ids не може бути порожнім.");
  }

  return Array.from(new Set(ids));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яіїєґ]+/giu, "-")
    .replace(/^-+|-+$/g, "");
}

function parseDetails(detailsJson: string) {
  try {
    const parsed = JSON.parse(detailsJson) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is string =>
            typeof item === "string" && item.trim().length > 0
        )
      : [];
  } catch {
    return [];
  }
}

function hasColumn(tableName: string, columnName: string) {
  const columns = db
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

function ensureColumn(tableName: string, columnName: string, definition: string) {
  if (hasColumn(tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function mapSettings(row: Record<string, unknown>): SiteSettings {
  return {
    siteName: String(row.site_name),
    telegramContactUrl: String(row.telegram_contact_url ?? "https://t.me/yts_nnn"),
    telegramNewsChannelUrl: String(
      row.telegram_news_channel_url ?? "https://t.me/arenda_cherepashka"
    ),
    heroTitle: String(row.hero_title),
    heroSubtitle: String(row.hero_subtitle),
    footerDescription: String(row.footer_description),
    leadTitle: String(row.lead_title),
    leadSubtitle: String(row.lead_subtitle)
  };
}

function mapCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    icon: row.icon,
    sortOrder: row.sort_order,
    isActive: intToBool(row.is_active),
    updatedAt: row.updated_at ?? undefined
  };
}

function mapPricingOption(row: PricingRow): PricingOption {
  return {
    id: row.id,
    label: row.label,
    price: row.price,
    compareAt: row.compare_at,
    sortOrder: row.sort_order,
    isActive: intToBool(row.is_active)
  };
}

function mapProduct(row: ProductRow, pricingRows: PricingRow[]): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    categoryId: row.category_id,
    summary: row.summary,
    details: parseDetails(row.details_json),
    logo: row.logo,
    isHot: intToBool(row.is_hot),
    isActive: intToBool(row.is_active),
    sortOrder: row.sort_order,
    pricingOptions: pricingRows
      .filter((pricing) => pricing.product_id === row.id)
      .sort((left, right) => left.sort_order - right.sort_order)
      .map(mapPricingOption),
    updatedAt: row.updated_at ?? undefined
  };
}

function mapFaq(row: FaqRow): FaqItem {
  return {
    id: row.id,
    question: row.question,
    answer: row.answer,
    sortOrder: row.sort_order,
    isActive: intToBool(row.is_active),
    updatedAt: row.updated_at ?? undefined
  };
}

function mapNews(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    dateLabel: row.date_label,
    content: row.content,
    sortOrder: row.sort_order,
    isActive: intToBool(row.is_active),
    sourceType: row.source_type ?? "manual",
    sourceUrl: row.source_url ?? undefined,
    sourceChatId: row.source_chat_id ?? undefined,
    sourceMessageId: row.source_message_id ?? undefined,
    publishedAt: row.published_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    name: row.name,
    rating: row.rating,
    content: row.content,
    sortOrder: row.sort_order,
    isActive: intToBool(row.is_active),
    isModerated: intToBool(row.is_moderated),
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined
  };
}

function mapLeadItem(row: LeadItemRow): LeadItem {
  return {
    id: row.id,
    productId: row.product_id,
    pricingOptionId: row.pricing_option_id,
    labelSnapshot: row.label_snapshot,
    unitPriceSnapshot: row.unit_price_snapshot,
    compareAtSnapshot: row.compare_at_snapshot,
    quantity: row.quantity
  };
}

function mapLead(row: LeadRow, itemRows: LeadItemRow[]): Lead {
  const items = itemRows
    .filter((item) => item.lead_id === row.id)
    .map(mapLeadItem);

  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    items: items.length ? items : buildLegacyLeadItemsFallback(row.product_id),
    message: row.message ?? "",
    status: row.status,
    createdAt: row.created_at
  };
}

function ensureSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      singleton_key INTEGER PRIMARY KEY CHECK (singleton_key = 1),
      site_name TEXT NOT NULL,
      telegram_channel TEXT NOT NULL,
      telegram_contact_url TEXT,
      telegram_news_channel_url TEXT,
      hero_title TEXT NOT NULL,
      hero_subtitle TEXT NOT NULL,
      footer_description TEXT NOT NULL,
      lead_title TEXT NOT NULL,
      lead_subtitle TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
      summary TEXT NOT NULL,
      details_json TEXT NOT NULL,
      logo TEXT NOT NULL,
      is_hot INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pricing_options (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      label TEXT NOT NULL,
      price INTEGER NOT NULL,
      compare_at INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS faqs (
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date_label TEXT NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_url TEXT,
      source_chat_id INTEGER,
      source_message_id INTEGER,
      published_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      content TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_moderated INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contact TEXT NOT NULL,
      product_id TEXT,
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('new', 'contacted', 'closed')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lead_items (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL,
      pricing_option_id TEXT,
      label_snapshot TEXT NOT NULL,
      unit_price_snapshot INTEGER NOT NULL,
      compare_at_snapshot INTEGER,
      quantity INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS telegram_webhook_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      update_id INTEGER,
      event_type TEXT NOT NULL,
      chat_id INTEGER,
      message_id INTEGER,
      status TEXT NOT NULL CHECK (status IN ('processed', 'ignored', 'failed')),
      error_message TEXT,
      created_at TEXT NOT NULL
    );
  `);
}

function ensureCompatibilityMigrations() {
  ensureColumn("categories", "updated_at", "TEXT");
  ensureColumn("products", "updated_at", "TEXT");
  ensureColumn("faqs", "updated_at", "TEXT");
  ensureColumn("news", "updated_at", "TEXT");
  ensureColumn("settings", "telegram_contact_url", "TEXT");
  ensureColumn("settings", "telegram_news_channel_url", "TEXT");
  ensureColumn("news", "source_type", "TEXT");
  ensureColumn("news", "source_url", "TEXT");
  ensureColumn("news", "source_chat_id", "INTEGER");
  ensureColumn("news", "source_message_id", "INTEGER");
  ensureColumn("news", "published_at", "TEXT");
  ensureColumn("reviews", "updated_at", "TEXT");

  const timestamp = nowIso();
  db.prepare("UPDATE categories SET updated_at = COALESCE(updated_at, ?)").run(timestamp);
  db.prepare("UPDATE products SET updated_at = COALESCE(updated_at, ?)").run(timestamp);
  db.prepare("UPDATE faqs SET updated_at = COALESCE(updated_at, ?)").run(timestamp);
  db.prepare("UPDATE news SET updated_at = COALESCE(updated_at, ?)").run(timestamp);
  db.prepare(
    "UPDATE settings SET telegram_contact_url = COALESCE(NULLIF(telegram_contact_url, ''), ?), telegram_news_channel_url = COALESCE(NULLIF(telegram_news_channel_url, ''), ?) WHERE singleton_key = 1"
  ).run("https://t.me/yts_nnn", "https://t.me/arenda_cherepashka");
  db.prepare("UPDATE news SET source_type = COALESCE(NULLIF(source_type, ''), 'manual')").run();
  db.exec(
    "CREATE UNIQUE INDEX IF NOT EXISTS news_telegram_source_idx ON news(source_chat_id, source_message_id) WHERE source_type = 'telegram' AND source_chat_id IS NOT NULL AND source_message_id IS NOT NULL"
  );
  db.prepare("UPDATE reviews SET updated_at = COALESCE(updated_at, created_at, ?)").run(timestamp);
}

function ensureSeed() {
  const settingsExists = db
    .prepare("SELECT singleton_key FROM settings WHERE singleton_key = 1")
    .get();

  if (settingsExists) {
    return;
  }

  const seedTimestamp = nowIso();

  const seedTransaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO settings (
          singleton_key,
          site_name,
          telegram_channel,
          telegram_contact_url,
          telegram_news_channel_url,
          hero_title,
          hero_subtitle,
          footer_description,
          lead_title,
          lead_subtitle
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      seedSiteSettings.siteName,
      seedSiteSettings.telegramContactUrl,
      seedSiteSettings.telegramContactUrl,
      seedSiteSettings.telegramNewsChannelUrl,
      seedSiteSettings.heroTitle,
      seedSiteSettings.heroSubtitle,
      seedSiteSettings.footerDescription,
      seedSiteSettings.leadTitle,
      seedSiteSettings.leadSubtitle
    );

    const insertCategory = db.prepare(
      `
        INSERT INTO categories (id, name, slug, icon, sort_order, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    );

    seedCategories.forEach((category) => {
      insertCategory.run(
        category.id,
        category.name,
        category.slug,
        category.icon,
        category.sortOrder,
        boolToInt(category.isActive),
        seedTimestamp
      );
    });

    const insertProduct = db.prepare(
      `
        INSERT INTO products (
          id,
          name,
          slug,
          category_id,
          summary,
          details_json,
          logo,
          is_hot,
          is_active,
          sort_order,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    const insertPricing = db.prepare(
      `
        INSERT INTO pricing_options (
          id,
          product_id,
          label,
          price,
          compare_at,
          sort_order,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    );

    seedProducts.forEach((product) => {
      insertProduct.run(
        product.id,
        product.name,
        product.slug,
        product.categoryId,
        product.summary,
        JSON.stringify(product.details),
        product.logo,
        boolToInt(product.isHot, false),
        boolToInt(product.isActive),
        product.sortOrder,
        seedTimestamp
      );

      product.pricingOptions.forEach((pricingOption, index) => {
        insertPricing.run(
          `${product.id}-plan-${index + 1}`,
          product.id,
          pricingOption.label,
          pricingOption.price,
          pricingOption.compareAt,
          pricingOption.sortOrder,
          boolToInt(pricingOption.isActive)
        );
      });
    });

    const insertFaq = db.prepare(
      `
        INSERT INTO faqs (id, question, answer, sort_order, is_active, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    );

    seedFaqs.forEach((faq) => {
      insertFaq.run(
        faq.id,
        faq.question,
        faq.answer,
        faq.sortOrder,
        boolToInt(faq.isActive),
        seedTimestamp
      );
    });

    const insertNews = db.prepare(
      `
        INSERT INTO news (id, title, date_label, content, sort_order, is_active, source_type, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    seedNews.forEach((item) => {
      insertNews.run(
        item.id,
        item.title,
        item.dateLabel,
        item.content,
        item.sortOrder,
        boolToInt(item.isActive),
        item.sourceType ?? "manual",
        seedTimestamp
      );
    });

    const insertReview = db.prepare(
      `
        INSERT INTO reviews (
          id,
          name,
          rating,
          content,
          sort_order,
          is_active,
          is_moderated,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    seedReviews.forEach((review) => {
      insertReview.run(
        review.id,
        review.name,
        review.rating,
        review.content,
        review.sortOrder,
        boolToInt(review.isActive),
        boolToInt(review.isModerated),
        review.createdAt,
        review.createdAt
      );
    });
  });

  seedTransaction();
}

function readProductRows(includeInactive = false) {
  const sql = includeInactive
    ? "SELECT * FROM products ORDER BY sort_order ASC, name ASC"
    : "SELECT * FROM products WHERE is_active = 1 ORDER BY sort_order ASC, name ASC";

  return db.prepare(sql).all() as ProductRow[];
}

function readPricingRows(includeInactive = false) {
  const sql = includeInactive
    ? "SELECT * FROM pricing_options ORDER BY sort_order ASC, label ASC"
    : "SELECT * FROM pricing_options WHERE is_active = 1 ORDER BY sort_order ASC, label ASC";

  return db.prepare(sql).all() as PricingRow[];
}

function readLeadItemRowsForLeadIds(ids: string[]) {
  if (!ids.length) {
    return [] as LeadItemRow[];
  }

  const placeholders = ids.map(() => "?").join(", ");
  return db
    .prepare(
      `SELECT * FROM lead_items WHERE lead_id IN (${placeholders}) ORDER BY rowid ASC`
    )
    .all(...ids) as LeadItemRow[];
}

function getCategoryById(id: string) {
  const row = db
    .prepare("SELECT * FROM categories WHERE id = ?")
    .get(id) as CategoryRow | undefined;

  if (!row) {
    throw new HttpError(404, "Категорію не знайдено.");
  }

  return mapCategory(row);
}

function getProductById(id: string) {
  const row = db
    .prepare("SELECT * FROM products WHERE id = ?")
    .get(id) as ProductRow | undefined;

  if (!row) {
    throw new HttpError(404, "Товар не знайдено.");
  }

  const pricingRows = db
    .prepare(
      "SELECT * FROM pricing_options WHERE product_id = ? ORDER BY sort_order ASC"
    )
    .all(id) as PricingRow[];

  return mapProduct(row, pricingRows);
}

function getFaqById(id: string) {
  const row = db
    .prepare("SELECT * FROM faqs WHERE id = ?")
    .get(id) as FaqRow | undefined;

  if (!row) {
    throw new HttpError(404, "FAQ не знайдено.");
  }

  return mapFaq(row);
}

function getNewsById(id: string) {
  const row = db
    .prepare("SELECT * FROM news WHERE id = ?")
    .get(id) as NewsRow | undefined;

  if (!row) {
    throw new HttpError(404, "Новину не знайдено.");
  }

  return mapNews(row);
}

export function getProductBySlug(slug: string, includeInactive = false) {
  const row = db
    .prepare(
      includeInactive
        ? "SELECT * FROM products WHERE slug = ?"
        : "SELECT * FROM products WHERE slug = ? AND is_active = 1"
    )
    .get(slug) as ProductRow | undefined;

  if (!row) {
    throw new HttpError(404, "Товар не знайдено.");
  }

  const pricingRows = db
    .prepare("SELECT * FROM pricing_options WHERE product_id = ? ORDER BY sort_order ASC")
    .all(row.id) as PricingRow[];

  return mapProduct(row, pricingRows);
}

export function upsertTelegramNews(payload: {
  title: string;
  dateLabel: string;
  content: string;
  sourceUrl: string;
  sourceChatId: number;
  sourceMessageId: number;
  publishedAt: string;
}) {
  const existing = db
    .prepare(
      "SELECT * FROM news WHERE source_type = 'telegram' AND source_chat_id = ? AND source_message_id = ?"
    )
    .get(payload.sourceChatId, payload.sourceMessageId) as NewsRow | undefined;

  if (existing) {
    return updateNewsItem(existing.id, {
      title: payload.title,
      dateLabel: payload.dateLabel,
      content: payload.content,
      sourceType: "telegram",
      sourceUrl: payload.sourceUrl,
      sourceChatId: payload.sourceChatId,
      sourceMessageId: payload.sourceMessageId,
      publishedAt: payload.publishedAt,
      isActive: true
    });
  }

  return createNewsItem({
    title: payload.title,
    dateLabel: payload.dateLabel,
    content: payload.content,
    sortOrder: 0,
    isActive: true,
    sourceType: "telegram",
    sourceUrl: payload.sourceUrl,
    sourceChatId: payload.sourceChatId,
    sourceMessageId: payload.sourceMessageId,
    publishedAt: payload.publishedAt
  });
}

export function recordTelegramWebhookEvent(payload: {
  updateId: number | null;
  eventType: string;
  chatId: number | null;
  messageId: number | null;
  status: "processed" | "ignored" | "failed";
  errorMessage?: string;
}) {
  db.prepare(
    `INSERT INTO telegram_webhook_events
      (update_id, event_type, chat_id, message_id, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    payload.updateId,
    payload.eventType,
    payload.chatId,
    payload.messageId,
    payload.status,
    payload.errorMessage ?? null,
    nowIso()
  );
}

export function listTelegramWebhookEvents(limit = 30) {
  return db
    .prepare(
      `SELECT id, update_id AS updateId, event_type AS eventType,
        chat_id AS chatId, message_id AS messageId, status,
        error_message AS errorMessage, created_at AS createdAt
       FROM telegram_webhook_events ORDER BY id DESC LIMIT ?`
    )
    .all(Math.min(Math.max(limit, 1), 100));
}

function getReviewById(id: string) {
  const row = db
    .prepare("SELECT * FROM reviews WHERE id = ?")
    .get(id) as ReviewRow | undefined;

  if (!row) {
    throw new HttpError(404, "Відгук не знайдено.");
  }

  return mapReview(row);
}

function getLeadById(id: string) {
  const row = db
    .prepare("SELECT * FROM leads WHERE id = ?")
    .get(id) as LeadRow | undefined;

  if (!row) {
    throw new HttpError(404, "Заявку не знайдено.");
  }

  return mapLead(row, readLeadItemRowsForLeadIds([id]));
}

function requireCategoryExists(categoryId: string) {
  const category = db
    .prepare("SELECT id FROM categories WHERE id = ?")
    .get(categoryId);

  if (!category) {
    throw new HttpError(400, "Категорію не знайдено.");
  }
}

function normalizePricingOptions(options: unknown) {
  if (!Array.isArray(options) || options.length === 0) {
    throw new HttpError(400, "Товар повинен мати хоча б один тариф.");
  }

  return options.map((option, index) => {
    const raw = option as Partial<PricingOption>;
    const rawCompareAt = (option as { compareAt?: unknown }).compareAt;

    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : randomUUID(),
      label: normalizeText(raw.label, `pricingOptions[${index}].label`),
      price: Math.round(normalizeNumber(raw.price)),
      compareAt:
        rawCompareAt === null ||
        rawCompareAt === undefined ||
        (typeof rawCompareAt === "string" && rawCompareAt.trim() === "")
          ? null
          : Math.round(normalizeNumber(rawCompareAt)),
      sortOrder: normalizeNumber(raw.sortOrder, index + 1),
      isActive: raw.isActive === undefined ? true : Boolean(raw.isActive)
    };
  });
}

function normalizeDetails(input: unknown) {
  if (Array.isArray(input)) {
    const items = input
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);

    if (items.length) {
      return items;
    }
  }

  if (typeof input === "string") {
    return input
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function getActivePricingOptions(product: Product) {
  const active = product.pricingOptions.filter((item) => item.isActive);
  return active.length ? active : product.pricingOptions;
}

function getLowestPricingOption(product: Product) {
  const pricingOptions = getActivePricingOptions(product);
  const firstOption = pricingOptions[0];

  if (!firstOption) {
    throw new HttpError(400, "У товару немає доступних тарифів.");
  }

  return pricingOptions.reduce((lowest, current) =>
    current.price < lowest.price ? current : lowest
  , firstOption);
}

function createLeadSnapshotItem(
  productId: string,
  pricingOptionId: string | null,
  quantity: number
): NormalizedLeadItem {
  const product = getProductById(productId);
  const pricingOptions = getActivePricingOptions(product);

  if (!pricingOptions.length) {
    throw new HttpError(400, "Для цього товару немає доступних тарифів.");
  }

  const chosenOption = pricingOptionId
    ? pricingOptions.find((item) => item.id === pricingOptionId)
    : getLowestPricingOption(product);

  if (!chosenOption) {
    throw new HttpError(400, "Вибраний тариф не знайдено.");
  }

  return {
    id: randomUUID(),
    productId: product.id,
    pricingOptionId: chosenOption.id,
    labelSnapshot: `${product.name} — ${chosenOption.label}`,
    unitPriceSnapshot: chosenOption.price,
    compareAtSnapshot: chosenOption.compareAt,
    quantity
  };
}

function normalizeLeadItems(payload: LeadPayload) {
  const rawItems = Array.isArray(payload.items) ? payload.items : [];

  if (rawItems.length) {
    return rawItems.map((item, index) => {
      const raw = item as {
        productId?: unknown;
        pricingOptionId?: unknown;
        quantity?: unknown;
      };

      const productId = normalizeText(
        raw.productId,
        `items[${index}].productId`
      );
      const pricingOptionId =
        typeof raw.pricingOptionId === "string" && raw.pricingOptionId.trim()
          ? raw.pricingOptionId.trim()
          : null;
      const quantity = normalizePositiveInt(
        raw.quantity,
        `items[${index}].quantity`,
        1
      );

      return createLeadSnapshotItem(productId, pricingOptionId, quantity);
    });
  }

  const legacyProductId =
    typeof payload.productId === "string" && payload.productId.trim()
      ? payload.productId.trim()
      : null;

  if (!legacyProductId) {
    throw new HttpError(400, "Оберіть товар і тариф для заявки.");
  }

  return [createLeadSnapshotItem(legacyProductId, null, 1)];
}

function buildLegacyLeadItemsFallback(productId: string | null) {
  if (!productId) {
    return [];
  }

  try {
    return [createLeadSnapshotItem(productId, null, 1)];
  } catch {
    return [
      {
        id: `legacy-${productId}`,
        productId,
        pricingOptionId: null,
        labelSnapshot: productId,
        unitPriceSnapshot: 0,
        compareAtSnapshot: null,
        quantity: 1
      }
    ];
  }
}

function insertLeadItems(leadId: string, items: NormalizedLeadItem[]) {
  const insert = db.prepare(
    `
      INSERT INTO lead_items (
        id,
        lead_id,
        product_id,
        pricing_option_id,
        label_snapshot,
        unit_price_snapshot,
        compare_at_snapshot,
        quantity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
  );

  items.forEach((item) => {
    insert.run(
      item.id,
      leadId,
      item.productId,
      item.pricingOptionId,
      item.labelSnapshot,
      item.unitPriceSnapshot,
      item.compareAtSnapshot,
      item.quantity
    );
  });
}

function ensureLeadItemsBackfill() {
  const rows = db
    .prepare(
      `
        SELECT leads.id, leads.product_id
        FROM leads
        LEFT JOIN lead_items ON lead_items.lead_id = leads.id
        WHERE lead_items.id IS NULL
      `
    )
    .all() as Array<{ id: string; product_id: string | null }>;

  if (!rows.length) {
    return;
  }

  const transaction = db.transaction(() => {
    rows.forEach((row) => {
      if (!row.product_id) {
        return;
      }

      try {
        insertLeadItems(row.id, [createLeadSnapshotItem(row.product_id, null, 1)]);
      } catch {
        // Keep the legacy row readable even if product/tariff no longer exists.
      }
    });
  });

  transaction();
}

function touchContentTimestamp(tableName: string, ids: string[]) {
  if (!ids.length) {
    return;
  }

  const placeholders = ids.map(() => "?").join(", ");
  db.prepare(
    `UPDATE ${tableName} SET updated_at = ? WHERE id IN (${placeholders})`
  ).run(nowIso(), ...ids);
}

function applyBooleanBulkAction(
  tableName: "products" | "faqs" | "news" | "reviews",
  payload: BulkPayload,
  enabledColumn = "is_active"
): BulkMutationResult {
  const ids = normalizeIdList(payload.ids);
  const action = normalizeText(payload.action, "action");

  if (action === "delete") {
    const placeholders = ids.map(() => "?").join(", ");
    const result = db
      .prepare(`DELETE FROM ${tableName} WHERE id IN (${placeholders})`)
      .run(...ids);

    return { count: result.changes };
  }

  if (action !== "activate" && action !== "deactivate") {
    throw new HttpError(400, "Непідтримувана bulk-дія.");
  }

  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(
      `UPDATE ${tableName} SET ${enabledColumn} = ?, updated_at = ? WHERE id IN (${placeholders})`
    )
    .run(action === "activate" ? 1 : 0, nowIso(), ...ids);

  return { count: result.changes };
}

function applyReviewBulkAction(payload: BulkPayload): BulkMutationResult {
  const ids = normalizeIdList(payload.ids);
  const action = normalizeText(payload.action, "action");

  if (action === "delete") {
    const placeholders = ids.map(() => "?").join(", ");
    const result = db
      .prepare(`DELETE FROM reviews WHERE id IN (${placeholders})`)
      .run(...ids);

    return { count: result.changes };
  }

  const patchByAction: Record<string, { column: string; value: number }> = {
    activate: { column: "is_active", value: 1 },
    deactivate: { column: "is_active", value: 0 },
    moderate: { column: "is_moderated", value: 1 },
    unmoderate: { column: "is_moderated", value: 0 }
  };

  const patch = patchByAction[action];
  if (!patch) {
    throw new HttpError(400, "Непідтримувана bulk-дія для відгуків.");
  }

  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(
      `UPDATE reviews SET ${patch.column} = ?, updated_at = ? WHERE id IN (${placeholders})`
    )
    .run(patch.value, nowIso(), ...ids);

  return { count: result.changes };
}

ensureSchema();
ensureCompatibilityMigrations();
ensureSeed();
ensureLeadItemsBackfill();

export function getSiteSettings() {
  const row = db
    .prepare("SELECT * FROM settings WHERE singleton_key = 1")
    .get() as Record<string, unknown>;

  return mapSettings(row);
}

export function listCategories(includeInactive = false) {
  const sql = includeInactive
    ? "SELECT * FROM categories ORDER BY sort_order ASC, name ASC"
    : "SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC";

  return (db.prepare(sql).all() as CategoryRow[]).map(mapCategory);
}

export function listProducts(includeInactive = false) {
  const productRows = readProductRows(includeInactive);
  const pricingRows = readPricingRows(includeInactive);
  return productRows.map((row) => mapProduct(row, pricingRows));
}

export function listFaqs(includeInactive = false) {
  const sql = includeInactive
    ? "SELECT * FROM faqs ORDER BY sort_order ASC, question ASC"
    : "SELECT * FROM faqs WHERE is_active = 1 ORDER BY sort_order ASC, question ASC";

  return (db.prepare(sql).all() as FaqRow[]).map(mapFaq);
}

export function listNews(includeInactive = false) {
  const sql = includeInactive
    ? "SELECT * FROM news ORDER BY sort_order ASC, COALESCE(published_at, updated_at) DESC, title ASC"
    : "SELECT * FROM news WHERE is_active = 1 ORDER BY sort_order ASC, COALESCE(published_at, updated_at) DESC, title ASC";

  return (db.prepare(sql).all() as NewsRow[]).map(mapNews);
}

export function listReviews(includeInactive = false, includeUnmoderated = false) {
  const filters: string[] = [];

  if (!includeInactive) {
    filters.push("is_active = 1");
  }

  if (!includeUnmoderated) {
    filters.push("is_moderated = 1");
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return (db
    .prepare(`SELECT * FROM reviews ${where} ORDER BY sort_order ASC, created_at DESC`)
    .all() as ReviewRow[]).map(mapReview);
}

export function listLeads() {
  const leadRows = db
    .prepare("SELECT * FROM leads ORDER BY created_at DESC")
    .all() as LeadRow[];

  return leadRows.map((row) =>
    mapLead(row, readLeadItemRowsForLeadIds(leadRows.map((lead) => lead.id)))
  );
}

export function createLead(payload: LeadPayload) {
  const id = randomUUID();
  const name = normalizeText(payload.name, "name");
  const contact = normalizeText(payload.contact, "contact");
  const message = normalizeOptionalText(payload.message);
  const items = normalizeLeadItems(payload);
  const primaryProductId = items[0]?.productId ?? null;
  const createdAt = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO leads (
          id,
          name,
          contact,
          product_id,
          message,
          status,
          created_at
        ) VALUES (?, ?, ?, ?, ?, 'new', ?)
      `
    ).run(id, name, contact, primaryProductId, message, createdAt);

    insertLeadItems(id, items);
  });

  transaction();
  return getLeadById(id);
}

export function createCategory(payload: Partial<Category>) {
  const id = randomUUID();
  const name = normalizeText(payload.name, "name");
  const slug = slugify(payload.slug?.trim() || name);
  const icon = normalizeOptionalText(payload.icon) || "✨";
  const sortOrder = normalizeNumber(payload.sortOrder, listCategories(true).length + 1);
  const updatedAt = nowIso();

  db.prepare(
    `
      INSERT INTO categories (id, name, slug, icon, sort_order, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `
  ).run(id, name, slug, icon, sortOrder, boolToInt(payload.isActive), updatedAt);

  return getCategoryById(id);
}

export function updateCategory(id: string, payload: Partial<Category>) {
  const current = getCategoryById(id);
  const name = payload.name ? normalizeText(payload.name, "name") : current.name;
  const slug = slugify(payload.slug?.trim() || name);
  const icon = payload.icon ? normalizeOptionalText(payload.icon) || "✨" : current.icon;
  const sortOrder =
    payload.sortOrder !== undefined
      ? normalizeNumber(payload.sortOrder, current.sortOrder)
      : current.sortOrder;
  const isActive =
    payload.isActive !== undefined
      ? boolToInt(payload.isActive)
      : boolToInt(current.isActive);

  db.prepare(
    `
      UPDATE categories
      SET name = ?, slug = ?, icon = ?, sort_order = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(name, slug, icon, sortOrder, isActive, nowIso(), id);

  return getCategoryById(id);
}

export function deleteCategory(id: string) {
  getCategoryById(id);
  const inUse = db
    .prepare("SELECT COUNT(*) AS count FROM products WHERE category_id = ?")
    .get(id) as { count: number };

  if (inUse.count > 0) {
    throw new HttpError(409, "Категорія використовується товарами.");
  }

  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}

export function createProduct(payload: Partial<Product>) {
  const id =
    typeof payload.id === "string" && payload.id.trim()
      ? payload.id.trim()
      : randomUUID();
  const name = normalizeText(payload.name, "name");
  const slug = slugify(payload.slug?.trim() || name);
  const categoryId = normalizeText(payload.categoryId, "categoryId");
  requireCategoryExists(categoryId);
  const details = normalizeDetails(payload.details);
  const pricingOptions = normalizePricingOptions(payload.pricingOptions);
  const summary = normalizeText(payload.summary, "summary");
  const logo = normalizeText(payload.logo, "logo");
  const sortOrder = normalizeNumber(payload.sortOrder, listProducts(true).length + 1);
  const updatedAt = nowIso();

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO products (
          id,
          name,
          slug,
          category_id,
          summary,
          details_json,
          logo,
          is_hot,
          is_active,
          sort_order,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      id,
      name,
      slug,
      categoryId,
      summary,
      JSON.stringify(details),
      logo,
      boolToInt(payload.isHot, false),
      boolToInt(payload.isActive),
      sortOrder,
      updatedAt
    );

    const insertPricing = db.prepare(
      `
        INSERT INTO pricing_options (
          id,
          product_id,
          label,
          price,
          compare_at,
          sort_order,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    );

    pricingOptions.forEach((option) => {
      insertPricing.run(
        option.id,
        id,
        option.label,
        option.price,
        option.compareAt,
        option.sortOrder,
        boolToInt(option.isActive)
      );
    });
  });

  transaction();
  return getProductById(id);
}

export function updateProduct(id: string, payload: Partial<Product>) {
  const current = getProductById(id);
  const name = payload.name ? normalizeText(payload.name, "name") : current.name;
  const slug = slugify(payload.slug?.trim() || name);
  const categoryId = payload.categoryId
    ? normalizeText(payload.categoryId, "categoryId")
    : current.categoryId;
  requireCategoryExists(categoryId);
  const details = payload.details ? normalizeDetails(payload.details) : current.details;
  const pricingOptions = payload.pricingOptions
    ? normalizePricingOptions(payload.pricingOptions)
    : current.pricingOptions;
  const summary = payload.summary
    ? normalizeText(payload.summary, "summary")
    : current.summary;
  const logo = payload.logo ? normalizeText(payload.logo, "logo") : current.logo;
  const sortOrder =
    payload.sortOrder !== undefined
      ? normalizeNumber(payload.sortOrder, current.sortOrder)
      : current.sortOrder;
  const isHot =
    payload.isHot !== undefined ? boolToInt(payload.isHot) : boolToInt(current.isHot);
  const isActive =
    payload.isActive !== undefined
      ? boolToInt(payload.isActive)
      : boolToInt(current.isActive);

  const transaction = db.transaction(() => {
    db.prepare(
      `
        UPDATE products
        SET name = ?, slug = ?, category_id = ?, summary = ?, details_json = ?, logo = ?, is_hot = ?, is_active = ?, sort_order = ?, updated_at = ?
        WHERE id = ?
      `
    ).run(
      name,
      slug,
      categoryId,
      summary,
      JSON.stringify(details),
      logo,
      isHot,
      isActive,
      sortOrder,
      nowIso(),
      id
    );

    db.prepare("DELETE FROM pricing_options WHERE product_id = ?").run(id);

    const insertPricing = db.prepare(
      `
        INSERT INTO pricing_options (
          id,
          product_id,
          label,
          price,
          compare_at,
          sort_order,
          is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    );

    pricingOptions.forEach((option) => {
      insertPricing.run(
        option.id,
        id,
        option.label,
        option.price,
        option.compareAt,
        option.sortOrder,
        boolToInt(option.isActive)
      );
    });
  });

  transaction();
  return getProductById(id);
}

export function deleteProduct(id: string) {
  getProductById(id);
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
}

export function bulkUpdateProducts(payload: BulkPayload) {
  return applyBooleanBulkAction("products", payload);
}

export function createFaq(payload: Partial<FaqItem>) {
  const id = randomUUID();

  db.prepare(
    `
      INSERT INTO faqs (id, question, answer, sort_order, is_active, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    normalizeText(payload.question, "question"),
    normalizeText(payload.answer, "answer"),
    normalizeNumber(payload.sortOrder, listFaqs(true).length + 1),
    boolToInt(payload.isActive),
    nowIso()
  );

  return getFaqById(id);
}

export function updateFaq(id: string, payload: Partial<FaqItem>) {
  const current = getFaqById(id);

  db.prepare(
    `
      UPDATE faqs
      SET question = ?, answer = ?, sort_order = ?, is_active = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(
    payload.question ? normalizeText(payload.question, "question") : current.question,
    payload.answer ? normalizeText(payload.answer, "answer") : current.answer,
    payload.sortOrder !== undefined
      ? normalizeNumber(payload.sortOrder, current.sortOrder)
      : current.sortOrder,
    payload.isActive !== undefined
      ? boolToInt(payload.isActive)
      : boolToInt(current.isActive),
    nowIso(),
    id
  );

  return getFaqById(id);
}

export function deleteFaq(id: string) {
  getFaqById(id);
  db.prepare("DELETE FROM faqs WHERE id = ?").run(id);
}

export function bulkUpdateFaqs(payload: BulkPayload) {
  return applyBooleanBulkAction("faqs", payload);
}

export function createNewsItem(payload: Partial<NewsItem>) {
  const id = randomUUID();

  db.prepare(
    `
        INSERT INTO news (id, title, date_label, content, sort_order, is_active, source_type, source_url, source_chat_id, source_message_id, published_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    normalizeText(payload.title, "title"),
    normalizeText(payload.dateLabel, "dateLabel"),
    normalizeText(payload.content, "content"),
    normalizeNumber(payload.sortOrder, listNews(true).length + 1),
    boolToInt(payload.isActive),
    payload.sourceType ?? "manual",
    payload.sourceUrl ?? null,
    payload.sourceChatId ?? null,
    payload.sourceMessageId ?? null,
    payload.publishedAt ?? null,
    nowIso()
  );

  return getNewsById(id);
}

export function updateNewsItem(id: string, payload: Partial<NewsItem>) {
  const current = getNewsById(id);

  db.prepare(
    `
      UPDATE news
      SET title = ?, date_label = ?, content = ?, sort_order = ?, is_active = ?, source_type = ?, source_url = ?, source_chat_id = ?, source_message_id = ?, published_at = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(
    payload.title ? normalizeText(payload.title, "title") : current.title,
    payload.dateLabel ? normalizeText(payload.dateLabel, "dateLabel") : current.dateLabel,
    payload.content ? normalizeText(payload.content, "content") : current.content,
    payload.sortOrder !== undefined
      ? normalizeNumber(payload.sortOrder, current.sortOrder)
      : current.sortOrder,
    payload.isActive !== undefined
      ? boolToInt(payload.isActive)
      : boolToInt(current.isActive),
    payload.sourceType ?? current.sourceType ?? "manual",
    payload.sourceUrl ?? current.sourceUrl ?? null,
    payload.sourceChatId ?? current.sourceChatId ?? null,
    payload.sourceMessageId ?? current.sourceMessageId ?? null,
    payload.publishedAt ?? current.publishedAt ?? null,
    nowIso(),
    id
  );

  return getNewsById(id);
}

export function deleteNewsItem(id: string) {
  getNewsById(id);
  db.prepare("DELETE FROM news WHERE id = ?").run(id);
}

export function bulkUpdateNews(payload: BulkPayload) {
  return applyBooleanBulkAction("news", payload);
}

export function createReview(payload: Partial<Review>) {
  const id = randomUUID();
  const createdAt =
    typeof payload.createdAt === "string" && payload.createdAt.trim()
      ? payload.createdAt
      : nowIso();

  db.prepare(
    `
      INSERT INTO reviews (
        id,
        name,
        rating,
        content,
        sort_order,
        is_active,
        is_moderated,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  ).run(
    id,
    normalizeText(payload.name, "name"),
    Math.max(1, Math.min(5, Math.round(normalizeNumber(payload.rating, 5)))),
    normalizeText(payload.content, "content"),
    normalizeNumber(payload.sortOrder, listReviews(true, true).length + 1),
    boolToInt(payload.isActive),
    boolToInt(payload.isModerated),
    createdAt,
    createdAt
  );

  return getReviewById(id);
}

export function updateReview(id: string, payload: Partial<Review>) {
  const current = getReviewById(id);

  db.prepare(
    `
      UPDATE reviews
      SET name = ?, rating = ?, content = ?, sort_order = ?, is_active = ?, is_moderated = ?, updated_at = ?
      WHERE id = ?
    `
  ).run(
    payload.name ? normalizeText(payload.name, "name") : current.name,
    payload.rating !== undefined
      ? Math.max(1, Math.min(5, Math.round(normalizeNumber(payload.rating, current.rating))))
      : current.rating,
    payload.content ? normalizeText(payload.content, "content") : current.content,
    payload.sortOrder !== undefined
      ? normalizeNumber(payload.sortOrder, current.sortOrder)
      : current.sortOrder,
    payload.isActive !== undefined
      ? boolToInt(payload.isActive)
      : boolToInt(current.isActive),
    payload.isModerated !== undefined
      ? boolToInt(payload.isModerated)
      : boolToInt(current.isModerated),
    nowIso(),
    id
  );

  return getReviewById(id);
}

export function deleteReview(id: string) {
  getReviewById(id);
  db.prepare("DELETE FROM reviews WHERE id = ?").run(id);
}

export function bulkUpdateReviews(payload: BulkPayload) {
  return applyReviewBulkAction(payload);
}

export function updateLeadStatus(id: string, status: unknown) {
  if (status !== "new" && status !== "contacted" && status !== "closed") {
    throw new HttpError(400, "Некоректний статус заявки.");
  }

  getLeadById(id);
  db.prepare("UPDATE leads SET status = ? WHERE id = ?").run(status, id);
  return getLeadById(id);
}

export function bulkUpdateLeads(payload: BulkPayload) {
  const ids = normalizeIdList(payload.ids);
  const action = normalizeText(payload.action, "action");

  if (action !== "new" && action !== "contacted" && action !== "closed") {
    throw new HttpError(400, "Непідтримувана bulk-дія для заявок.");
  }

  const placeholders = ids.map(() => "?").join(", ");
  const result = db
    .prepare(`UPDATE leads SET status = ? WHERE id IN (${placeholders})`)
    .run(action, ...ids);

  return { count: result.changes };
}

export function updateSiteSettings(payload: Partial<SiteSettings>) {
  const current = getSiteSettings();

  db.prepare(
    `
      UPDATE settings
      SET site_name = ?, telegram_contact_url = ?, telegram_news_channel_url = ?, telegram_channel = ?, hero_title = ?, hero_subtitle = ?, footer_description = ?, lead_title = ?, lead_subtitle = ?
      WHERE singleton_key = 1
    `
  ).run(
    payload.siteName ? normalizeText(payload.siteName, "siteName") : current.siteName,
    payload.telegramContactUrl
      ? normalizeText(payload.telegramContactUrl, "telegramContactUrl")
      : current.telegramContactUrl,
    payload.telegramNewsChannelUrl
      ? normalizeText(payload.telegramNewsChannelUrl, "telegramNewsChannelUrl")
      : current.telegramNewsChannelUrl,
    payload.telegramContactUrl
      ? normalizeText(payload.telegramContactUrl, "telegramContactUrl")
      : current.telegramContactUrl,
    payload.heroTitle ? normalizeText(payload.heroTitle, "heroTitle") : current.heroTitle,
    payload.heroSubtitle
      ? normalizeText(payload.heroSubtitle, "heroSubtitle")
      : current.heroSubtitle,
    payload.footerDescription
      ? normalizeText(payload.footerDescription, "footerDescription")
      : current.footerDescription,
    payload.leadTitle ? normalizeText(payload.leadTitle, "leadTitle") : current.leadTitle,
    payload.leadSubtitle
      ? normalizeText(payload.leadSubtitle, "leadSubtitle")
      : current.leadSubtitle
  );

  return getSiteSettings();
}
