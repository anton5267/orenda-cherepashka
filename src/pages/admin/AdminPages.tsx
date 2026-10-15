import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  Link,
  useSearchParams,
  type SetURLSearchParams
} from "react-router-dom";
import type {
  AnalyticsSummary,
  BulkActionPayload,
  Category,
  FaqItem,
  Lead,
  LeadStatus,
  NewsItem,
  PricingOption,
  Product,
  Review,
  SiteSettings,
  TelegramWebhookEvent
} from "../../types";
import { api, ApiError } from "../../api";
import { useAdminUnsavedChanges } from "./AdminLayout";
import {
  ActionButton,
  ActionLink,
  EmptyState,
  NoticePanel,
  ProductLogo,
  SurfaceCard,
  formatPrice
} from "../../shared";
import { useToast } from "../../toasts";
import { recommendedSettingsCopy } from "../../../shared/siteDefaults";

type StatusTone = "success" | "warning" | "danger" | "accent" | "muted";
type ActiveFilterItem = {
  key: string;
  label: string;
  value: string;
  onClear: () => void;
};
type CategoryDraft = Omit<Category, "id" | "updatedAt">;
type FaqDraft = Omit<FaqItem, "id" | "updatedAt">;
type NewsDraft = Omit<NewsItem, "id" | "updatedAt">;
type ReviewDraft = Omit<Review, "id" | "updatedAt">;
type ProductDraft = Omit<Product, "id" | "updatedAt">;

const leadStatusFilters: Array<{ value: LeadStatus; label: string }> = [
  { value: "new", label: "Нова" },
  { value: "contacted", label: "У роботі" },
  { value: "closed", label: "Закрита" }
];

const productBulkOptions = [
  { value: "activate", label: "Активувати" },
  { value: "deactivate", label: "Деактивувати" },
  { value: "delete", label: "Видалити" }
];

const faqBulkOptions = [
  { value: "activate", label: "Активувати" },
  { value: "deactivate", label: "Деактивувати" },
  { value: "delete", label: "Видалити" }
];

const newsBulkOptions = [
  { value: "activate", label: "Активувати" },
  { value: "deactivate", label: "Деактивувати" },
  { value: "delete", label: "Видалити" }
];

const reviewBulkOptions = [
  { value: "activate", label: "Активувати" },
  { value: "deactivate", label: "Деактивувати" },
  { value: "moderate", label: "Промодерувати" },
  { value: "unmoderate", label: "Зняти модерацію" },
  { value: "delete", label: "Видалити" }
];

const leadBulkOptions = leadStatusFilters.map((option) => ({
  value: option.value,
  label: `Позначити: ${option.label}`
}));

const settingsFieldLabels = {
  heroTitle: "Головний заголовок hero",
  heroSubtitle: "Підзаголовок hero",
  footerDescription: "Опис у футері",
  leadTitle: "Заголовок заявки",
  leadSubtitle: "Підзаголовок заявки"
} satisfies Record<keyof typeof recommendedSettingsCopy, string>;

function SectionHeader({
  title,
  description,
  extra
}: {
  title: string;
  description: string;
  extra?: ReactNode;
}) {
  return (
    <div className="admin-section-head">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {extra}
    </div>
  );
}

function AdminCard({
  title,
  extra,
  children,
  className = "",
  id
}: {
  title: string;
  extra?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <SurfaceCard as="section" className={`admin-card ${className}`.trim()} id={id}>
      <div className="admin-card-head">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </SurfaceCard>
  );
}

function InlineLoader({ text = "Завантаження..." }: { text?: string }) {
  return <div className="inline-loader">{text}</div>;
}

function StatusBadge({
  children,
  tone = "muted"
}: {
  children: ReactNode;
  tone?: StatusTone;
}) {
  return (
    <span className={`status-badge status-${tone}`}>
      {children}
    </span>
  );
}

function SplitViewNav({
  createLabel,
  onCreate
}: {
  createLabel: string;
  onCreate: () => void;
}) {
  return (
    <div className="split-view-nav">
      <ActionButton size="compact" type="button" onClick={onCreate}>
        {createLabel}
      </ActionButton>
      <ActionLink variant="secondary" size="compact" href="#editor-panel">
        До форми
      </ActionLink>
      <ActionLink variant="secondary" size="compact" href="#list-panel">
        До списку
      </ActionLink>
    </div>
  );
}

function BulkActionBar({
  selectedCount,
  value,
  options,
  onValueChange,
  onApply,
  onClear
}: {
  selectedCount: number;
  value: string;
  options: Array<{ value: string; label: string }>;
  onValueChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  if (!selectedCount) {
    return null;
  }

  const controls = (
    <>
      <div className="bulk-summary">
        <strong>{selectedCount}</strong>
        <span>виділено</span>
      </div>
      <select value={value} onChange={(event) => onValueChange(event.target.value)}>
        <option value="">Оберіть bulk-дію</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ActionButton
        size="compact"
        type="button"
        onClick={onApply}
        disabled={!value}
      >
        Застосувати
      </ActionButton>
      <ActionButton variant="secondary" size="compact" type="button" onClick={onClear}>
        Очистити
      </ActionButton>
    </>
  );

  return (
    <>
      <div className="bulk-toolbar bulk-toolbar-inline">{controls}</div>
      <div className="bulk-toolbar bulk-toolbar-floating">{controls}</div>
    </>
  );
}

function EditorToolbar({
  dirty,
  saving,
  isEditing,
  createLabel,
  updateLabel,
  onReset,
  shortcutHref,
  shortcutLabel
}: {
  dirty: boolean;
  saving: boolean;
  isEditing: boolean;
  createLabel: string;
  updateLabel: string;
  onReset: () => void;
  shortcutHref?: string;
  shortcutLabel?: string;
}) {
  return (
    <div className="editor-toolbar">
      <div className="editor-toolbar-copy">
        <div className="item-tags">
          <StatusBadge tone={isEditing ? "accent" : "muted"}>
            {isEditing ? "Режим редагування" : "Новий запис"}
          </StatusBadge>
          <StatusBadge tone={dirty ? "warning" : "success"}>
            {dirty ? "Є незбережені зміни" : "Все збережено"}
          </StatusBadge>
        </div>
        <p>
          {dirty
            ? "Зміни ще не потрапили на сайт. Можна зберегти зараз або скинути форму."
            : "Форма синхронна зі збереженим станом. Можна перейти до списку або продовжити редагування."}
        </p>
      </div>
      <div className="editor-toolbar-actions">
        {!shortcutHref || !shortcutLabel ? null : (
          <ActionLink variant="secondary" size="compact" href={shortcutHref}>
            {shortcutLabel}
          </ActionLink>
        )}
        <ActionButton size="compact" type="submit" loading={saving} loadingLabel="Збереження...">
          {isEditing ? updateLabel : createLabel}
        </ActionButton>
        <ActionButton variant="secondary" size="compact" type="button" onClick={onReset}>
          Скинути
        </ActionButton>
      </div>
    </div>
  );
}

function ActiveFiltersBar({
  items,
  onReset
}: {
  items: ActiveFilterItem[];
  onReset: () => void;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <div className="active-filters-bar">
      <div className="active-filters-head">
        <strong>Активні фільтри</strong>
        <span>{items.length}</span>
      </div>
      <div className="active-filters-list">
        {items.map((item) => (
          <button
            className="active-filter-chip"
            key={item.key}
            type="button"
            onClick={item.onClear}
          >
            <span>{item.label}: {item.value}</span>
            <strong>×</strong>
          </button>
        ))}
      </div>
      <ActionButton variant="secondary" size="compact" type="button" onClick={onReset}>
        Скинути все
      </ActionButton>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  return error instanceof ApiError ? error.message : "Сталася помилка.";
}

function textIncludes(parts: Array<string | undefined | null>, query: string) {
  if (!query.trim()) {
    return true;
  }

  return parts
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function formatDateTime(value?: string) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("uk-UA", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function looksCorruptedText(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return true;
  }

  if (/\?{3,}|�/.test(trimmed)) {
    return true;
  }

  return !/[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(trimmed);
}

function getTimeValue(value?: string) {
  return value ? new Date(value).getTime() : 0;
}

function getDisplayPlans(product: Product) {
  const activePlans = product.pricingOptions.filter((plan) => plan.isActive);
  return activePlans.length ? activePlans : product.pricingOptions;
}

function getLowestDisplayedPlan(product: Product) {
  const plans = getDisplayPlans(product);
  return plans.reduce<PricingOption | null>((best, current) => {
    if (!best || current.price < best.price) {
      return current;
    }

    return best;
  }, null);
}

function getPriorityTone(count: number): StatusTone {
  if (count <= 0) {
    return "success";
  }

  if (count >= 5) {
    return "danger";
  }

  if (count >= 2) {
    return "warning";
  }

  return "accent";
}

function buildContactAction(contact: string) {
  const trimmed = contact.trim();

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return { href: trimmed, label: "Відкрити контакт" };
  }

  if (/^(?:@[\w\d_]+|t\.me\/[\w\d_]+|telegram\.me\/[\w\d_]+)$/i.test(trimmed)) {
    const handle = trimmed
      .replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "")
      .replace(/^(t\.me|telegram\.me)\//i, "")
      .replace(/^@/, "");

    return { href: `https://t.me/${handle}`, label: "Написати в Telegram" };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { href: `mailto:${trimmed}`, label: "Написати на email" };
  }

  const phone = trimmed.replace(/[^\d+]/g, "");
  if (phone.length >= 10) {
    return { href: `tel:${phone}`, label: "Подзвонити" };
  }

  return null;
}

function getProductIssues(product: Product) {
  const issues: string[] = [];
  const plans = getDisplayPlans(product);

  if (!plans.length) {
    issues.push("Немає активних тарифів");
  }

  if (plans.some((plan) => plan.price <= 0)) {
    issues.push("Є тариф без ціни");
  }

  if (!product.logo.trim()) {
    issues.push("Не заповнено логотип");
  }

  return issues;
}

function summarizeLeadItems(lead: Lead) {
  if (!lead.items.length) {
    return "Не вибрано";
  }

  return lead.items
    .map((item) => `${item.labelSnapshot} × ${item.quantity}`)
    .join(", ");
}

function getLeadStatusLabel(status: LeadStatus) {
  if (status === "new") {
    return "Нова";
  }

  if (status === "contacted") {
    return "У роботі";
  }

  return "Закрита";
}

function getLeadStatusTone(status: LeadStatus): StatusTone {
  if (status === "new") {
    return "warning";
  }

  if (status === "contacted") {
    return "accent";
  }

  return "success";
}

function updateSelection(current: string[], id: string) {
  return current.includes(id)
    ? current.filter((item) => item !== id)
    : [...current, id];
}

function looksLikeHttpUrl(value: string) {
  return /^https?:\/\/[^\s]+$/i.test(value.trim());
}

function createEmptyPricingOption(sortOrder = 1): PricingOption {
  return {
    id: "",
    label: "",
    price: 0,
    currency: "UAH",
    compareAt: null,
    sortOrder,
    isActive: true
  };
}

function createEmptyCategoryDraft(): CategoryDraft {
  return {
    name: "",
    slug: "",
    icon: "✨",
    sortOrder: 0,
    isActive: true
  };
}

function createEmptyFaqDraft(): FaqDraft {
  return {
    question: "",
    answer: "",
    sortOrder: 0,
    isActive: true
  };
}

function createEmptyNewsDraft(): NewsDraft {
  return {
    title: "",
    dateLabel: "",
    content: "",
    sortOrder: 0,
    isActive: true
  };
}

function createEmptyReviewDraft(): ReviewDraft {
  return {
    name: "",
    rating: 5,
    content: "",
    sortOrder: 0,
    isActive: true,
    isModerated: true,
    createdAt: new Date().toISOString()
  };
}

function createEmptyProductDraft(categoryId = ""): ProductDraft {
  return {
    name: "",
    slug: "",
    categoryId,
    summary: "",
    details: [""],
    logo: "",
    isHot: false,
    isActive: true,
    sortOrder: 0,
    pricingOptions: [createEmptyPricingOption(1)]
  };
}

function buildProductDraft(product: Product): ProductDraft {
  return {
    name: product.name,
    slug: product.slug,
    categoryId: product.categoryId,
    summary: product.summary,
    details: product.details.length ? [...product.details] : [""],
    logo: product.logo,
    isHot: product.isHot,
    isActive: product.isActive,
    sortOrder: product.sortOrder,
    pricingOptions: product.pricingOptions.length
      ? product.pricingOptions.map((option) => ({ ...option }))
      : [createEmptyPricingOption(1)]
  };
}

function createSettingsBaseline(settings: SiteSettings) {
  return JSON.stringify(settings);
}

function patchSearchParams(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams,
  patch: Record<string, string>,
  defaults: Record<string, string>
) {
  const next = new URLSearchParams(searchParams);

  Object.entries(patch).forEach(([key, value]) => {
    const normalized = value.trim();
    if (!normalized || defaults[key] === normalized) {
      next.delete(key);
    } else {
      next.set(key, normalized);
    }
  });

  setSearchParams(next, { replace: true });
}

function useUnsavedChangesGuard(dirty: boolean) {
  return useAdminUnsavedChanges(dirty);
}

function PricingOptionsEditor({
  options,
  onChange
}: {
  options: PricingOption[];
  onChange: (next: PricingOption[]) => void;
}) {
  const normalized = options.length ? options : [createEmptyPricingOption(1)];

  const updateOption = (index: number, patch: Partial<PricingOption>) => {
    onChange(
      normalized.map((option, currentIndex) =>
        currentIndex === index ? { ...option, ...patch } : option
      )
    );
  };

  const removeOption = (index: number) => {
    const next = normalized.filter((_, currentIndex) => currentIndex !== index);
    onChange(next.length ? next : [createEmptyPricingOption(1)]);
  };

  return (
    <div className="pricing-editor">
      {normalized.map((option, index) => (
        <div className="pricing-editor-card" key={`${option.id}-${index}`}>
          <div className="pricing-editor-head">
            <strong>{option.label || `Тариф #${index + 1}`}</strong>
            <div className="pricing-editor-actions">
              <StatusBadge tone={option.isActive ? "success" : "muted"}>
                {option.isActive ? "Активний" : "Вимкнений"}
              </StatusBadge>
              <button
                className="danger-button compact"
                type="button"
                onClick={() => removeOption(index)}
              >
                Видалити
              </button>
            </div>
          </div>

          <div className="pricing-row">
            <label>
              Назва
              <input
                value={option.label}
                placeholder="1 місяць"
                onChange={(event) => updateOption(index, { label: event.target.value })}
              />
            </label>
            <label>
              Ціна
              <input
                type="number"
                value={option.price}
                min="0"
                step={option.currency === "USD" ? "0.01" : "1"}
                onChange={(event) =>
                  updateOption(index, { price: Number(event.target.value) })
                }
              />
            </label>
            <label>
              Валюта
              <select
                value={option.currency}
                onChange={(event) =>
                  updateOption(index, {
                    currency: event.target.value === "USD" ? "USD" : "UAH"
                  })
                }
              >
                <option value="UAH">UAH · грн</option>
                <option value="USD">USD · $</option>
              </select>
            </label>
            <label>
              Стара ціна
              <input
                type="number"
                value={option.compareAt ?? ""}
                min="0"
                onChange={(event) =>
                  updateOption(index, {
                    compareAt: event.target.value ? Number(event.target.value) : null
                  })
                }
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={option.sortOrder}
                onChange={(event) =>
                  updateOption(index, { sortOrder: Number(event.target.value) })
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={option.isActive}
                onChange={(event) =>
                  updateOption(index, { isActive: event.target.checked })
                }
              />
              Активний
            </label>
          </div>

          <div className="pricing-preview">
            <div>
              <strong>{option.label || "Назва ще не заповнена"}</strong>
              <span>Preview ціни для каталогу</span>
            </div>
            <div className="pricing-preview-value">
              <strong>{formatPrice(option)}</strong>
              {!option.compareAt ? null : <s>{formatPrice(option.compareAt, option.currency)}</s>}
            </div>
          </div>
        </div>
      ))}

      <button
        className="ghost-button compact"
        type="button"
        onClick={() => onChange([...normalized, createEmptyPricingOption(normalized.length + 1)])}
      >
        Додати тариф
      </button>
    </div>
  );
}

export function AdminDashboardPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [telegramEvents, setTelegramEvents] = useState<TelegramWebhookEvent[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");

    try {
      const [
        loadedProducts,
        loadedCategories,
        loadedLeads,
        loadedReviews,
        loadedNews,
        loadedTelegramEvents,
        loadedAnalytics
      ] = await Promise.all([
        api.getProducts(true),
        api.getCategories(true),
        api.getLeads(),
        api.getReviews(true),
        api.getNews(true),
        api.getTelegramEvents(),
        api.getAnalytics()
      ]);

      setProducts(loadedProducts);
      setCategories(loadedCategories);
      setLeads(loadedLeads);
      setReviews(loadedReviews);
      setNews(loadedNews);
      setTelegramEvents(loadedTelegramEvents);
      setAnalytics(loadedAnalytics);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const latestProducts = [...products]
    .sort((left, right) => getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt))
    .slice(0, 5);
  const latestNews = [...news]
    .sort((left, right) => getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt))
    .slice(0, 5);
  const recentLeads = [...leads]
    .sort((left, right) => getTimeValue(right.createdAt) - getTimeValue(left.createdAt))
    .slice(0, 5);
  const inactiveProducts = products.filter((product) => !product.isActive);
  const productsWithIssues = products.filter((product) => getProductIssues(product).length);
  const pendingReviews = reviews.filter((review) => !review.isModerated);
  const activeCategories = categories.filter((category) => category.isActive).length;
  const newLeadsCount = leads.filter((lead) => lead.status === "new").length;
  const contactedLeadsCount = leads.filter((lead) => lead.status === "contacted").length;
  const closedLeadsCount = leads.filter((lead) => lead.status === "closed").length;

  const focusTasks = [
    {
      to: "/admin/leads?status=new",
      count: newLeadsCount,
      title: "Нові заявки",
      description: "Перевір нові звернення і швидко переведи їх у роботу."
    },
    {
      to: "/admin/reviews?moderation=pending",
      count: pendingReviews.length,
      title: "Модерація відгуків",
      description: "Опублікуй або приховай відгуки, які ще не переглянуті."
    },
    {
      to: "/admin/products?issue=pricing",
      count: productsWithIssues.length,
      title: "Проблемні тарифи",
      description: "Знайди товари без коректних цін або з неповними планами."
    },
    {
      to: "/admin/products?status=inactive",
      count: inactiveProducts.length,
      title: "Неактивні товари",
      description: "Поверни у каталог сервіси, які тимчасово вимкнені."
    }
  ].sort((left, right) => right.count - left.count);

  return (
    <>
      <SectionHeader
        title="Огляд"
        description="Швидкий статус по каталогу, заявках, відгуках і проблемних записах."
      />

      {loading ? (
        <InlineLoader />
      ) : loadError ? (
        <EmptyState
          title="Не вдалося завантажити огляд"
          description={loadError}
          action={
            <button className="primary-button compact" type="button" onClick={() => void load()}>
              Спробувати ще раз
            </button>
          }
        />
      ) : (
        <>
          <div className="dashboard-stats dashboard-stats-wide">
            <article className="dashboard-stat">
              <strong>{products.length}</strong>
              <span className="dashboard-muted">товарів</span>
            </article>
            <article className="dashboard-stat">
              <strong>{activeCategories}</strong>
              <span className="dashboard-muted">активних категорій</span>
            </article>
            <article className="dashboard-stat">
              <strong>{newLeadsCount}</strong>
              <span className="dashboard-muted">нових заявок</span>
            </article>
            <article className="dashboard-stat">
              <strong>{contactedLeadsCount}</strong>
              <span className="dashboard-muted">у роботі</span>
            </article>
            <article className="dashboard-stat">
              <strong>{closedLeadsCount}</strong>
              <span className="dashboard-muted">закритих заявок</span>
            </article>
            <article className="dashboard-stat">
              <strong>{pendingReviews.length}</strong>
              <span className="dashboard-muted">чекають модерації</span>
            </article>
          </div>

          <AdminCard title="Аналітика сайту · останні 30 днів">
            {!analytics ? (
              <p className="dashboard-muted">Поки немає зведених даних.</p>
            ) : (
              <>
                <div className="dashboard-stats dashboard-stats-wide">
                  <article className="dashboard-stat">
                    <strong>{analytics.pageViews}</strong>
                    <span className="dashboard-muted">переглядів сторінок</span>
                  </article>
                  <article className="dashboard-stat">
                    <strong>{analytics.productViews}</strong>
                    <span className="dashboard-muted">переглядів товарів</span>
                  </article>
                  <article className="dashboard-stat">
                    <strong>{analytics.telegramClicks}</strong>
                    <span className="dashboard-muted">переходів у Telegram</span>
                  </article>
                  <article className="dashboard-stat">
                    <strong>{analytics.leads}</strong>
                    <span className="dashboard-muted">заявок</span>
                  </article>
                  <article className="dashboard-stat">
                    <strong>{analytics.leadPerPageViewPercent}%</strong>
                    <span className="dashboard-muted">заявок на перегляд сторінки</span>
                  </article>
                </div>
                <div className="dashboard-grid">
                  <div>
                    <h4>Популярні товари</h4>
                    {!analytics.popularProducts.length ? (
                      <p className="dashboard-muted">Детальні сторінки товарів ще не переглядали.</p>
                    ) : (
                      <ul className="dashboard-list">
                        {analytics.popularProducts.map((product) => (
                          <li key={product.slug}>
                            <strong>{product.name}</strong> · {product.views} переглядів · {product.leads} заявок
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h4>UTM-джерела</h4>
                    {!analytics.campaignSources.length ? (
                      <p className="dashboard-muted">Позначених рекламних переходів поки немає.</p>
                    ) : (
                      <ul className="dashboard-list">
                        {analytics.campaignSources.map((source) => (
                          <li key={source.source}>
                            <strong>{source.source}</strong> · {source.visits} переходів · {source.leads} заявок
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <p className="dashboard-muted">
                  Аналітика рахує події без cookies, відбитків пристрою та збереження IP; записи автоматично видаляються через 90 днів.
                </p>
              </>
            )}
          </AdminCard>

          <div className="dashboard-grid">
            <AdminCard title="Швидкі переходи">
              <div className="quick-links-grid">
                <Link className="quick-link-card" to="/admin/products?status=inactive">
                  <strong>{inactiveProducts.length}</strong>
                  <span>неактивних товарів</span>
                </Link>
                <Link className="quick-link-card" to="/admin/products?issue=pricing">
                  <strong>{productsWithIssues.length}</strong>
                  <span>товарів з проблемними тарифами</span>
                </Link>
                <Link className="quick-link-card" to="/admin/reviews?moderation=pending">
                  <strong>{pendingReviews.length}</strong>
                  <span>немодерованих відгуків</span>
                </Link>
                <Link className="quick-link-card" to="/admin/leads?status=new">
                  <strong>{newLeadsCount}</strong>
                  <span>нових заявок</span>
                </Link>
              </div>
            </AdminCard>

            <AdminCard title="Фокус на зараз">
              <div className="focus-task-list">
                {focusTasks.map((task) => (
                  <Link className="focus-task-card" key={task.title} to={task.to}>
                    <div className="focus-task-copy">
                      <div className="item-tags">
                        <StatusBadge tone={getPriorityTone(task.count)}>
                          {task.count ? `${task.count} в роботі` : "Все чисто"}
                        </StatusBadge>
                      </div>
                      <strong>{task.title}</strong>
                      <p>{task.description}</p>
                    </div>
                    <span className="focus-task-count">{task.count}</span>
                  </Link>
                ))}
              </div>
            </AdminCard>
            <AdminCard title="Telegram webhook">
              {!telegramEvents.length ? (
                <p className="dashboard-muted">
                  Подій ще немає. Перевір TELEGRAM_BOT_TOKEN, secret і права бота в каналі.
                </p>
              ) : (
                <ul className="dashboard-list">
                  {telegramEvents.slice(0, 6).map((event) => (
                    <li key={event.id}>
                      <strong>{event.status}</strong> · {event.eventType} · {event.messageId ?? "—"}
                      <small>{formatDateTime(event.createdAt)}</small>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>

          <div className="dashboard-grid">
            <AdminCard title="Останні заявки">
              {!recentLeads.length ? (
                <EmptyState
                  title="Заявок поки немає"
                  description="Після першої заявки вона з'явиться тут."
                />
              ) : (
                <div className="admin-list-stack">
                  {recentLeads.map((lead) => (
                    <article className="admin-list-item compact-item" key={lead.id}>
                      <div>
                        <div className="item-tags">
                          <StatusBadge tone={getLeadStatusTone(lead.status)}>
                            {getLeadStatusLabel(lead.status)}
                          </StatusBadge>
                          <StatusBadge tone="muted">{formatDateTime(lead.createdAt)}</StatusBadge>
                        </div>
                        <strong>{lead.name}</strong>
                        <p>{lead.contact}</p>
                        <p>{summarizeLeadItems(lead)}</p>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </AdminCard>

            <AdminCard title="Останні змінені товари">
              {!latestProducts.length ? (
                <EmptyState
                  title="Немає товарів"
                  description="Після додавання або редагування товари з'являться тут."
                />
              ) : (
                <ul className="dashboard-list">
                  {latestProducts.map((product) => (
                    <li key={product.id}>
                      {product.name} · {formatDateTime(product.updatedAt)}
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>

            <AdminCard title="Останні змінені новини">
              {!latestNews.length ? (
                <EmptyState
                  title="Немає новин"
                  description="Після редагування новин цей блок наповниться."
                />
              ) : (
                <ul className="dashboard-list">
                  {latestNews.map((item) => (
                    <li key={item.id}>
                      {item.title} · {formatDateTime(item.updatedAt)}
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </div>
        </>
      )}
    </>
  );
}

export function AdminCategoriesPage() {
  const { pushToast } = useToast();
  const [items, setItems] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<CategoryDraft>(createEmptyCategoryDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState<{
    title: string;
    description: string;
    retry:
      | { type: "quick"; id: string; patch: Partial<Category>; successText: string }
      | { type: "delete"; id: string };
  } | null>(null);
  const [baseline, setBaseline] = useState(JSON.stringify(createEmptyCategoryDraft()));
  const dirty = JSON.stringify(draft) !== baseline;
  const confirmIfDirty = useUnsavedChangesGuard(dirty);
  const activeFilterItems = query.trim()
    ? [
        {
          key: "q",
          label: "Пошук",
          value: query,
          onClear: () => setQuery("")
        }
      ]
    : [];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setItems(await api.getCategories(true));
      setActionError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = [...items]
    .filter((item) => textIncludes([item.name, item.slug], query))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name));

  const resetForm = (force = false) => {
    if (!force && !confirmIfDirty()) {
      return;
    }

    const nextDraft = createEmptyCategoryDraft();
    setEditingId(null);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const openEditor = (item?: Category) => {
    if (!confirmIfDirty()) {
      return;
    }

    if (!item) {
      resetForm(true);
      return;
    }

    const nextDraft: CategoryDraft = {
      name: item.name,
      slug: item.slug,
      icon: item.icon,
      sortOrder: item.sortOrder,
      isActive: item.isActive
    };

    setEditingId(item.id);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const saveCurrentCategory = useCallback(async () => {
    setSaving(true);
    setSaveError("");

    try {
      if (editingId) {
        await api.updateCategory(editingId, draft);
        pushToast("Категорію оновлено.", "success");
      } else {
        await api.createCategory(draft);
        pushToast("Категорію створено.", "success");
      }

      resetForm(true);
      await load();
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточні правки залишилися у формі, можна повторити збереження.`;
      setSaveError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, load, pushToast]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveCurrentCategory();
  };

  const executeDeleteCategory = async (id: string) => {
    await api.deleteCategory(id);
    setActionError(null);
    if (editingId === id) {
      resetForm(true);
    }
    pushToast("Категорію видалено.", "success");
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Видалити категорію?")) {
      return;
    }

    try {
      await executeDeleteCategory(id);
    } catch (error) {
      const message = `${getErrorMessage(error)} Категорія не видалена, можна повторити дію.`;
      setActionError({
        title: "Не вдалося видалити категорію",
        description: message,
        retry: { type: "delete", id }
      });
      pushToast(message, "error");
    }
  };

  const executeCategoryQuickUpdate = async (
    id: string,
    patch: Partial<Category>,
    successText: string
  ) => {
    await api.updateCategory(id, patch);
    setActionError(null);
    pushToast(successText, "success");
    await load();
  };

  const updateCategoryQuick = async (item: Category, patch: Partial<Category>, successText: string) => {
    try {
      await executeCategoryQuickUpdate(item.id, patch, successText);
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточний стан категорії збережено в UI, можна повторити дію.`;
      setActionError({
        title: "Не вдалося оновити категорію",
        description: message,
        retry: { type: "quick", id: item.id, patch, successText }
      });
      pushToast(message, "error");
    }
  };

  const retryFailedCategoryAction = async () => {
    if (!actionError) {
      return;
    }

    try {
      if (actionError.retry.type === "delete") {
        await executeDeleteCategory(actionError.retry.id);
        return;
      }

      await executeCategoryQuickUpdate(
        actionError.retry.id,
        actionError.retry.patch,
        actionError.retry.successText
      );
    } catch (error) {
      const message = `${getErrorMessage(error)} Спробуй повторити ще раз.`;
      setActionError((current) =>
        current
          ? {
              ...current,
              description: message
            }
          : current
      );
      pushToast(message, "error");
    }
  };

  return (
    <>
      <SectionHeader
        title="Категорії"
        description="Тримай каталог охайним: іконки, slug-и, порядок і активність."
      />

      <SplitViewNav createLabel="Нова категорія" onCreate={() => openEditor()} />

      <div className="admin-two-column">
        <AdminCard id="editor-panel" title={editingId ? "Редагування категорії" : "Нова категорія"}>
          <form className="admin-form" onSubmit={handleSubmit}>
            <EditorToolbar
              dirty={dirty}
              saving={saving}
              isEditing={Boolean(editingId)}
              createLabel="Створити"
              updateLabel="Оновити"
              onReset={() => resetForm()}
              shortcutHref="#list-panel"
              shortcutLabel="До списку"
            />
            {!saveError ? null : (
              <NoticePanel
                title="Не вдалося зберегти категорію"
                description={saveError}
                tone="danger"
                action={
                  <button
                    className="ghost-button compact"
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrentCategory()}
                  >
                    Повторити збереження
                  </button>
                }
              />
            )}
            <div className="settings-preview-card editor-preview-card">
              <div className="item-tags">
                <StatusBadge tone={draft.isActive ? "success" : "muted"}>
                  {draft.isActive ? "Активна" : "Вимкнена"}
                </StatusBadge>
                <StatusBadge tone="muted">Порядок: {draft.sortOrder}</StatusBadge>
              </div>
              <strong>{draft.icon || "◼"} {draft.name || "Назва категорії"}</strong>
              <p>{draft.slug || "slug-категорії"}</p>
            </div>
            <label>
              Назва
              <input
                value={draft.name}
                onChange={(event) => {
                  setSaveError("");
                  setDraft((current) => ({ ...current, name: event.target.value }));
                }}
                required
              />
            </label>
            <label>
              Slug
              <input
                value={draft.slug}
                onChange={(event) => {
                  setSaveError("");
                  setDraft((current) => ({ ...current, slug: event.target.value }));
                }}
              />
            </label>
            <label>
              Іконка
              <input
                value={draft.icon}
                onChange={(event) => {
                  setSaveError("");
                  setDraft((current) => ({ ...current, icon: event.target.value }));
                }}
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) => {
                  setSaveError("");
                  setDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value)
                  }));
                }}
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) => {
                  setSaveError("");
                  setDraft((current) => ({ ...current, isActive: event.target.checked }));
                }}
              />
              Активна
            </label>
            <div className="admin-form-actions">
              <button className="primary-button compact" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingId ? "Оновити" : "Створити"}
              </button>
              <button className="ghost-button compact" type="button" onClick={() => resetForm()}>
                Скинути
              </button>
            </div>
          </form>
        </AdminCard>

        <AdminCard
          id="list-panel"
          title="Список категорій"
          extra={<span className="list-count">{visibleItems.length} записів</span>}
        >
          <div className="admin-toolbar">
            <label className="toolbar-field">
              <span>Пошук</span>
              <input
                placeholder="Назва або slug"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <ActiveFiltersBar items={activeFilterItems} onReset={() => setQuery("")} />

          {!loadError || !items.length ? null : (
            <NoticePanel
              title="Не вдалося оновити список категорій"
              description={`${loadError} Показуємо останній доступний стан списку.`}
              tone="warning"
              action={
                <button className="ghost-button compact" type="button" onClick={() => void load()}>
                  Повторити запит
                </button>
              }
            />
          )}

          {!actionError ? null : (
            <NoticePanel
              title={actionError.title}
              description={actionError.description}
              tone="danger"
              action={
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => void retryFailedCategoryAction()}
                >
                  Повторити дію
                </button>
              }
            />
          )}

          {loading ? (
            <InlineLoader />
          ) : loadError && !items.length ? (
            <EmptyState
              title="Не вдалося завантажити категорії"
              description={loadError}
              action={
                <button className="primary-button compact" type="button" onClick={() => void load()}>
                  Спробувати ще раз
                </button>
              }
            />
          ) : !visibleItems.length ? (
            <EmptyState
              title="Категорій не знайдено"
              description="Створи першу категорію або зміни запит пошуку."
            />
          ) : (
            <div className="admin-list-stack">
              {visibleItems.map((item) => (
                <article className="admin-list-item" key={item.id}>
                  <div>
                    <div className="item-tags">
                      <StatusBadge tone={item.isActive ? "success" : "muted"}>
                        {item.isActive ? "Активна" : "Вимкнена"}
                      </StatusBadge>
                      <StatusBadge tone="muted">Порядок: {item.sortOrder}</StatusBadge>
                    </div>
                    <strong>
                      {item.icon} {item.name}
                    </strong>
                    <p>{item.slug}</p>
                    <small>Оновлено: {formatDateTime(item.updatedAt)}</small>
                    <div className="inline-action-row">
                      <button
                        className={`ghost-button compact ${item.isActive ? "is-current" : ""}`}
                        type="button"
                        onClick={() =>
                          void updateCategoryQuick(
                            item,
                            { isActive: !item.isActive },
                            item.isActive ? "Категорію вимкнено." : "Категорію активовано."
                          )
                        }
                      >
                        {item.isActive ? "Вимкнути" : "Активувати"}
                      </button>
                    </div>
                  </div>
                  <div className="admin-table-actions">
                    <button
                      className="ghost-button compact"
                      type="button"
                      onClick={() => openEditor(item)}
                    >
                      Редагувати
                    </button>
                    <button
                      className="danger-button compact"
                      type="button"
                      onClick={() => void handleDelete(item.id)}
                    >
                      Видалити
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </>
  );
}

export function AdminProductsPage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [draft, setDraft] = useState<ProductDraft>(createEmptyProductDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState<{
    title: string;
    description: string;
    retry:
      | { type: "bulk"; ids: string[]; action: string }
      | { type: "quick"; id: string; patch: Partial<Product>; successText: string }
      | { type: "delete"; id: string };
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [baseline, setBaseline] = useState(JSON.stringify(createEmptyProductDraft()));
  const dirty = JSON.stringify(draft) !== baseline;
  const confirmIfDirty = useUnsavedChangesGuard(dirty);

  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "all";
  const categoryFilter = searchParams.get("category") ?? "all";
  const hotFilter = searchParams.get("hot") ?? "all";
  const issueFilter = searchParams.get("issue") ?? "all";
  const sort = searchParams.get("sort") ?? "updated";
  const filterDefaults = {
    q: "",
    status: "all",
    category: "all",
    hot: "all",
    issue: "all",
    sort: "updated"
  };
  const logoUrlLooksValid = !draft.logo.trim() || looksLikeHttpUrl(draft.logo);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const [loadedProducts, loadedCategories] = await Promise.all([
        api.getProducts(true),
        api.getCategories(true)
      ]);

      setItems(loadedProducts);
      setCategories(loadedCategories);
      setSelectedIds((current) =>
        current.filter((id) => loadedProducts.some((item) => item.id === id))
      );
      setActionError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActionError(null);
  }, [bulkAction, selectedIds]);

  useEffect(() => {
    setSaveError("");
  }, [draft]);

  const visibleItems = [...items]
    .filter((item) => {
      const categoryName =
        categories.find((category) => category.id === item.categoryId)?.name ?? "";
      const issues = getProductIssues(item);

      if (status === "active" && !item.isActive) {
        return false;
      }

      if (status === "inactive" && item.isActive) {
        return false;
      }

      if (categoryFilter !== "all" && item.categoryId !== categoryFilter) {
        return false;
      }

      if (hotFilter === "hot" && !item.isHot) {
        return false;
      }

      if (hotFilter === "normal" && item.isHot) {
        return false;
      }

      if (issueFilter === "pricing" && !issues.length) {
        return false;
      }

      return textIncludes(
        [
          item.name,
          item.summary,
          categoryName,
          ...item.details,
          ...item.pricingOptions.map((option) => option.label)
        ],
        query
      );
    })
    .sort((left, right) => {
      if (sort === "name") {
        return left.name.localeCompare(right.name);
      }

      if (sort === "price-asc") {
        return (getLowestDisplayedPlan(left)?.price ?? 0) - (getLowestDisplayedPlan(right)?.price ?? 0);
      }

      if (sort === "price-desc") {
        return (getLowestDisplayedPlan(right)?.price ?? 0) - (getLowestDisplayedPlan(left)?.price ?? 0);
      }

      if (sort === "popular") {
        return Number(right.isHot) - Number(left.isHot) || left.sortOrder - right.sortOrder;
      }

      return getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);
    });

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const activeFilterItems = [
    query
      ? {
          key: "q",
          label: "Пошук",
          value: query,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { q: "" }, filterDefaults)
        }
      : null,
    status !== "all"
      ? {
          key: "status",
          label: "Статус",
          value: status === "active" ? "Активні" : "Неактивні",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { status: "all" }, filterDefaults)
        }
      : null,
    categoryFilter !== "all"
      ? {
          key: "category",
          label: "Категорія",
          value:
            categories.find((category) => category.id === categoryFilter)?.name ?? "Обрана категорія",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { category: "all" }, filterDefaults)
        }
      : null,
    hotFilter !== "all"
      ? {
          key: "hot",
          label: "Хіт",
          value: hotFilter === "hot" ? "Тільки хіти" : "Без хітів",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { hot: "all" }, filterDefaults)
        }
      : null,
    issueFilter !== "all"
      ? {
          key: "issue",
          label: "Проблеми",
          value: "Тільки проблемні",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { issue: "all" }, filterDefaults)
        }
      : null,
    sort !== "updated"
      ? {
          key: "sort",
          label: "Сортування",
          value:
            {
              name: "За назвою",
              popular: "Спочатку хіти",
              "price-asc": "Дешевші",
              "price-desc": "Дорожчі"
            }[sort] ?? sort,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { sort: "updated" }, filterDefaults)
        }
      : null
  ].filter((item): item is ActiveFilterItem => Boolean(item));

  const resetForm = (force = false) => {
    if (!force && !confirmIfDirty()) {
      return;
    }

    const nextDraft = createEmptyProductDraft(categories[0]?.id ?? "");
    setEditingId(null);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const openEditor = (product?: Product) => {
    if (!confirmIfDirty()) {
      return;
    }

    if (!product) {
      resetForm(true);
      return;
    }

    const nextDraft = buildProductDraft(product);
    setEditingId(product.id);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const saveCurrentProduct = useCallback(async () => {
    if (draft.logo.trim() && !logoUrlLooksValid) {
      pushToast("Логотип повинен мати коректний URL з http:// або https://.", "error");
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const payload: Partial<Product> = {
        ...draft,
        details: draft.details.map((item) => item.trim()).filter(Boolean),
        pricingOptions: draft.pricingOptions
          .filter((option) => option.label.trim())
          .map((option) => ({
            ...option,
            compareAt: option.compareAt && option.compareAt > 0 ? option.compareAt : null
          }))
          .sort((left, right) => left.sortOrder - right.sortOrder)
      };

      if (editingId) {
        await api.updateProduct(editingId, payload);
        pushToast("Товар оновлено.", "success");
      } else {
        await api.createProduct(payload);
        pushToast("Товар створено.", "success");
      }

      resetForm(true);
      await load();
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточні правки залишилися у формі, можна повторити збереження.`;
      setSaveError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, load, logoUrlLooksValid, pushToast]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveCurrentProduct();
  };

  const executeDeleteProduct = useCallback(
    async (id: string) => {
      await api.deleteProduct(id);
      pushToast("Товар видалено.", "success");
      setActionError(null);
      if (editingId === id) {
        resetForm(true);
      }
      await load();
    },
    [editingId, load, pushToast]
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm("Видалити товар?")) {
      return;
    }

    try {
      await executeDeleteProduct(id);
    } catch (error) {
      const message = `${getErrorMessage(error)} Товар не видалено, можна повторити дію.`;
      setActionError({
        title: "Не вдалося видалити товар",
        description: message,
        retry: { type: "delete", id }
      });
      pushToast(message, "error");
    }
  };

  const executeProductBulk = useCallback(
    async (ids: string[], action: string) => {
      await api.bulkProducts({ ids, action });
      pushToast("Bulk-дію для товарів виконано.", "success");
      setSelectedIds([]);
      setBulkAction("");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const executeProductQuickUpdate = useCallback(
    async (id: string, patch: Partial<Product>, successText: string) => {
      await api.updateProduct(id, patch);
      pushToast(successText, "success");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkAction) {
      return;
    }

    if (bulkAction === "delete" && !window.confirm("Видалити всі виділені товари?")) {
      return;
    }

    try {
      await executeProductBulk(selectedIds, bulkAction);
    } catch (error) {
      const message = `${getErrorMessage(error)} Виділення збережено, можна повторити bulk-дію.`;
      setActionError({
        title: "Не вдалося виконати bulk-дію",
        description: message,
        retry: { type: "bulk", ids: [...selectedIds], action: bulkAction }
      });
      pushToast(message, "error");
    }
  };

  const updateProductQuick = async (item: Product, patch: Partial<Product>, successText: string) => {
    try {
      await executeProductQuickUpdate(item.id, patch, successText);
    } catch (error) {
      const message = `${getErrorMessage(error)} Можна повторити дію для цього товару.`;
      setActionError({
        title: "Не вдалося оновити товар",
        description: message,
        retry: { type: "quick", id: item.id, patch, successText }
      });
      pushToast(message, "error");
    }
  };

  const retryFailedProductAction = async () => {
    if (!actionError) {
      return;
    }

    try {
      if (actionError.retry.type === "bulk") {
        await executeProductBulk(actionError.retry.ids, actionError.retry.action);
        return;
      }

      if (actionError.retry.type === "delete") {
        await executeDeleteProduct(actionError.retry.id);
        return;
      }

      await executeProductQuickUpdate(
        actionError.retry.id,
        actionError.retry.patch,
        actionError.retry.successText
      );
    } catch (error) {
      const message = `${getErrorMessage(error)} Повторна спроба теж не вдалася.`;
      setActionError((current) =>
        current
          ? {
              ...current,
              description: message
            }
          : current
      );
      pushToast(message, "error");
    }
  };

  const updateDetails = (next: string[]) => {
    setDraft((current) => ({
      ...current,
      details: next.length ? next : [""]
    }));
  };

  return (
    <>
      <SectionHeader
        title="Товари"
        description="Пошук, фільтри, bulk-операції і повний редактор тарифів для каталогу."
      />

      <SplitViewNav createLabel="Новий товар" onCreate={() => openEditor()} />

      <div className="admin-two-column products-admin-layout">
        <AdminCard
          id="editor-panel"
          title={editingId ? "Редагування товару" : "Новий товар"}
          className="sticky-card"
        >
          <form className="admin-form" onSubmit={handleSubmit}>
            <EditorToolbar
              dirty={dirty}
              saving={saving}
              isEditing={Boolean(editingId)}
              createLabel="Створити"
              updateLabel="Оновити"
              onReset={() => resetForm()}
              shortcutHref="#list-panel"
              shortcutLabel="До списку"
            />
            {!saveError ? null : (
              <NoticePanel
                title="Не вдалося зберегти товар"
                description={saveError}
                tone="danger"
                action={
                  <button
                    className="ghost-button compact"
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrentProduct()}
                  >
                    Повторити збереження
                  </button>
                }
              />
            )}
            <label>
              Назва
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Slug
              <input
                value={draft.slug}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, slug: event.target.value }))
                }
              />
            </label>
            <label>
              Категорія
              <select
                value={draft.categoryId}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, categoryId: event.target.value }))
                }
              >
                <option value="">Оберіть категорію</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Короткий опис
              <textarea
                value={draft.summary}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            <label>
              Логотип URL
              <input
                className={!logoUrlLooksValid ? "is-invalid" : ""}
                value={draft.logo}
                placeholder="https://..."
                onChange={(event) =>
                  setDraft((current) => ({ ...current, logo: event.target.value }))
                }
              />
              {!logoUrlLooksValid ? (
                <span className="field-error">Вкажи коректний URL з `http://` або `https://`.</span>
              ) : null}
            </label>

            <div className="logo-preview-card">
              {draft.logo.trim() && logoUrlLooksValid ? (
                <ProductLogo src={draft.logo} alt={draft.name || "Preview"} fallback="Preview" />
              ) : (
                <div
                  className="product-logo product-logo-ghost"
                  role="img"
                  aria-label="Попередній перегляд логотипа"
                >
                  <span
                    className="product-fallback product-fallback-glyph"
                    style={{ display: "grid" }}
                    aria-hidden="true"
                  >
                    P
                  </span>
                </div>
              )}
              <div className="logo-preview-meta">
                <strong>Preview логотипа</strong>
                <span>Адмін бачить одразу, чи URL виглядає коректно.</span>
              </div>
            </div>

            <div className="form-subsection">
              <strong>Пункти опису</strong>
              {draft.details.map((detail, index) => (
                <div className="inline-field-row" key={`${index}-${detail}`}>
                  <input
                    value={detail}
                    placeholder="Окрема перевага або деталь"
                    onChange={(event) =>
                      updateDetails(
                        draft.details.map((item, currentIndex) =>
                          currentIndex === index ? event.target.value : item
                        )
                      )
                    }
                  />
                  <button
                    className="ghost-button compact"
                    type="button"
                    onClick={() =>
                      updateDetails(
                        draft.details.filter((_, currentIndex) => currentIndex !== index)
                      )
                    }
                  >
                    Видалити
                  </button>
                </div>
              ))}
              <button
                className="ghost-button compact"
                type="button"
                onClick={() => updateDetails([...draft.details, ""])}
              >
                Додати пункт
              </button>
            </div>

            <div className="form-subsection">
              <strong>Тарифи</strong>
              <PricingOptionsEditor
                options={draft.pricingOptions}
                onChange={(pricingOptions) =>
                  setDraft((current) => ({ ...current, pricingOptions }))
                }
              />
            </div>

            <label>
              Загальний порядок
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value)
                  }))
                }
              />
            </label>

            <div className="checkbox-grid">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.isHot}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isHot: event.target.checked }))
                  }
                />
                Хіт
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isActive: event.target.checked }))
                  }
                />
                Активний
              </label>
            </div>

            <div className="admin-form-actions">
              <button className="primary-button compact" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingId ? "Оновити" : "Створити"}
              </button>
              <button className="ghost-button compact" type="button" onClick={() => resetForm()}>
                Скинути
              </button>
            </div>
          </form>
        </AdminCard>

        <AdminCard
          id="list-panel"
          title="Каталог товарів"
          extra={<span className="list-count">{visibleItems.length} записів</span>}
        >
          {!loadError || !items.length ? null : (
            <NoticePanel
              title="Не вдалося оновити список товарів"
              description={`${loadError} Показуємо останній доступний стан каталогу.`}
              tone="warning"
              action={
                <button className="ghost-button compact" type="button" onClick={() => void load()}>
                  Повторити запит
                </button>
              }
            />
          )}

          {!actionError ? null : (
            <NoticePanel
              title={actionError.title}
              description={actionError.description}
              tone="danger"
              action={
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => void retryFailedProductAction()}
                >
                  Повторити дію
                </button>
              }
            />
          )}

          <div className="admin-toolbar toolbar-grid-wide">
            <label className="toolbar-field toolbar-field-grow">
              <span>Пошук</span>
              <input
                placeholder="Назва, опис, тариф..."
                value={query}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { q: event.target.value },
                    filterDefaults
                  )
                }
              />
            </label>
            <label className="toolbar-field">
              <span>Статус</span>
              <select
                value={status}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { status: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="active">Активні</option>
                <option value="inactive">Неактивні</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Категорія</span>
              <select
                value={categoryFilter}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { category: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar-field">
              <span>Хіт</span>
              <select
                value={hotFilter}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { hot: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="hot">Тільки хіти</option>
                <option value="normal">Без хітів</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Проблеми</span>
              <select
                value={issueFilter}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { issue: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="pricing">Тільки проблемні</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Сортування</span>
              <select
                value={sort}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { sort: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="updated">Останні зміни</option>
                <option value="name">За назвою</option>
                <option value="popular">Спочатку хіти</option>
                <option value="price-asc">Дешевші</option>
                <option value="price-desc">Дорожчі</option>
              </select>
            </label>
            <button
              className="ghost-button compact"
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Скинути
            </button>
          </div>

          <ActiveFiltersBar
            items={activeFilterItems}
            onReset={() => setSearchParams({}, { replace: true })}
          />

          <div className="selection-toolbar">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? Array.from(new Set([...current, ...visibleIds]))
                      : current.filter((id) => !visibleIds.includes(id))
                  )
                }
              />
              Виділити всі видимі
            </label>
            <span className="dashboard-muted">
              Відображено {visibleItems.length} з {items.length}
            </span>
          </div>

          <BulkActionBar
            selectedCount={selectedIds.length}
            value={bulkAction}
            options={productBulkOptions}
            onValueChange={setBulkAction}
            onApply={() => void applyBulkAction()}
            onClear={() => {
              setSelectedIds([]);
              setBulkAction("");
            }}
          />

          {loading ? (
            <InlineLoader />
          ) : loadError && !items.length ? (
            <EmptyState
              title="Не вдалося завантажити товари"
              description={loadError}
              action={
                <button className="primary-button compact" type="button" onClick={() => void load()}>
                  Спробувати ще раз
                </button>
              }
            />
          ) : !visibleItems.length ? (
            <EmptyState
              title="Товарів не знайдено"
              description="Зміни фільтри або створи новий товар."
            />
          ) : (
            <div className="admin-list-stack">
              {visibleItems.map((item) => {
                const category =
                  categories.find((current) => current.id === item.categoryId)?.name ?? "Без категорії";
                const issues = getProductIssues(item);
                const lowestPlan = getLowestDisplayedPlan(item);

                return (
                  <article
                    className={`admin-list-item ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                    key={item.id}
                  >
                    <div className="admin-selection-cell">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(item.id)}
                        onChange={() =>
                          setSelectedIds((current) => updateSelection(current, item.id))
                        }
                        aria-label={`Виділити ${item.name}`}
                      />
                    </div>
                    <div className="admin-list-body">
                      <div className="admin-list-head">
                        <div className="admin-entity">
                          <ProductLogo src={item.logo} alt={item.name} fallback={item.name} />
                          <div className="admin-entity-copy">
                            <strong>{item.name}</strong>
                            <p>{item.summary}</p>
                            <small>{category}</small>
                          </div>
                        </div>
                        <div className="admin-table-actions">
                          <button
                            className="ghost-button compact"
                            type="button"
                            onClick={() => openEditor(item)}
                          >
                            Редагувати
                          </button>
                          <button
                            className="danger-button compact"
                            type="button"
                            onClick={() => void handleDelete(item.id)}
                          >
                            Видалити
                          </button>
                        </div>
                      </div>

                      <div className="item-tags">
                        <StatusBadge tone={item.isActive ? "success" : "muted"}>
                          {item.isActive ? "Активний" : "Вимкнений"}
                        </StatusBadge>
                        {item.isHot ? <StatusBadge tone="warning">Хіт</StatusBadge> : null}
                        <StatusBadge tone="muted">Порядок: {item.sortOrder}</StatusBadge>
                        <StatusBadge tone="accent">
                          {lowestPlan ? formatPrice(lowestPlan) : "Без тарифів"}
                        </StatusBadge>
                      </div>

                      {!issues.length ? null : (
                        <div className="issue-row">
                          {issues.map((issue) => (
                            <span className="issue-chip" key={issue}>
                              {issue}
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="list-meta-row">
                        <span>{item.pricingOptions.length} тарифів</span>
                        <span>Оновлено: {formatDateTime(item.updatedAt)}</span>
                      </div>

                      <div className="inline-action-row">
                        <button
                          className={`ghost-button compact ${item.isActive ? "is-current" : ""}`}
                          type="button"
                          onClick={() =>
                            void updateProductQuick(
                              item,
                              { isActive: !item.isActive },
                              item.isActive ? "Товар вимкнено." : "Товар активовано."
                            )
                          }
                        >
                          {item.isActive ? "Вимкнути" : "Активувати"}
                        </button>
                        <button
                          className={`ghost-button compact ${item.isHot ? "is-current" : ""}`}
                          type="button"
                          onClick={() =>
                            void updateProductQuick(
                              item,
                              { isHot: !item.isHot },
                              item.isHot ? "Товар знято з хітів." : "Товар позначено хітом."
                            )
                          }
                        >
                          {item.isHot ? "Зняти хіт" : "Позначити хітом"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </AdminCard>
      </div>
    </>
  );
}

export function AdminFaqsPage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<FaqItem[]>([]);
  const [draft, setDraft] = useState<FaqDraft>(createEmptyFaqDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState<{
    title: string;
    description: string;
    retry:
      | { type: "bulk"; ids: string[]; action: string }
      | { type: "quick"; id: string; patch: Partial<FaqItem>; successText: string }
      | { type: "delete"; id: string };
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [baseline, setBaseline] = useState(JSON.stringify(createEmptyFaqDraft()));
  const dirty = JSON.stringify(draft) !== baseline;
  const confirmIfDirty = useUnsavedChangesGuard(dirty);

  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "updated";
  const filterDefaults = { q: "", status: "all", sort: "updated" };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await api.getFaqs(true);
      setItems(loaded);
      setSelectedIds((current) => current.filter((id) => loaded.some((item) => item.id === id)));
      setActionError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActionError(null);
  }, [bulkAction, selectedIds]);

  useEffect(() => {
    setSaveError("");
  }, [draft]);

  const visibleItems = [...items]
    .filter((item) => {
      if (status === "active" && !item.isActive) {
        return false;
      }

      if (status === "inactive" && item.isActive) {
        return false;
      }

      return textIncludes([item.question, item.answer], query);
    })
    .sort((left, right) => {
      if (sort === "question") {
        return left.question.localeCompare(right.question);
      }

      if (sort === "order") {
        return left.sortOrder - right.sortOrder;
      }

      return getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);
    });

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const activeFilterItems = [
    query
      ? {
          key: "q",
          label: "Пошук",
          value: query,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { q: "" }, filterDefaults)
        }
      : null,
    status !== "all"
      ? {
          key: "status",
          label: "Статус",
          value: status === "active" ? "Активні" : "Неактивні",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { status: "all" }, filterDefaults)
        }
      : null,
    sort !== "updated"
      ? {
          key: "sort",
          label: "Сортування",
          value: sort === "order" ? "За порядком" : "За питанням",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { sort: "updated" }, filterDefaults)
        }
      : null
  ].filter((item): item is ActiveFilterItem => Boolean(item));

  const resetForm = (force = false) => {
    if (!force && !confirmIfDirty()) {
      return;
    }

    const nextDraft = createEmptyFaqDraft();
    setEditingId(null);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const openEditor = (item?: FaqItem) => {
    if (!confirmIfDirty()) {
      return;
    }

    if (!item) {
      resetForm(true);
      return;
    }

    const nextDraft: FaqDraft = {
      question: item.question,
      answer: item.answer,
      sortOrder: item.sortOrder,
      isActive: item.isActive
    };

    setEditingId(item.id);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const saveCurrentFaq = useCallback(async () => {
    setSaving(true);
    setSaveError("");

    try {
      if (editingId) {
        await api.updateFaq(editingId, draft);
        pushToast("FAQ оновлено.", "success");
      } else {
        await api.createFaq(draft);
        pushToast("FAQ створено.", "success");
      }

      resetForm(true);
      await load();
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточні правки залишилися у формі, можна повторити збереження.`;
      setSaveError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, load, pushToast]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveCurrentFaq();
  };

  const executeDeleteFaq = useCallback(
    async (id: string) => {
      await api.deleteFaq(id);
      pushToast("FAQ видалено.", "success");
      setActionError(null);
      if (editingId === id) {
        resetForm(true);
      }
      await load();
    },
    [editingId, load, pushToast]
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm("Видалити FAQ?")) {
      return;
    }

    try {
      await executeDeleteFaq(id);
    } catch (error) {
      const message = `${getErrorMessage(error)} FAQ не видалено, можна повторити дію.`;
      setActionError({
        title: "Не вдалося видалити FAQ",
        description: message,
        retry: { type: "delete", id }
      });
      pushToast(message, "error");
    }
  };

  const executeFaqQuickUpdate = useCallback(
    async (id: string, patch: Partial<FaqItem>, successText: string) => {
      await api.updateFaq(id, patch);
      pushToast(successText, "success");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const updateFaqQuick = async (item: FaqItem, patch: Partial<FaqItem>, successText: string) => {
    try {
      await executeFaqQuickUpdate(item.id, patch, successText);
    } catch (error) {
      const message = `${getErrorMessage(error)} Можна повторити дію для цього FAQ.`;
      setActionError({
        title: "Не вдалося оновити FAQ",
        description: message,
        retry: { type: "quick", id: item.id, patch, successText }
      });
      pushToast(message, "error");
    }
  };

  const executeFaqBulk = useCallback(
    async (ids: string[], action: string) => {
      await api.bulkFaqs({ ids, action });
      pushToast("Bulk-дію для FAQ виконано.", "success");
      setSelectedIds([]);
      setBulkAction("");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkAction) {
      return;
    }

    if (bulkAction === "delete" && !window.confirm("Видалити всі виділені FAQ?")) {
      return;
    }

    try {
      await executeFaqBulk(selectedIds, bulkAction);
    } catch (error) {
      const message = `${getErrorMessage(error)} Виділення збережено, можна повторити bulk-дію.`;
      setActionError({
        title: "Не вдалося виконати bulk-дію для FAQ",
        description: message,
        retry: { type: "bulk", ids: [...selectedIds], action: bulkAction }
      });
      pushToast(message, "error");
    }
  };

  const retryFailedFaqAction = async () => {
    if (!actionError) {
      return;
    }

    try {
      if (actionError.retry.type === "bulk") {
        await executeFaqBulk(actionError.retry.ids, actionError.retry.action);
        return;
      }

      if (actionError.retry.type === "delete") {
        await executeDeleteFaq(actionError.retry.id);
        return;
      }

      await executeFaqQuickUpdate(
        actionError.retry.id,
        actionError.retry.patch,
        actionError.retry.successText
      );
    } catch (error) {
      const message = `${getErrorMessage(error)} Повторна спроба теж не вдалася.`;
      setActionError((current) =>
        current
          ? {
              ...current,
              description: message
            }
          : current
      );
      pushToast(message, "error");
    }
  };

  return (
    <>
      <SectionHeader
        title="FAQ"
        description="Швидке редагування, сортування і масове увімкнення/вимкнення FAQ."
      />

      <SplitViewNav createLabel="Новий FAQ" onCreate={() => openEditor()} />

      <div className="admin-two-column">
        <AdminCard id="editor-panel" title={editingId ? "Редагування FAQ" : "Новий FAQ"}>
          <form className="admin-form" onSubmit={handleSubmit}>
            <EditorToolbar
              dirty={dirty}
              saving={saving}
              isEditing={Boolean(editingId)}
              createLabel="Створити"
              updateLabel="Оновити"
              onReset={() => resetForm()}
              shortcutHref="#list-panel"
              shortcutLabel="До списку"
            />
            {!saveError ? null : (
              <NoticePanel
                title="Не вдалося зберегти FAQ"
                description={saveError}
                tone="danger"
                action={
                  <button
                    className="ghost-button compact"
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrentFaq()}
                  >
                    Повторити збереження
                  </button>
                }
              />
            )}
            <div className="settings-preview-card editor-preview-card">
              <div className="item-tags">
                <StatusBadge tone={draft.isActive ? "success" : "muted"}>
                  {draft.isActive ? "Активний" : "Вимкнений"}
                </StatusBadge>
                <StatusBadge tone="muted">Порядок: {draft.sortOrder}</StatusBadge>
              </div>
              <strong>{draft.question || "Питання для прев'ю"}</strong>
              <p>{draft.answer || "Тут буде короткий preview відповіді для швидкої перевірки перед збереженням."}</p>
            </div>
            <label>
              Питання
              <input
                value={draft.question}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, question: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Відповідь
              <textarea
                value={draft.answer}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, answer: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Активний
            </label>
            <div className="admin-form-actions">
              <button className="primary-button compact" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingId ? "Оновити" : "Створити"}
              </button>
              <button className="ghost-button compact" type="button" onClick={() => resetForm()}>
                Скинути
              </button>
            </div>
          </form>
        </AdminCard>

        <AdminCard
          id="list-panel"
          title="Список FAQ"
          extra={<span className="list-count">{visibleItems.length} записів</span>}
        >
          {!loadError || !items.length ? null : (
            <NoticePanel
              title="Не вдалося оновити список FAQ"
              description={`${loadError} Показуємо останній доступний стан списку.`}
              tone="warning"
              action={
                <button className="ghost-button compact" type="button" onClick={() => void load()}>
                  Повторити запит
                </button>
              }
            />
          )}

          {!actionError ? null : (
            <NoticePanel
              title={actionError.title}
              description={actionError.description}
              tone="danger"
              action={
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => void retryFailedFaqAction()}
                >
                  Повторити дію
                </button>
              }
            />
          )}

          <div className="admin-toolbar toolbar-grid">
            <label className="toolbar-field toolbar-field-grow">
              <span>Пошук</span>
              <input
                placeholder="Питання або відповідь"
                value={query}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { q: event.target.value },
                    filterDefaults
                  )
                }
              />
            </label>
            <label className="toolbar-field">
              <span>Статус</span>
              <select
                value={status}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { status: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="active">Активні</option>
                <option value="inactive">Неактивні</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Сортування</span>
              <select
                value={sort}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { sort: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="updated">Останні зміни</option>
                <option value="order">За порядком</option>
                <option value="question">За питанням</option>
              </select>
            </label>
            <button
              className="ghost-button compact"
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Скинути
            </button>
          </div>

          <ActiveFiltersBar
            items={activeFilterItems}
            onReset={() => setSearchParams({}, { replace: true })}
          />

          <div className="selection-toolbar">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? Array.from(new Set([...current, ...visibleIds]))
                      : current.filter((id) => !visibleIds.includes(id))
                  )
                }
              />
              Виділити всі видимі
            </label>
          </div>

          <BulkActionBar
            selectedCount={selectedIds.length}
            value={bulkAction}
            options={faqBulkOptions}
            onValueChange={setBulkAction}
            onApply={() => void applyBulkAction()}
            onClear={() => {
              setSelectedIds([]);
              setBulkAction("");
            }}
          />

          {loading ? (
            <InlineLoader />
          ) : loadError && !items.length ? (
            <EmptyState
              title="Не вдалося завантажити FAQ"
              description={loadError}
              action={
                <button className="primary-button compact" type="button" onClick={() => void load()}>
                  Спробувати ще раз
                </button>
              }
            />
          ) : !visibleItems.length ? (
            <EmptyState
              title="FAQ не знайдено"
              description="Спробуй змінити фільтри або створи новий запис."
            />
          ) : (
            <div className="admin-list-stack">
              {visibleItems.map((item) => (
                <article
                  className={`admin-list-item ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="admin-selection-cell">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() =>
                        setSelectedIds((current) => updateSelection(current, item.id))
                      }
                      aria-label={`Виділити ${item.question}`}
                    />
                  </div>
                  <div className="admin-list-body">
                    <div className="admin-list-head">
                      <div>
                        <div className="item-tags">
                          <StatusBadge tone={item.isActive ? "success" : "muted"}>
                            {item.isActive ? "Активний" : "Вимкнений"}
                          </StatusBadge>
                          <StatusBadge tone="muted">Порядок: {item.sortOrder}</StatusBadge>
                        </div>
                        <strong>{item.question}</strong>
                        <p>{item.answer}</p>
                        <small>Оновлено: {formatDateTime(item.updatedAt)}</small>
                        <div className="inline-action-row">
                          <button
                            className={`ghost-button compact ${item.isActive ? "is-current" : ""}`}
                            type="button"
                            onClick={() =>
                              void updateFaqQuick(
                                item,
                                { isActive: !item.isActive },
                                item.isActive ? "FAQ вимкнено." : "FAQ активовано."
                              )
                            }
                          >
                            {item.isActive ? "Вимкнути" : "Активувати"}
                          </button>
                        </div>
                      </div>
                      <div className="admin-table-actions">
                        <button
                          className="ghost-button compact"
                          type="button"
                          onClick={() => openEditor(item)}
                        >
                          Редагувати
                        </button>
                        <button
                          className="danger-button compact"
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                        >
                          Видалити
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </>
  );
}

export function AdminNewsPage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<NewsItem[]>([]);
  const [draft, setDraft] = useState<NewsDraft>(createEmptyNewsDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState<{
    title: string;
    description: string;
    retry:
      | { type: "bulk"; ids: string[]; action: string }
      | { type: "quick"; id: string; patch: Partial<NewsItem>; successText: string }
      | { type: "delete"; id: string };
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [baseline, setBaseline] = useState(JSON.stringify(createEmptyNewsDraft()));
  const dirty = JSON.stringify(draft) !== baseline;
  const confirmIfDirty = useUnsavedChangesGuard(dirty);

  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "updated";
  const filterDefaults = { q: "", status: "all", sort: "updated" };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await api.getNews(true);
      setItems(loaded);
      setSelectedIds((current) => current.filter((id) => loaded.some((item) => item.id === id)));
      setActionError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActionError(null);
  }, [bulkAction, selectedIds]);

  useEffect(() => {
    setSaveError("");
  }, [draft]);

  const visibleItems = [...items]
    .filter((item) => {
      if (status === "active" && !item.isActive) {
        return false;
      }

      if (status === "inactive" && item.isActive) {
        return false;
      }

      return textIncludes([item.title, item.content, item.dateLabel], query);
    })
    .sort((left, right) => {
      if (sort === "title") {
        return left.title.localeCompare(right.title);
      }

      if (sort === "date") {
        return left.dateLabel.localeCompare(right.dateLabel);
      }

      if (sort === "order") {
        return left.sortOrder - right.sortOrder;
      }

      return getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);
    });

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const activeFilterItems = [
    query
      ? {
          key: "q",
          label: "Пошук",
          value: query,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { q: "" }, filterDefaults)
        }
      : null,
    status !== "all"
      ? {
          key: "status",
          label: "Статус",
          value: status === "active" ? "Активні" : "Неактивні",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { status: "all" }, filterDefaults)
        }
      : null,
    sort !== "updated"
      ? {
          key: "sort",
          label: "Сортування",
          value:
            {
              order: "За порядком",
              title: "За заголовком",
              date: "За dateLabel"
            }[sort] ?? sort,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { sort: "updated" }, filterDefaults)
        }
      : null
  ].filter((item): item is ActiveFilterItem => Boolean(item));

  const resetForm = (force = false) => {
    if (!force && !confirmIfDirty()) {
      return;
    }

    const nextDraft = createEmptyNewsDraft();
    setEditingId(null);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const openEditor = (item?: NewsItem) => {
    if (!confirmIfDirty()) {
      return;
    }

    if (!item) {
      resetForm(true);
      return;
    }

    const nextDraft: NewsDraft = {
      title: item.title,
      dateLabel: item.dateLabel,
      content: item.content,
      sortOrder: item.sortOrder,
      isActive: item.isActive
    };

    setEditingId(item.id);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const saveCurrentNews = useCallback(async () => {
    setSaving(true);
    setSaveError("");

    try {
      if (editingId) {
        await api.updateNews(editingId, draft);
        pushToast("Новину оновлено.", "success");
      } else {
        await api.createNews(draft);
        pushToast("Новину створено.", "success");
      }

      resetForm(true);
      await load();
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточні правки залишилися у формі, можна повторити збереження.`;
      setSaveError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, load, pushToast]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveCurrentNews();
  };

  const executeDeleteNews = useCallback(
    async (id: string) => {
      await api.deleteNews(id);
      pushToast("Новину видалено.", "success");
      setActionError(null);
      if (editingId === id) {
        resetForm(true);
      }
      await load();
    },
    [editingId, load, pushToast]
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm("Видалити новину?")) {
      return;
    }

    try {
      await executeDeleteNews(id);
    } catch (error) {
      const message = `${getErrorMessage(error)} Новину не видалено, можна повторити дію.`;
      setActionError({
        title: "Не вдалося видалити новину",
        description: message,
        retry: { type: "delete", id }
      });
      pushToast(message, "error");
    }
  };

  const executeNewsQuickUpdate = useCallback(
    async (id: string, patch: Partial<NewsItem>, successText: string) => {
      await api.updateNews(id, patch);
      pushToast(successText, "success");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const updateNewsQuick = async (item: NewsItem, patch: Partial<NewsItem>, successText: string) => {
    try {
      await executeNewsQuickUpdate(item.id, patch, successText);
    } catch (error) {
      const message = `${getErrorMessage(error)} Можна повторити дію для цієї новини.`;
      setActionError({
        title: "Не вдалося оновити новину",
        description: message,
        retry: { type: "quick", id: item.id, patch, successText }
      });
      pushToast(message, "error");
    }
  };

  const executeNewsBulk = useCallback(
    async (ids: string[], action: string) => {
      await api.bulkNews({ ids, action });
      pushToast("Bulk-дію для новин виконано.", "success");
      setSelectedIds([]);
      setBulkAction("");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkAction) {
      return;
    }

    if (bulkAction === "delete" && !window.confirm("Видалити всі виділені новини?")) {
      return;
    }

    try {
      await executeNewsBulk(selectedIds, bulkAction);
    } catch (error) {
      const message = `${getErrorMessage(error)} Виділення збережено, можна повторити bulk-дію.`;
      setActionError({
        title: "Не вдалося виконати bulk-дію для новин",
        description: message,
        retry: { type: "bulk", ids: [...selectedIds], action: bulkAction }
      });
      pushToast(message, "error");
    }
  };

  const retryFailedNewsAction = async () => {
    if (!actionError) {
      return;
    }

    try {
      if (actionError.retry.type === "bulk") {
        await executeNewsBulk(actionError.retry.ids, actionError.retry.action);
        return;
      }

      if (actionError.retry.type === "delete") {
        await executeDeleteNews(actionError.retry.id);
        return;
      }

      await executeNewsQuickUpdate(
        actionError.retry.id,
        actionError.retry.patch,
        actionError.retry.successText
      );
    } catch (error) {
      const message = `${getErrorMessage(error)} Повторна спроба теж не вдалася.`;
      setActionError((current) =>
        current
          ? {
              ...current,
              description: message
            }
          : current
      );
      pushToast(message, "error");
    }
  };

  return (
    <>
      <SectionHeader
        title="Новини"
        description="Редагуй стрічку новин, порядок показу і активність записів."
      />

      <SplitViewNav createLabel="Нова новина" onCreate={() => openEditor()} />

      <div className="admin-two-column">
        <AdminCard id="editor-panel" title={editingId ? "Редагування новини" : "Нова новина"}>
          <form className="admin-form" onSubmit={handleSubmit}>
            <EditorToolbar
              dirty={dirty}
              saving={saving}
              isEditing={Boolean(editingId)}
              createLabel="Створити"
              updateLabel="Оновити"
              onReset={() => resetForm()}
              shortcutHref="#list-panel"
              shortcutLabel="До списку"
            />
            {!saveError ? null : (
              <NoticePanel
                title="Не вдалося зберегти новину"
                description={saveError}
                tone="danger"
                action={
                  <button
                    className="ghost-button compact"
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrentNews()}
                  >
                    Повторити збереження
                  </button>
                }
              />
            )}
            <div className="settings-preview-card editor-preview-card">
              <div className="item-tags">
                <StatusBadge tone={draft.isActive ? "success" : "muted"}>
                  {draft.isActive ? "Активна" : "Вимкнена"}
                </StatusBadge>
                <StatusBadge tone="muted">{draft.dateLabel || "Без дати"}</StatusBadge>
                <StatusBadge tone="muted">Порядок: {draft.sortOrder}</StatusBadge>
              </div>
              <strong>{draft.title || "Заголовок новини"}</strong>
              <p>{draft.content || "Короткий preview новини для перевірки ритму тексту перед збереженням."}</p>
            </div>
            <label>
              Заголовок
              <input
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Дата/позначка
              <input
                value={draft.dateLabel}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, dateLabel: event.target.value }))
                }
                placeholder="Наприклад, 27.04.2026"
              />
            </label>
            <label>
              Текст новини
              <textarea
                value={draft.content}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, content: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={draft.isActive}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, isActive: event.target.checked }))
                }
              />
              Активна
            </label>
            <div className="admin-form-actions">
              <button className="primary-button compact" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingId ? "Оновити" : "Створити"}
              </button>
              <button className="ghost-button compact" type="button" onClick={() => resetForm()}>
                Скинути
              </button>
            </div>
          </form>
        </AdminCard>

        <AdminCard
          id="list-panel"
          title="Стрічка новин"
          extra={<span className="list-count">{visibleItems.length} записів</span>}
        >
          {!loadError || !items.length ? null : (
            <NoticePanel
              title="Не вдалося оновити список новин"
              description={`${loadError} Показуємо останній доступний стан стрічки.`}
              tone="warning"
              action={
                <button className="ghost-button compact" type="button" onClick={() => void load()}>
                  Повторити запит
                </button>
              }
            />
          )}

          {!actionError ? null : (
            <NoticePanel
              title={actionError.title}
              description={actionError.description}
              tone="danger"
              action={
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => void retryFailedNewsAction()}
                >
                  Повторити дію
                </button>
              }
            />
          )}

          <div className="admin-toolbar toolbar-grid">
            <label className="toolbar-field toolbar-field-grow">
              <span>Пошук</span>
              <input
                placeholder="Заголовок або текст"
                value={query}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { q: event.target.value },
                    filterDefaults
                  )
                }
              />
            </label>
            <label className="toolbar-field">
              <span>Статус</span>
              <select
                value={status}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { status: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="active">Активні</option>
                <option value="inactive">Неактивні</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Сортування</span>
              <select
                value={sort}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { sort: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="updated">Останні зміни</option>
                <option value="order">За порядком</option>
                <option value="title">За заголовком</option>
                <option value="date">За dateLabel</option>
              </select>
            </label>
            <button
              className="ghost-button compact"
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Скинути
            </button>
          </div>

          <ActiveFiltersBar
            items={activeFilterItems}
            onReset={() => setSearchParams({}, { replace: true })}
          />

          <div className="selection-toolbar">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? Array.from(new Set([...current, ...visibleIds]))
                      : current.filter((id) => !visibleIds.includes(id))
                  )
                }
              />
              Виділити всі видимі
            </label>
          </div>

          <BulkActionBar
            selectedCount={selectedIds.length}
            value={bulkAction}
            options={newsBulkOptions}
            onValueChange={setBulkAction}
            onApply={() => void applyBulkAction()}
            onClear={() => {
              setSelectedIds([]);
              setBulkAction("");
            }}
          />

          {loading ? (
            <InlineLoader />
          ) : loadError && !items.length ? (
            <EmptyState
              title="Не вдалося завантажити новини"
              description={loadError}
              action={
                <button className="primary-button compact" type="button" onClick={() => void load()}>
                  Спробувати ще раз
                </button>
              }
            />
          ) : !visibleItems.length ? (
            <EmptyState
              title="Новини не знайдено"
              description="Зміни пошук або створи новий запис."
            />
          ) : (
            <div className="admin-list-stack">
              {visibleItems.map((item) => (
                <article
                  className={`admin-list-item ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="admin-selection-cell">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() =>
                        setSelectedIds((current) => updateSelection(current, item.id))
                      }
                      aria-label={`Виділити ${item.title}`}
                    />
                  </div>
                  <div className="admin-list-body">
                    <div className="admin-list-head">
                      <div>
                        <div className="item-tags">
                          <StatusBadge tone={item.isActive ? "success" : "muted"}>
                            {item.isActive ? "Активна" : "Вимкнена"}
                          </StatusBadge>
                          <StatusBadge tone="muted">{item.dateLabel || "Без дати"}</StatusBadge>
                          <StatusBadge tone="muted">Порядок: {item.sortOrder}</StatusBadge>
                        </div>
                        <strong>{item.title}</strong>
                        <p>{item.content}</p>
                        <small>Оновлено: {formatDateTime(item.updatedAt)}</small>
                        <div className="inline-action-row">
                          <button
                            className={`ghost-button compact ${item.isActive ? "is-current" : ""}`}
                            type="button"
                            onClick={() =>
                              void updateNewsQuick(
                                item,
                                { isActive: !item.isActive },
                                item.isActive ? "Новину вимкнено." : "Новину активовано."
                              )
                            }
                          >
                            {item.isActive ? "Вимкнути" : "Активувати"}
                          </button>
                        </div>
                      </div>
                      <div className="admin-table-actions">
                        <button
                          className="ghost-button compact"
                          type="button"
                          onClick={() => openEditor(item)}
                        >
                          Редагувати
                        </button>
                        <button
                          className="danger-button compact"
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                        >
                          Видалити
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </>
  );
}

export function AdminReviewsPage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Review[]>([]);
  const [draft, setDraft] = useState<ReviewDraft>(createEmptyReviewDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [actionError, setActionError] = useState<{
    title: string;
    description: string;
    retry:
      | { type: "bulk"; ids: string[]; action: string }
      | { type: "quick"; id: string; patch: Partial<Review>; successText: string }
      | { type: "delete"; id: string };
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");
  const [baseline, setBaseline] = useState(JSON.stringify(createEmptyReviewDraft()));
  const dirty = JSON.stringify(draft) !== baseline;
  const confirmIfDirty = useUnsavedChangesGuard(dirty);

  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "all";
  const moderation = searchParams.get("moderation") ?? "all";
  const rating = searchParams.get("rating") ?? "all";
  const sort = searchParams.get("sort") ?? "updated";
  const filterDefaults = {
    q: "",
    status: "all",
    moderation: "all",
    rating: "all",
    sort: "updated"
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await api.getReviews(true);
      setItems(loaded);
      setSelectedIds((current) => current.filter((id) => loaded.some((item) => item.id === id)));
      setActionError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActionError(null);
  }, [bulkAction, selectedIds]);

  useEffect(() => {
    setSaveError("");
  }, [draft]);

  const visibleItems = [...items]
    .filter((item) => {
      if (status === "active" && !item.isActive) {
        return false;
      }

      if (status === "inactive" && item.isActive) {
        return false;
      }

      if (moderation === "pending" && item.isModerated) {
        return false;
      }

      if (moderation === "approved" && !item.isModerated) {
        return false;
      }

      if (rating !== "all" && item.rating !== Number(rating)) {
        return false;
      }

      return textIncludes([item.name, item.content], query);
    })
    .sort((left, right) => {
      if (sort === "rating") {
        return right.rating - left.rating || getTimeValue(right.createdAt) - getTimeValue(left.createdAt);
      }

      if (sort === "name") {
        return left.name.localeCompare(right.name);
      }

      if (sort === "created") {
        return getTimeValue(right.createdAt) - getTimeValue(left.createdAt);
      }

      return getTimeValue(right.updatedAt) - getTimeValue(left.updatedAt);
    });

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const activeFilterItems = [
    query
      ? {
          key: "q",
          label: "Пошук",
          value: query,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { q: "" }, filterDefaults)
        }
      : null,
    status !== "all"
      ? {
          key: "status",
          label: "Статус",
          value: status === "active" ? "Активні" : "Неактивні",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { status: "all" }, filterDefaults)
        }
      : null,
    moderation !== "all"
      ? {
          key: "moderation",
          label: "Модерація",
          value: moderation === "pending" ? "Чекають модерації" : "Промодеровані",
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { moderation: "all" }, filterDefaults)
        }
      : null,
    rating !== "all"
      ? {
          key: "rating",
          label: "Рейтинг",
          value: `${rating} зірок`,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { rating: "all" }, filterDefaults)
        }
      : null,
    sort !== "updated"
      ? {
          key: "sort",
          label: "Сортування",
          value:
            {
              created: "Новіші",
              rating: "Вищий рейтинг",
              name: "За ім'ям"
            }[sort] ?? sort,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { sort: "updated" }, filterDefaults)
        }
      : null
  ].filter((item): item is ActiveFilterItem => Boolean(item));

  const resetForm = (force = false) => {
    if (!force && !confirmIfDirty()) {
      return;
    }

    const nextDraft = createEmptyReviewDraft();
    setEditingId(null);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const openEditor = (item?: Review) => {
    if (!confirmIfDirty()) {
      return;
    }

    if (!item) {
      resetForm(true);
      return;
    }

    const nextDraft: ReviewDraft = {
      name: item.name,
      rating: item.rating,
      content: item.content,
      sortOrder: item.sortOrder,
      isActive: item.isActive,
      isModerated: item.isModerated,
      createdAt: item.createdAt
    };

    setEditingId(item.id);
    setDraft(nextDraft);
    setSaveError("");
    setBaseline(JSON.stringify(nextDraft));
  };

  const saveCurrentReview = useCallback(async () => {
    setSaving(true);
    setSaveError("");

    try {
      const payload: Partial<Review> = {
        ...draft,
        createdAt: draft.createdAt || new Date().toISOString()
      };

      if (editingId) {
        await api.updateReview(editingId, payload);
        pushToast("Відгук оновлено.", "success");
      } else {
        await api.createReview(payload);
        pushToast("Відгук створено.", "success");
      }

      resetForm(true);
      await load();
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточні правки залишилися у формі, можна повторити збереження.`;
      setSaveError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, load, pushToast]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveCurrentReview();
  };

  const executeDeleteReview = useCallback(
    async (id: string) => {
      await api.deleteReview(id);
      pushToast("Відгук видалено.", "success");
      setActionError(null);
      if (editingId === id) {
        resetForm(true);
      }
      await load();
    },
    [editingId, load, pushToast]
  );

  const handleDelete = async (id: string) => {
    if (!window.confirm("Видалити відгук?")) {
      return;
    }

    try {
      await executeDeleteReview(id);
    } catch (error) {
      const message = `${getErrorMessage(error)} Відгук не видалено, можна повторити дію.`;
      setActionError({
        title: "Не вдалося видалити відгук",
        description: message,
        retry: { type: "delete", id }
      });
      pushToast(message, "error");
    }
  };

  const executeReviewBulk = useCallback(
    async (ids: string[], action: string) => {
      await api.bulkReviews({ ids, action });
      pushToast("Bulk-дію для відгуків виконано.", "success");
      setSelectedIds([]);
      setBulkAction("");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkAction) {
      return;
    }

    if (bulkAction === "delete" && !window.confirm("Видалити всі виділені відгуки?")) {
      return;
    }

    try {
      await executeReviewBulk(selectedIds, bulkAction);
    } catch (error) {
      const message = `${getErrorMessage(error)} Виділення збережено, можна повторити bulk-дію.`;
      setActionError({
        title: "Не вдалося виконати bulk-дію для відгуків",
        description: message,
        retry: { type: "bulk", ids: [...selectedIds], action: bulkAction }
      });
      pushToast(message, "error");
    }
  };

  const executeReviewQuickUpdate = useCallback(
    async (id: string, patch: Partial<Review>, successText: string) => {
      await api.updateReview(id, patch);
      pushToast(successText, "success");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const updateReviewQuick = async (item: Review, patch: Partial<Review>, successText: string) => {
    try {
      await executeReviewQuickUpdate(item.id, patch, successText);
    } catch (error) {
      const message = `${getErrorMessage(error)} Можна повторити дію для цього відгуку.`;
      setActionError({
        title: "Не вдалося оновити відгук",
        description: message,
        retry: { type: "quick", id: item.id, patch, successText }
      });
      pushToast(message, "error");
    }
  };

  const retryFailedReviewAction = async () => {
    if (!actionError) {
      return;
    }

    try {
      if (actionError.retry.type === "bulk") {
        await executeReviewBulk(actionError.retry.ids, actionError.retry.action);
        return;
      }

      if (actionError.retry.type === "delete") {
        await executeDeleteReview(actionError.retry.id);
        return;
      }

      await executeReviewQuickUpdate(
        actionError.retry.id,
        actionError.retry.patch,
        actionError.retry.successText
      );
    } catch (error) {
      const message = `${getErrorMessage(error)} Повторна спроба теж не вдалася.`;
      setActionError((current) =>
        current
          ? {
              ...current,
              description: message
            }
          : current
      );
      pushToast(message, "error");
    }
  };

  return (
    <>
      <SectionHeader
        title="Відгуки"
        description="Модерація, пошук, сортування і масові дії для публічних відгуків."
      />

      <SplitViewNav createLabel="Новий відгук" onCreate={() => openEditor()} />

      <div className="admin-two-column">
        <AdminCard id="editor-panel" title={editingId ? "Редагування відгуку" : "Новий відгук"}>
          <form className="admin-form" onSubmit={handleSubmit}>
            <EditorToolbar
              dirty={dirty}
              saving={saving}
              isEditing={Boolean(editingId)}
              createLabel="Створити"
              updateLabel="Оновити"
              onReset={() => resetForm()}
              shortcutHref="#list-panel"
              shortcutLabel="До списку"
            />
            {!saveError ? null : (
              <NoticePanel
                title="Не вдалося зберегти відгук"
                description={saveError}
                tone="danger"
                action={
                  <button
                    className="ghost-button compact"
                    type="button"
                    disabled={saving}
                    onClick={() => void saveCurrentReview()}
                  >
                    Повторити збереження
                  </button>
                }
              />
            )}
            <label>
              Ім'я
              <input
                value={draft.name}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, name: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Рейтинг
              <select
                value={draft.rating}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, rating: Number(event.target.value) }))
                }
              >
                {[5, 4, 3, 2, 1].map((option) => (
                  <option key={option} value={option}>
                    {option} зірок
                  </option>
                ))}
              </select>
            </label>
            <label>
              Текст відгуку
              <textarea
                value={draft.content}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, content: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Порядок
              <input
                type="number"
                value={draft.sortOrder}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    sortOrder: Number(event.target.value)
                  }))
                }
              />
            </label>
            <label>
              Дата створення
              <input
                value={draft.createdAt}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, createdAt: event.target.value }))
                }
              />
            </label>
            <div className="checkbox-grid">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.isActive}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isActive: event.target.checked }))
                  }
                />
                Активний
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={draft.isModerated}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, isModerated: event.target.checked }))
                  }
                />
                Промодерований
              </label>
            </div>
            <div className="admin-form-actions">
              <button className="primary-button compact" type="submit" disabled={saving}>
                {saving ? "Збереження..." : editingId ? "Оновити" : "Створити"}
              </button>
              <button className="ghost-button compact" type="button" onClick={() => resetForm()}>
                Скинути
              </button>
            </div>
          </form>
        </AdminCard>

        <AdminCard
          id="list-panel"
          title="Список відгуків"
          extra={<span className="list-count">{visibleItems.length} записів</span>}
        >
          {!loadError || !items.length ? null : (
            <NoticePanel
              title="Не вдалося оновити список відгуків"
              description={`${loadError} Показуємо останній доступний стан списку.`}
              tone="warning"
              action={
                <button className="ghost-button compact" type="button" onClick={() => void load()}>
                  Повторити запит
                </button>
              }
            />
          )}

          {!actionError ? null : (
            <NoticePanel
              title={actionError.title}
              description={actionError.description}
              tone="danger"
              action={
                <button
                  className="ghost-button compact"
                  type="button"
                  onClick={() => void retryFailedReviewAction()}
                >
                  Повторити дію
                </button>
              }
            />
          )}

          <div className="admin-toolbar toolbar-grid-wide">
            <label className="toolbar-field toolbar-field-grow">
              <span>Пошук</span>
              <input
                placeholder="Ім'я або текст"
                value={query}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { q: event.target.value },
                    filterDefaults
                  )
                }
              />
            </label>
            <label className="toolbar-field">
              <span>Статус</span>
              <select
                value={status}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { status: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="active">Активні</option>
                <option value="inactive">Неактивні</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Модерація</span>
              <select
                value={moderation}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { moderation: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Всі</option>
                <option value="pending">Чекають модерації</option>
                <option value="approved">Промодеровані</option>
              </select>
            </label>
            <label className="toolbar-field">
              <span>Рейтинг</span>
              <select
                value={rating}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { rating: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="all">Будь-який</option>
                {[5, 4, 3, 2, 1].map((option) => (
                  <option key={option} value={String(option)}>
                    {option} зірок
                  </option>
                ))}
              </select>
            </label>
            <label className="toolbar-field">
              <span>Сортування</span>
              <select
                value={sort}
                onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { sort: event.target.value },
                    filterDefaults
                  )
                }
              >
                <option value="updated">Останні зміни</option>
                <option value="created">Новіші</option>
                <option value="rating">Вищий рейтинг</option>
                <option value="name">За ім'ям</option>
              </select>
            </label>
            <button
              className="ghost-button compact"
              type="button"
              onClick={() => setSearchParams({}, { replace: true })}
            >
              Скинути
            </button>
          </div>

          <ActiveFiltersBar
            items={activeFilterItems}
            onReset={() => setSearchParams({}, { replace: true })}
          />

          <div className="selection-toolbar">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) =>
                  setSelectedIds((current) =>
                    event.target.checked
                      ? Array.from(new Set([...current, ...visibleIds]))
                      : current.filter((id) => !visibleIds.includes(id))
                  )
                }
              />
              Виділити всі видимі
            </label>
          </div>

          <BulkActionBar
            selectedCount={selectedIds.length}
            value={bulkAction}
            options={reviewBulkOptions}
            onValueChange={setBulkAction}
            onApply={() => void applyBulkAction()}
            onClear={() => {
              setSelectedIds([]);
              setBulkAction("");
            }}
          />

          {loading ? (
            <InlineLoader />
          ) : loadError && !items.length ? (
            <EmptyState
              title="Не вдалося завантажити відгуки"
              description={loadError}
              action={
                <button className="primary-button compact" type="button" onClick={() => void load()}>
                  Спробувати ще раз
                </button>
              }
            />
          ) : !visibleItems.length ? (
            <EmptyState
              title="Відгуки не знайдено"
              description="Зміни фільтри або створи новий відгук."
            />
          ) : (
            <div className="admin-list-stack">
              {visibleItems.map((item) => (
                <article
                  className={`admin-list-item ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="admin-selection-cell">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() =>
                        setSelectedIds((current) => updateSelection(current, item.id))
                      }
                      aria-label={`Виділити відгук ${item.name}`}
                    />
                  </div>
                  <div className="admin-list-body">
                    <div className="admin-list-head">
                      <div>
                        <div className="item-tags">
                          <StatusBadge tone={item.isActive ? "success" : "muted"}>
                            {item.isActive ? "Активний" : "Вимкнений"}
                          </StatusBadge>
                          <StatusBadge tone={item.isModerated ? "accent" : "warning"}>
                            {item.isModerated ? "Промодерований" : "Потрібна модерація"}
                          </StatusBadge>
                          <StatusBadge tone="muted">{`${item.rating}/5`}</StatusBadge>
                        </div>
                        <strong>{item.name}</strong>
                        <p>{item.content}</p>
                        <small>
                          Створено: {formatDateTime(item.createdAt)} · Оновлено: {formatDateTime(item.updatedAt)}
                        </small>
                      </div>
                      <div className="admin-table-actions">
                        <button
                          className="ghost-button compact"
                          type="button"
                          onClick={() => openEditor(item)}
                        >
                          Редагувати
                        </button>
                        <button
                          className="danger-button compact"
                          type="button"
                          onClick={() => void handleDelete(item.id)}
                        >
                          Видалити
                        </button>
                      </div>
                    </div>

                    <div className="inline-action-row">
                      <button
                        className={`ghost-button compact ${item.isActive ? "is-current" : ""}`}
                        type="button"
                        onClick={() =>
                          void updateReviewQuick(
                            item,
                            { isActive: !item.isActive },
                            item.isActive ? "Відгук вимкнено." : "Відгук активовано."
                          )
                        }
                      >
                        {item.isActive ? "Вимкнути" : "Активувати"}
                      </button>
                      <button
                        className={`ghost-button compact ${item.isModerated ? "is-current" : ""}`}
                        type="button"
                        onClick={() =>
                          void updateReviewQuick(
                            item,
                            { isModerated: !item.isModerated },
                            item.isModerated ? "Модерацію знято." : "Відгук промодеровано."
                          )
                        }
                      >
                        {item.isModerated ? "Зняти модерацію" : "Промодерувати"}
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </AdminCard>
      </div>
    </>
  );
}

export function AdminLeadsPage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState<{
    title: string;
    description: string;
    retry:
      | { type: "bulk"; ids: string[]; action: string }
      | { type: "status"; id: string; status: LeadStatus };
  } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkAction, setBulkAction] = useState("");

  const query = searchParams.get("q") ?? "";
  const status = searchParams.get("status") ?? "all";
  const sort = searchParams.get("sort") ?? "created";
  const filterDefaults = { q: "", status: "all", sort: "created" };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const loaded = await api.getLeads();
      setItems(loaded);
      setSelectedIds((current) => current.filter((id) => loaded.some((item) => item.id === id)));
      setActionError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setActionError(null);
  }, [bulkAction, selectedIds]);

  const visibleItems = [...items]
    .filter((item) => {
      if (status !== "all" && item.status !== status) {
        return false;
      }

      return textIncludes(
        [
          item.name,
          item.contact,
          item.message,
          item.neededBy ?? "",
          item.utmSource ?? "",
          item.utmMedium ?? "",
          item.utmCampaign ?? "",
          ...item.items.map((leadItem) => leadItem.labelSnapshot)
        ],
        query
      );
    })
    .sort((left, right) => {
      if (sort === "oldest") {
        return getTimeValue(left.createdAt) - getTimeValue(right.createdAt);
      }

      if (sort === "name") {
        return left.name.localeCompare(right.name);
      }

      return getTimeValue(right.createdAt) - getTimeValue(left.createdAt);
    });

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const activeFilterItems = [
    query
      ? {
          key: "q",
          label: "Пошук",
          value: query,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { q: "" }, filterDefaults)
        }
      : null,
    status !== "all"
      ? {
          key: "status",
          label: "Статус",
          value: getLeadStatusLabel(status as LeadStatus),
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { status: "all" }, filterDefaults)
        }
      : null,
    sort !== "created"
      ? {
          key: "sort",
          label: "Сортування",
          value:
            {
              oldest: "Старіші",
              name: "За ім'ям"
            }[sort] ?? sort,
          onClear: () =>
            patchSearchParams(searchParams, setSearchParams, { sort: "created" }, filterDefaults)
        }
      : null
  ].filter((item): item is ActiveFilterItem => Boolean(item));

  const applyBulkAction = async () => {
    if (!selectedIds.length || !bulkAction) {
      return;
    }

    try {
      await executeLeadBulk(selectedIds, bulkAction);
    } catch (error) {
      const message = `${getErrorMessage(error)} Виділення збережено, можна повторити bulk-оновлення.`;
      setActionError({
        title: "Не вдалося оновити статуси заявок",
        description: message,
        retry: { type: "bulk", ids: [...selectedIds], action: bulkAction }
      });
      pushToast(message, "error");
    }
  };

  const updateSingleLeadStatus = async (id: string, nextStatus: LeadStatus) => {
    try {
      await executeLeadStatusUpdate(id, nextStatus);
    } catch (error) {
      const message = `${getErrorMessage(error)} Можна повторити зміну статусу.`;
      setActionError({
        title: "Не вдалося оновити статус заявки",
        description: message,
        retry: { type: "status", id, status: nextStatus }
      });
      pushToast(message, "error");
    }
  };

  const executeLeadBulk = useCallback(
    async (ids: string[], action: string) => {
      await api.bulkLeads({ ids, action });
      pushToast("Bulk-статус для заявок оновлено.", "success");
      setSelectedIds([]);
      setBulkAction("");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const executeLeadStatusUpdate = useCallback(
    async (id: string, nextStatus: LeadStatus) => {
      await api.updateLeadStatus(id, nextStatus);
      pushToast("Статус заявки оновлено.", "success");
      setActionError(null);
      await load();
    },
    [load, pushToast]
  );

  const retryFailedLeadAction = async () => {
    if (!actionError) {
      return;
    }

    try {
      if (actionError.retry.type === "bulk") {
        await executeLeadBulk(actionError.retry.ids, actionError.retry.action);
        return;
      }

      await executeLeadStatusUpdate(actionError.retry.id, actionError.retry.status);
    } catch (error) {
      const message = `${getErrorMessage(error)} Повторна спроба теж не вдалася.`;
      setActionError((current) =>
        current
          ? {
              ...current,
              description: message
            }
          : current
      );
      pushToast(message, "error");
    }
  };

  return (
    <>
      <SectionHeader
        title="Заявки"
        description="Всі ліди вже зберігають `items[]` і snapshot тарифів, тому далі можна безболісно додати checkout."
      />

      <AdminCard title="Черга заявок" extra={<span className="list-count">{visibleItems.length} записів</span>}>
        {!loadError || !items.length ? null : (
          <NoticePanel
            title="Не вдалося оновити список заявок"
            description={`${loadError} Показуємо останній доступний стан черги.`}
            tone="warning"
            action={
              <button className="ghost-button compact" type="button" onClick={() => void load()}>
                Повторити запит
              </button>
            }
          />
        )}

        {!actionError ? null : (
          <NoticePanel
            title={actionError.title}
            description={actionError.description}
            tone="danger"
            action={
              <button
                className="ghost-button compact"
                type="button"
                onClick={() => void retryFailedLeadAction()}
              >
                Повторити дію
              </button>
            }
          />
        )}

        <div className="admin-toolbar toolbar-grid-wide">
          <label className="toolbar-field toolbar-field-grow">
            <span>Пошук</span>
            <input
              placeholder="Ім'я, контакт, текст, тариф"
              value={query}
              onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { q: event.target.value },
                    filterDefaults
                  )
                }
              />
          </label>
          <label className="toolbar-field">
            <span>Статус</span>
            <select
              value={status}
              onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { status: event.target.value },
                    filterDefaults
                  )
                }
              >
              <option value="all">Всі</option>
              {leadStatusFilters.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="toolbar-field">
            <span>Сортування</span>
            <select
              value={sort}
              onChange={(event) =>
                  patchSearchParams(
                    searchParams,
                    setSearchParams,
                    { sort: event.target.value },
                    filterDefaults
                  )
                }
              >
              <option value="created">Новіші</option>
              <option value="oldest">Старіші</option>
              <option value="name">За ім'ям</option>
            </select>
          </label>
          <button
            className="ghost-button compact"
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            >
              Скинути
            </button>
          </div>

        <ActiveFiltersBar
          items={activeFilterItems}
          onReset={() => setSearchParams({}, { replace: true })}
        />

        <div className="selection-toolbar">
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={(event) =>
                setSelectedIds((current) =>
                  event.target.checked
                    ? Array.from(new Set([...current, ...visibleIds]))
                    : current.filter((id) => !visibleIds.includes(id))
                )
              }
            />
            Виділити всі видимі
          </label>
        </div>

        <BulkActionBar
          selectedCount={selectedIds.length}
          value={bulkAction}
          options={leadBulkOptions}
          onValueChange={setBulkAction}
          onApply={() => void applyBulkAction()}
          onClear={() => {
            setSelectedIds([]);
            setBulkAction("");
          }}
        />

        {loading ? (
          <InlineLoader />
        ) : loadError && !items.length ? (
          <EmptyState
            title="Не вдалося завантажити заявки"
            description={loadError}
            action={
              <button className="primary-button compact" type="button" onClick={() => void load()}>
                Спробувати ще раз
              </button>
            }
          />
        ) : !visibleItems.length ? (
          <EmptyState
            title="Заявок не знайдено"
            description="Коли на сайті з'являться нові заявки, вони будуть тут."
          />
        ) : (
          <div className="admin-list-stack">
            {visibleItems.map((item) => {
              const contactAction = buildContactAction(item.contact);

              return (
                <article
                  className={`admin-list-item ${selectedIds.includes(item.id) ? "is-selected" : ""}`}
                  key={item.id}
                >
                  <div className="admin-selection-cell">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() =>
                        setSelectedIds((current) => updateSelection(current, item.id))
                      }
                      aria-label={`Виділити заявку ${item.name}`}
                    />
                  </div>
                  <div className="admin-list-body">
                    <div className="admin-list-head">
                      <div>
                        <div className="item-tags">
                          <StatusBadge tone={getLeadStatusTone(item.status)}>
                            {getLeadStatusLabel(item.status)}
                          </StatusBadge>
                          <StatusBadge tone="muted">{formatDateTime(item.createdAt)}</StatusBadge>
                          <StatusBadge tone="muted">№{item.id.slice(0, 8).toUpperCase()}</StatusBadge>
                        </div>
                        <strong>{item.name}</strong>
                        <p>{item.contact}</p>
                      </div>
                      <div className="admin-table-actions">
                        {leadStatusFilters.map((option) => (
                          <button
                            className={`ghost-button compact ${item.status === option.value ? "is-current" : ""}`}
                            key={option.value}
                            type="button"
                            onClick={() => void updateSingleLeadStatus(item.id, option.value)}
                            disabled={item.status === option.value}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="inline-action-row">
                      {!contactAction ? null : (
                        <a
                          className="ghost-button compact"
                          href={contactAction.href}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {contactAction.label}
                        </a>
                      )}
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(item.contact);
                            pushToast("Контакт скопійовано.", "success");
                          } catch {
                            pushToast("Не вдалося скопіювати контакт.", "error");
                          }
                        }}
                      >
                        Скопіювати контакт
                      </button>
                    </div>

                    <div className="lead-item-list">
                      {!item.neededBy ? null : (
                        <div className="lead-item-row">
                          <strong>Потрібно з</strong>
                          <span>{new Intl.DateTimeFormat("uk-UA").format(new Date(`${item.neededBy}T00:00:00`))}</span>
                        </div>
                      )}
                      {!item.utmSource ? null : (
                        <div className="lead-item-row">
                          <strong>Джерело</strong>
                          <span>{[item.utmSource, item.utmMedium, item.utmCampaign].filter(Boolean).join(" · ")}</span>
                        </div>
                      )}
                      {item.items.map((leadItem) => (
                        <div className="lead-item-row" key={leadItem.id}>
                          <strong>{leadItem.labelSnapshot}</strong>
                          <span>
                            {leadItem.quantity} × {formatPrice(leadItem.unitPriceSnapshot, leadItem.currency)}
                          </span>
                          {!leadItem.compareAtSnapshot ? null : (
                            <small>Було: {formatPrice(leadItem.compareAtSnapshot, leadItem.currency)}</small>
                          )}
                        </div>
                      ))}
                    </div>

                    {!item.message.trim() ? null : (
                      <div className="lead-message">
                        <strong>Коментар</strong>
                        <p>{item.message}</p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </AdminCard>
    </>
  );
}

export function AdminSettingsPage() {
  const { pushToast } = useToast();
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [baseline, setBaseline] = useState("");
  const dirty = settings ? createSettingsBaseline(settings) !== baseline : false;
  const confirmIfDirty = useUnsavedChangesGuard(dirty);
  const corruptedFields = settings
    ? (Object.keys(recommendedSettingsCopy) as Array<
        keyof typeof recommendedSettingsCopy
      >).filter((field) => looksCorruptedText(settings[field]))
    : [];

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setSaveError("");
    try {
      const loaded = await api.getSettings();
      setSettings(loaded);
      setBaseline(createSettingsBaseline(loaded));
    } catch (error) {
      setLoadError(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    if (!confirmIfDirty()) {
      return;
    }

    setSaveError("");
    void load();
  };

  const applyRecommendedCopy = () => {
    setSaveError("");
    setSettings((current) =>
      current
        ? {
            ...current,
            ...recommendedSettingsCopy
          }
        : current
    );
  };

  const saveCurrentSettings = useCallback(async () => {
    if (!settings) {
      return;
    }

    setSaving(true);
    setSaveError("");

    try {
      const updated = await api.updateSettings(settings);
      setSettings(updated);
      setBaseline(createSettingsBaseline(updated));
      pushToast("Налаштування оновлено.", "success");
    } catch (error) {
      const message = `${getErrorMessage(error)} Поточні правки залишилися у формі, можна повторити збереження.`;
      setSaveError(message);
      pushToast(message, "error");
    } finally {
      setSaving(false);
    }
  }, [pushToast, settings]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await saveCurrentSettings();
  };

  const updateSettingsField = <K extends keyof SiteSettings>(
    field: K,
    value: SiteSettings[K]
  ) => {
    setSaveError("");
    setSettings((current) => (current ? { ...current, [field]: value } : current));
  };

  return (
    <>
      <SectionHeader
        title="Налаштування"
        description="Глобальні тексти сайту, Telegram CTA і hero/lead блоки."
      />

      <AdminCard title="Глобальні параметри">
        {loading ? (
          <InlineLoader />
        ) : !settings ? (
          <EmptyState
            title="Не вдалося завантажити налаштування"
            description={loadError || "Спробуй повторити запит до API ще раз."}
            action={
              <button
                className="primary-button compact"
                type="button"
                onClick={() => void load()}
              >
                Спробувати ще раз
              </button>
            }
          />
        ) : (
          <>
            {!loadError ? null : (
              <NoticePanel
                title="Не вдалося оновити дані з сервера"
                description={`${loadError} У формі залишено останній доступний стан.`}
                tone="warning"
                action={
                  <button
                    className="ghost-button compact"
                    type="button"
                    onClick={() => void load()}
                  >
                    Повторити запит
                  </button>
                }
              />
            )}

            {!corruptedFields.length ? null : (
              <div className="warning-banner">
                <strong>Знайдено схожий на зіпсований текст у settings</strong>
                <p>
                  Ймовірно зламалось кодування або були збережені некоректні значення.
                  Перевір поля:{" "}
                  {corruptedFields.map((field) => settingsFieldLabels[field]).join(", ")}.
                </p>
              </div>
            )}

            <div className="settings-actions">
              <button
                className="primary-button compact"
                type="button"
                onClick={applyRecommendedCopy}
              >
                Підставити рекомендований текст
              </button>
              <button className="ghost-button compact" type="button" onClick={resetForm}>
                Скинути до збереженого
              </button>
            </div>

            <div className="settings-preview-grid" id="settings-preview">
              <article className="settings-preview-card">
                <div className="item-tags">
                  <StatusBadge tone="accent">Прев'ю hero</StatusBadge>
                  {looksCorruptedText(settings.heroTitle) ||
                  looksCorruptedText(settings.heroSubtitle) ? (
                    <StatusBadge tone="warning">Підозрілий текст</StatusBadge>
                  ) : null}
                </div>
                <strong>{settings.heroTitle}</strong>
                <p>{settings.heroSubtitle}</p>
              </article>

              <article className="settings-preview-card">
                <div className="item-tags">
                  <StatusBadge tone="accent">Прев'ю заявки</StatusBadge>
                  {looksCorruptedText(settings.leadTitle) ||
                  looksCorruptedText(settings.leadSubtitle) ? (
                    <StatusBadge tone="warning">Підозрілий текст</StatusBadge>
                  ) : null}
                </div>
                <strong>{settings.leadTitle}</strong>
                <p>{settings.leadSubtitle}</p>
              </article>

              <article className="settings-preview-card">
                <div className="item-tags">
                  <StatusBadge tone="accent">Прев'ю футера</StatusBadge>
                  {looksCorruptedText(settings.footerDescription) ? (
                    <StatusBadge tone="warning">Підозрілий текст</StatusBadge>
                  ) : null}
                </div>
                <strong>{settings.siteName}</strong>
                <p>{settings.footerDescription}</p>
                <small>Контакт: {settings.telegramContactUrl}</small>
                <small>Канал: {settings.telegramNewsChannelUrl}</small>
              </article>
            </div>

            <form className="admin-form" onSubmit={handleSubmit}>
              <EditorToolbar
                dirty={dirty}
                saving={saving}
                isEditing
                createLabel="Зберегти"
                updateLabel="Зберегти"
                onReset={resetForm}
                shortcutHref="#settings-preview"
                shortcutLabel="До прев'ю"
              />
              {!saveError ? null : (
                <NoticePanel
                  title="Не вдалося зберегти налаштування"
                  description={saveError}
                  tone="danger"
                  action={
                    <button
                      className="ghost-button compact"
                      type="button"
                      disabled={saving}
                      onClick={() => void saveCurrentSettings()}
                    >
                      Повторити збереження
                    </button>
                  }
                />
              )}
              <label>
                Назва сайту
                <input
                  value={settings.siteName}
                  onChange={(event) => updateSettingsField("siteName", event.target.value)}
                  required
                />
              </label>
              <label>
                Telegram продавця
                <input
                  value={settings.telegramContactUrl}
                  onChange={(event) =>
                    updateSettingsField("telegramContactUrl", event.target.value)
                  }
                />
              </label>
              <label>
                Telegram-канал новин
                <input
                  value={settings.telegramNewsChannelUrl}
                  onChange={(event) =>
                    updateSettingsField("telegramNewsChannelUrl", event.target.value)
                  }
                />
              </label>
              <label className={looksCorruptedText(settings.heroTitle) ? "is-invalid" : ""}>
                Заголовок hero
                <input
                  value={settings.heroTitle}
                  onChange={(event) => updateSettingsField("heroTitle", event.target.value)}
                />
              </label>
              <label className={looksCorruptedText(settings.heroSubtitle) ? "is-invalid" : ""}>
                Підзаголовок hero
                <textarea
                  value={settings.heroSubtitle}
                  onChange={(event) =>
                    updateSettingsField("heroSubtitle", event.target.value)
                  }
                />
              </label>
              <label className={looksCorruptedText(settings.leadTitle) ? "is-invalid" : ""}>
                Заголовок заявки
                <input
                  value={settings.leadTitle}
                  onChange={(event) => updateSettingsField("leadTitle", event.target.value)}
                />
              </label>
              <label className={looksCorruptedText(settings.leadSubtitle) ? "is-invalid" : ""}>
                Підзаголовок заявки
                <textarea
                  value={settings.leadSubtitle}
                  onChange={(event) =>
                    updateSettingsField("leadSubtitle", event.target.value)
                  }
                />
              </label>
              <label
                className={looksCorruptedText(settings.footerDescription) ? "is-invalid" : ""}
              >
                Опис у футері
                <textarea
                  value={settings.footerDescription}
                  onChange={(event) =>
                    updateSettingsField("footerDescription", event.target.value)
                  }
                />
              </label>
              <div className="admin-form-actions">
                <button className="primary-button compact" type="submit" disabled={saving}>
                  {saving ? "Збереження..." : "Зберегти"}
                </button>
                <button className="ghost-button compact" type="button" onClick={resetForm}>
                  Скинути
                </button>
              </div>
            </form>
          </>
        )}
      </AdminCard>
    </>
  );
}
