import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  api,
  ApiError,
  getStaticNewsFeedFetchedAt,
  hasConfiguredLiveApi,
  isStaticSite,
  staticSiteBasePath
} from "../api";
import { defaultSiteSettings } from "../../shared/siteDefaults";
import { getTelegramPromotionExpiry } from "../../shared/newsDates";
import { preserveUtmAttribution, readUtmAttribution } from "../attribution";
import type {
  Category,
  CreateLeadInput,
  FaqItem,
  NewsItem,
  PricingOption,
  Product,
  Review,
  SiteSettings
} from "../types";
import {
  BrandLink,
  EmptyState,
  LoadingGrid,
  NoticePanel,
  PageShell,
  ProductLogo,
  Reveal,
  ThemeToggle,
  formatPrice,
  getLowestPlan
} from "../shared";
import { useToast } from "../toasts";

const heroHighlight = "топові сервіси";

const sectionLinks = [
  { id: "catalog", label: "Каталог" },
  { id: "faq", label: "FAQ" },
  { id: "news", label: "Новини" },
  { id: "lead-form", label: "Заявка" },
  { id: "reviews", label: "Відгуки" }
] as const;

type SectionId = (typeof sectionLinks)[number]["id"];

const sectionDescriptions: Record<SectionId, string> = {
  catalog: "Пошук, фільтри і прямий вибір тарифу",
  faq: "Швидкі відповіді перед замовленням",
  news: "Оновлення каталогу та корисні анонси",
  "lead-form": "Заявка з фіксацією обраного плану",
  reviews: "Враження клієнтів і довіра до сервісу"
};

const heroShortcutIds = ["catalog", "lead-form", "faq", "news"] as const;

const sortOptions = [
  { value: "popular", label: "Популярні" },
  { value: "price-asc", label: "Дешевші" },
  { value: "price-desc", label: "Дорожчі" },
  { value: "order", label: "За порядком" }
] as const;

const sortLabelMap: Record<CatalogSort, string> = {
  popular: "Популярні",
  "price-asc": "Дешевші",
  "price-desc": "Дорожчі",
  order: "За порядком"
};

const leadFlowSteps = [
  {
    title: "1. Обери сервіс",
    description: "Знайди потрібну підписку через каталог, пошук або фільтри."
  },
  {
    title: "2. Залиш контакт",
    description: "Вкажи Telegram, email або номер і вибери зручний тариф."
  },
  {
    title: "3. Отримай підтвердження",
    description: "Заявка потрапляє в адмінку, а далі ми швидко зв'язуємось."
  }
] as const;

type CatalogSort = (typeof sortOptions)[number]["value"];

type LeadFormState = {
  name: string;
  contact: string;
  message: string;
  productId: string;
  pricingOptionId: string;
  neededBy: string;
};

type LeadFormErrors = Partial<Record<keyof LeadFormState, string>>;

function renderHeroTitle(title: string) {
  const markerIndex = title.toLowerCase().indexOf(heroHighlight);

  if (markerIndex === -1) {
    return title;
  }

  const before = title.slice(0, markerIndex);
  const highlighted = title.slice(markerIndex, markerIndex + heroHighlight.length);
  const after = title.slice(markerIndex + heroHighlight.length);

  return (
    <>
      {before}
      <span>{highlighted}</span>
      {after}
    </>
  );
}

function getDisplayPlans(product: Product | null | undefined) {
  if (!product) {
    return [] as PricingOption[];
  }

  const activePlans = product.pricingOptions.filter((plan) => plan.isActive);
  return activePlans.length ? activePlans : product.pricingOptions;
}

function normalizeSort(value: string | null): CatalogSort {
  return sortOptions.some((option) => option.value === value)
    ? (value as CatalogSort)
    : "popular";
}

function matchesProductSearch(product: Product, categoryName: string, search: string) {
  if (!search) {
    return true;
  }

  const haystack = [
    product.name,
    product.summary,
    categoryName,
    ...product.details,
    ...product.pricingOptions.map((option) => option.label)
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search.toLowerCase());
}

function sortProducts(products: Product[], sortKey: CatalogSort) {
  return [...products].sort((left, right) => {
    const leftPlan = getLowestPlan(left);
    const rightPlan = getLowestPlan(right);
    const leftPrice = leftPlan?.price ?? 0;
    const rightPrice = rightPlan?.price ?? 0;
    const currencyOrder = (leftPlan?.currency ?? "UAH") === (rightPlan?.currency ?? "UAH")
      ? 0
      : leftPlan?.currency === "USD" ? 1 : -1;

    switch (sortKey) {
      case "price-asc":
        return currencyOrder || leftPrice - rightPrice || left.sortOrder - right.sortOrder;
      case "price-desc":
        return currencyOrder || rightPrice - leftPrice || left.sortOrder - right.sortOrder;
      case "order":
        return left.sortOrder - right.sortOrder || left.name.localeCompare(right.name);
      case "popular":
      default:
        return (
          Number(right.isHot) - Number(left.isHot) ||
          left.sortOrder - right.sortOrder ||
          leftPrice - rightPrice
        );
    }
  });
}

function getReviewInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatReviewDate(value?: string) {
  if (!value) {
    return "Нещодавно";
  }

  return new Intl.DateTimeFormat("uk-UA", {
    month: "long",
    year: "numeric"
  }).format(new Date(value));
}

function getTodayDateInputValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function getPlanSavings(plan: PricingOption | null | undefined) {
  if (!plan?.compareAt || plan.compareAt <= plan.price) {
    return 0;
  }

  return plan.compareAt - plan.price;
}

function getBestValuePlan(product: Product | null | undefined) {
  const plans = getDisplayPlans(product);

  return plans.reduce<PricingOption | null>((best, current) => {
    if (!best) {
      return current;
    }

    const bestSavings = getPlanSavings(best);
    const currentSavings = getPlanSavings(current);

    if (currentSavings !== bestSavings) {
      return currentSavings > bestSavings ? current : best;
    }

    if (current.price !== best.price) {
      return current.price < best.price ? current : best;
    }

    return current.sortOrder < best.sortOrder ? current : best;
  }, null);
}

function looksLikeContactInput(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return false;
  }

  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(trimmed)) {
    return true;
  }

  if (/^(?:@[\w\d_]{4,}|t\.me\/[\w\d_]{4,}|telegram\.me\/[\w\d_]{4,})$/i.test(trimmed)) {
    return true;
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return true;
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  return digits.length >= 10;
}

function getContactFieldHint(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return {
      tone: "muted" as const,
      text: "Наприклад: @username, email@example.com або +380..."
    };
  }

  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(trimmed) || /^(?:@[\w\d_]{4,}|t\.me\/[\w\d_]{4,}|telegram\.me\/[\w\d_]{4,})$/i.test(trimmed)) {
    return { tone: "success" as const, text: "Схоже на Telegram-контакт." };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { tone: "success" as const, text: "Схоже на email для зворотного зв'язку." };
  }

  const digits = trimmed.replace(/[^\d]/g, "");
  if (digits.length >= 10) {
    return { tone: "success" as const, text: "Схоже на номер телефону." };
  }

  return {
    tone: "warning" as const,
    text: "Перевір формат: Telegram, email або номер мають бути зрозумілими."
  };
}

export function HomePage() {
  const { pushToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const leadRef = useRef<HTMLFormElement | null>(null);
  const startedOnStaticPagesPathRef = useRef(
    isStaticSite && window.location.pathname.startsWith(staticSiteBasePath)
  );
  const lastUrlSelectionRef = useRef("");
  const catalogRefreshTokenRef = useRef(0);
  const publicRefreshTokenRef = useRef(0);
  const initialCatalogRevalidationRef = useRef(false);
  const isMountedRef = useRef(true);

  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [faqs, setFaqs] = useState<FaqItem[]>([]);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsFeedFetchedAt, setNewsFeedFetchedAt] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [openFaqIndex, setOpenFaqIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [activeSection, setActiveSection] = useState<SectionId>("catalog");
  const [leadSubmitting, setLeadSubmitting] = useState(false);
  const [leadSuccess, setLeadSuccess] = useState("");
  const [leadOrderId, setLeadOrderId] = useState("");
  const [leadTelegramDraftUrl, setLeadTelegramDraftUrl] = useState("");
  const [leadSubmitError, setLeadSubmitError] = useState("");
  const [leadErrors, setLeadErrors] = useState<LeadFormErrors>({});
  const [leadValues, setLeadValues] = useState<LeadFormState>({
    name: "",
    contact: "",
    message: "",
    productId: "",
    pricingOptionId: "",
    neededBy: ""
  });

  useEffect(() => {
    if (
      !isStaticSite ||
      !startedOnStaticPagesPathRef.current ||
      window.location.pathname !== "/"
    ) {
      return;
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${staticSiteBasePath}${window.location.search}${window.location.hash}`
    );
  }, [searchParams]);

  const activeCategory = searchParams.get("category") ?? "all";
  const searchTerm = searchParams.get("q") ?? "";
  const sortKey = normalizeSort(searchParams.get("sort"));
  const selectedProductParam = searchParams.get("product") ?? "";
  const selectedPlanParam = searchParams.get("plan") ?? "";
  const displaySettings = settings ?? defaultSiteSettings;
  const totalProducts = products.length || 35;
  const totalCategories = categories.length || 6;
  const totalReviews = reviews.length;
  const latestTelegramPost = news
    .filter((item) => item.sourceType === "telegram" && item.publishedAt)
    .sort((left, right) => Date.parse(right.publishedAt!) - Date.parse(left.publishedAt!))[0];
  const latestPostIsStale = Boolean(
    latestTelegramPost?.publishedAt &&
      Date.now() - Date.parse(latestTelegramPost.publishedAt) > 14 * 24 * 60 * 60 * 1000
  );
  const newsFeedCheckIsStale = Boolean(
    newsFeedFetchedAt && Date.now() - Date.parse(newsFeedFetchedAt) > 2 * 60 * 60 * 1000
  );
  const latestPostDateLabel = latestTelegramPost?.dateLabel?.replace(/[.]+$/, "");
  const minimalPrice =
    products
      .flatMap((product) => getDisplayPlans(product))
      .filter((plan) => plan.currency === "UAH")
      .reduce<number | null>((best, plan) => {
        if (best === null || plan.price < best) {
          return plan.price;
        }

        return best;
      }, null) ?? 65;

  const heroFacts = [
    {
      value: `${totalProducts}`,
      label: "позицій у каталозі"
    },
    {
      value: `${totalCategories}`,
      label: "категорій з фільтрами"
    },
    {
      value: `${formatPrice(minimalPrice)}`,
      label: "стартова ціна"
    },
    {
      value: "₴ + $",
      label: "валюти в прайсі"
    }
  ];

  const selectedProduct =
    products.find((product) => product.id === selectedProductId) ?? null;
  const selectedProductPlans = getDisplayPlans(selectedProduct);
  const selectedModalPlan =
    selectedProductPlans.find((plan) => plan.id === selectedPlanId) ?? null;
  const bestModalPlan = getBestValuePlan(selectedProduct);
  const selectedLeadProduct =
    products.find((product) => product.id === leadValues.productId) ?? null;
  const selectedLeadPlans = getDisplayPlans(selectedLeadProduct);
  const selectedLeadPlan =
    selectedLeadPlans.find((plan) => plan.id === leadValues.pricingOptionId) ?? null;
  const leadReadiness = [
    { key: "name", label: "Ім'я", ready: leadValues.name.trim().length >= 2 },
    {
      key: "contact",
      label: "Контакт",
      ready: looksLikeContactInput(leadValues.contact)
    },
    { key: "product", label: "Товар", ready: Boolean(selectedLeadProduct) },
    { key: "plan", label: "Тариф", ready: Boolean(selectedLeadPlan) }
  ];
  const leadReadyCount = leadReadiness.filter((item) => item.ready).length;
  const selectedLeadCategory =
    categories.find((category) => category.id === selectedLeadProduct?.categoryId)?.name ?? "";
  const selectedLeadSavings = getPlanSavings(selectedLeadPlan);
  const contactFieldHint = getContactFieldHint(leadValues.contact);
  const leadQuickProducts = (products.filter((product) => product.isHot).length
    ? products.filter((product) => product.isHot)
    : products
  )
    .filter((product) => Boolean(getLowestPlan(product)))
    .slice(0, 4);
  const activeCatalogFilters = [
    searchTerm
      ? {
          key: "q",
          label: `Пошук: ${searchTerm}`,
          onClear: () => updateCatalogParams({ q: "" })
        }
      : null,
    activeCategory !== "all"
      ? {
          key: "category",
          label: `Категорія: ${
            categories.find((category) => category.id === activeCategory)?.name ?? "Обрана"
          }`,
          onClear: () => updateCatalogParams({ category: "all" })
        }
      : null,
    sortKey !== "popular"
      ? {
          key: "sort",
          label: `Сортування: ${sortLabelMap[sortKey]}`,
          onClear: () => updateCatalogParams({ sort: "popular" })
        }
      : null
  ].filter(
    (
      item
    ): item is {
      key: string;
      label: string;
      onClear: () => void;
    } => Boolean(item)
  );

  let visibleProducts = products.filter((product) => {
    const category = categories.find((item) => item.id === product.categoryId);
    const categoryName = category?.name ?? "";

    if (activeCategory !== "all" && product.categoryId !== activeCategory) {
      return false;
    }

    return matchesProductSearch(product, categoryName, searchTerm);
  });
  visibleProducts = sortProducts(visibleProducts, sortKey);

  const refreshCatalogData = useCallback(async () => {
    const requestId = ++catalogRefreshTokenRef.current;

    try {
      const [loadedCategories, loadedProducts] = await Promise.all([
        api.getCategories(),
        api.getProducts()
      ]);

      if (requestId !== catalogRefreshTokenRef.current) {
        return;
      }

      setCategories(loadedCategories);
      setProducts(loadedProducts);
    } catch {
      // Keep current catalog state if a background refresh fails.
    }
  }, []);

  const refreshPublicData = useCallback(async () => {
    const requestId = ++publicRefreshTokenRef.current;

    try {
      const [
        loadedSettings,
        loadedCategories,
        loadedProducts,
        loadedFaqs,
        loadedNews,
        loadedReviews
      ] = await Promise.all([
        api.getSite(),
        api.getCategories(),
        api.getProducts(),
        api.getFaqs(),
        api.getNews(),
        api.getReviews()
      ]);

      if (requestId !== publicRefreshTokenRef.current) {
        return;
      }

      setSettings(loadedSettings);
      setCategories(loadedCategories);
      setProducts(loadedProducts);
      setFaqs(loadedFaqs);
      setNews(loadedNews);
      setNewsFeedFetchedAt(isStaticSite ? getStaticNewsFeedFetchedAt() : null);
      setReviews(loadedReviews);
    } catch {
      // Keep current public state if a background refresh fails.
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const [
        loadedSettings,
        loadedCategories,
        loadedProducts,
        loadedFaqs,
        loadedNews,
        loadedReviews
      ] = await Promise.all([
        api.getSite(),
        api.getCategories(),
        api.getProducts(),
        api.getFaqs(),
        api.getNews(),
        api.getReviews()
      ]);

      if (!isMountedRef.current) {
        return;
      }

      setSettings(loadedSettings);
      setCategories(loadedCategories);
      setProducts(loadedProducts);
      setFaqs(loadedFaqs);
      setNews(loadedNews);
      setNewsFeedFetchedAt(isStaticSite ? getStaticNewsFeedFetchedAt() : null);
      setReviews(loadedReviews);
    } catch (caughtError) {
      if (!isMountedRef.current) {
        return;
      }

      setError(
        caughtError instanceof ApiError
          ? caughtError.message
          : "Не вдалося завантажити сайт."
      );
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    void loadInitialData();
    return () => {
      isMountedRef.current = false;
    };
  }, [loadInitialData]);

  useEffect(() => {
    if (loading) {
      return;
    }

    const handleFocus = () => {
      void refreshPublicData();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshPublicData();
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshPublicData();
    }, 30000);

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [loading, refreshPublicData]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!initialCatalogRevalidationRef.current) {
      initialCatalogRevalidationRef.current = true;
      return;
    }

    const debounceMs = searchTerm ? 320 : 0;
    const timeoutId = window.setTimeout(() => {
      void refreshCatalogData();
    }, debounceMs);

    return () => window.clearTimeout(timeoutId);
  }, [activeCategory, loading, refreshCatalogData, searchTerm, sortKey]);

  useEffect(() => {
    const syncHeader = () => {
      const nextScrolled = window.scrollY > 24;
      setIsScrolled(nextScrolled);
      setShowScrollTop(window.scrollY > 420);
    };

    syncHeader();
    window.addEventListener("scroll", syncHeader);
    return () => window.removeEventListener("scroll", syncHeader);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("modal-open", Boolean(selectedProduct));
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [selectedProduct]);

  useEffect(() => {
    document.body.classList.toggle("menu-open", menuOpen);

    if (!menuOpen) {
      return () => {
        document.body.classList.remove("menu-open");
      };
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    const handleResize = () => {
      if (window.innerWidth > 980) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("resize", handleResize);

    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("resize", handleResize);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (selectedProductId && !selectedProduct) {
      setSelectedProductId(null);
      setSelectedPlanId("");
    }
  }, [selectedProduct, selectedProductId]);

  useEffect(() => {
    if (!selectedProduct) {
      setSelectedPlanId("");
      return;
    }

    const plans = getDisplayPlans(selectedProduct);
    if (!plans.length) {
      setSelectedPlanId("");
      return;
    }

    const selectedPlanStillExists = plans.some((plan) => plan.id === selectedPlanId);
    if (!selectedPlanStillExists) {
      const lowestPlan = getLowestPlan(selectedProduct);
      setSelectedPlanId(lowestPlan ? lowestPlan.id : "");
    }
  }, [selectedPlanId, selectedProduct]);

  useEffect(() => {
    if (!selectedLeadProduct) {
      if (leadValues.productId || leadValues.pricingOptionId) {
        setLeadValues((current) => ({ ...current, productId: "", pricingOptionId: "" }));
        setLeadErrors((current) => ({
          ...current,
          productId: undefined,
          pricingOptionId: undefined
        }));
      }
      return;
    }

    const availablePlans = getDisplayPlans(selectedLeadProduct);
    if (!availablePlans.length) {
      if (leadValues.pricingOptionId) {
        setLeadValues((current) => ({ ...current, pricingOptionId: "" }));
      }
      return;
    }

    const exists = availablePlans.some((plan) => plan.id === leadValues.pricingOptionId);
    if (!exists) {
      const lowestPlan = getLowestPlan(selectedLeadProduct);
      setLeadValues((current) => ({
        ...current,
        pricingOptionId: lowestPlan ? lowestPlan.id : ""
      }));
    }
  }, [leadValues.pricingOptionId, selectedLeadProduct]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    const signature = `${selectedProductParam}:${selectedPlanParam}`;
    if (signature === lastUrlSelectionRef.current) {
      return;
    }

    lastUrlSelectionRef.current = signature;

    if (!selectedProductParam) {
      setLeadValues((current) =>
        current.productId || current.pricingOptionId
          ? { ...current, productId: "", pricingOptionId: "" }
          : current
      );
      return;
    }

    const product = products.find((item) => item.id === selectedProductParam);
    if (!product) {
      setLeadValues((current) =>
        current.productId || current.pricingOptionId
          ? { ...current, productId: "", pricingOptionId: "" }
          : current
      );
      return;
    }

    const plans = getDisplayPlans(product);
    const fallbackPlanId = plans.some((plan) => plan.id === selectedPlanParam)
      ? selectedPlanParam
      : getLowestPlan(product)?.id ?? "";

    setLeadValues((current) =>
      current.productId === product.id && current.pricingOptionId === fallbackPlanId
        ? current
        : { ...current, productId: product.id, pricingOptionId: fallbackPlanId }
    );
  }, [products, selectedPlanParam, selectedProductParam]);

  useEffect(() => {
    if (
      selectedProductParam === leadValues.productId &&
      selectedPlanParam === leadValues.pricingOptionId
    ) {
      return;
    }

    const next = new URLSearchParams(searchParams);

    if (leadValues.productId) {
      next.set("product", leadValues.productId);
    } else {
      next.delete("product");
    }

    if (leadValues.pricingOptionId) {
      next.set("plan", leadValues.pricingOptionId);
    } else {
      next.delete("plan");
    }

    setSearchParams(next, { replace: true });
  }, [
    leadValues.pricingOptionId,
    leadValues.productId,
    searchParams,
    selectedPlanParam,
    selectedProductParam,
    setSearchParams
  ]);

  useEffect(() => {
    if (!selectedProductId) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedProductId(null);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [selectedProductId]);

  useEffect(() => {
    const sections = sectionLinks
      .map((section) => document.getElementById(section.id))
      .filter((section): section is HTMLElement => Boolean(section));

    if (!sections.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry?.target.id) {
          setActiveSection(visibleEntry.target.id as (typeof sectionLinks)[number]["id"]);
        }
      },
      {
        rootMargin: "-25% 0px -45% 0px",
        threshold: [0.2, 0.45, 0.7]
      }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [loading]);

  const updateCatalogParams = (patch: {
    category?: string;
    q?: string;
    sort?: CatalogSort;
  }) => {
    const next = new URLSearchParams(searchParams);

    if (patch.category !== undefined) {
      if (!patch.category || patch.category === "all") {
        next.delete("category");
      } else {
        next.set("category", patch.category);
      }
    }

    if (patch.q !== undefined) {
      if (!patch.q.trim()) {
        next.delete("q");
      } else {
        next.set("q", patch.q.trim());
      }
    }

    if (patch.sort !== undefined) {
      if (patch.sort === "popular") {
        next.delete("sort");
      } else {
        next.set("sort", patch.sort);
      }
    }

    setSearchParams(next, { replace: true });
  };

  const openProductModal = (product: Product) => {
    setSelectedProductId(product.id);
    setSelectedPlanId(getLowestPlan(product)?.id ?? "");
  };

  const clearLeadSelection = () => {
    setLeadSuccess("");
    setLeadSubmitError("");
    setLeadValues((current) => ({
      ...current,
      productId: "",
      pricingOptionId: ""
    }));
    setLeadErrors((current) => ({
      ...current,
      productId: undefined,
      pricingOptionId: undefined
    }));
  };

  const clearLeadErrorFields = (...fields: (keyof LeadFormState)[]) => {
    setLeadErrors((current) => {
      let changed = false;
      const next = { ...current };

      fields.forEach((field) => {
        if (next[field]) {
          next[field] = undefined;
          changed = true;
        }
      });

      return changed ? next : current;
    });
  };

  const updateLeadTextField = (
    field: "name" | "contact" | "message" | "neededBy",
    value: string
  ) => {
    setLeadSuccess("");
    setLeadSubmitError("");
    setLeadValues((current) => ({ ...current, [field]: value }) as LeadFormState);

    if (field !== "message") {
      clearLeadErrorFields(field);
    }
  };

  const updateLeadProductSelection = (productId: string) => {
    setLeadSuccess("");
    setLeadSubmitError("");
    setLeadValues((current) => ({
      ...current,
      productId,
      pricingOptionId: ""
    }));
    clearLeadErrorFields("productId", "pricingOptionId");
  };

  const updateLeadPlanSelection = (pricingOptionId: string) => {
    setLeadSuccess("");
    setLeadSubmitError("");
    setLeadValues((current) => ({
      ...current,
      pricingOptionId
    }));
    clearLeadErrorFields("pricingOptionId");
  };

  const copySelectionLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      pushToast("Посилання на вибір скопійовано.", "success");
    } catch {
      pushToast("Не вдалося скопіювати посилання.", "error");
    }
  };

  const startLeadForProduct = (product: Product, planId?: string) => {
    const plans = getDisplayPlans(product);
    const lowestPlan = getLowestPlan(product);

    if (!plans.length || !lowestPlan) {
      pushToast("Для цього товару ще не налаштовано жодного доступного тарифу.", "error");
      return;
    }

    const selectedOptionId =
      planId && plans.some((plan) => plan.id === planId)
        ? planId
        : lowestPlan.id;

    setLeadSuccess("");
    setLeadSubmitError("");
    setLeadErrors({});
    setLeadValues((current) => ({
      ...current,
      productId: product.id,
      pricingOptionId: selectedOptionId
    }));
    setSelectedProductId(null);
    leadRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const validateLeadForm = () => {
    const nextErrors: LeadFormErrors = {};

    if (!leadValues.name.trim()) {
      nextErrors.name = "Вкажи ім'я.";
    } else if (leadValues.name.trim().length < 2) {
      nextErrors.name = "Ім'я має містити хоча б 2 символи.";
    }

    if (!leadValues.contact.trim()) {
      nextErrors.contact = "Вкажи контакт для зв'язку.";
    } else if (!looksLikeContactInput(leadValues.contact)) {
      nextErrors.contact = "Вкажи Telegram, email або номер у зрозумілому форматі.";
    }

    if (!leadValues.productId || !selectedLeadProduct) {
      nextErrors.productId = "Оберіть товар.";
    }

    if (!leadValues.pricingOptionId || !selectedLeadPlan) {
      nextErrors.pricingOptionId = "Оберіть тариф.";
    }

    return nextErrors;
  };

  const buildLeadPayload = (): CreateLeadInput | null => {
    if (!selectedLeadProduct || !selectedLeadPlan) {
      return null;
    }

    return {
      name: leadValues.name.trim(),
      contact: leadValues.contact.trim(),
      message: leadValues.message.trim(),
      neededBy: leadValues.neededBy || null,
      ...readUtmAttribution(),
      items: [
        {
          productId: selectedLeadProduct.id,
          pricingOptionId: selectedLeadPlan.id,
          quantity: 1
        }
      ]
    };
  };

  const submitLeadRequest = async (payload: CreateLeadInput) => {
    setLeadSubmitError("");
    setLeadTelegramDraftUrl("");
    setLeadOrderId("");

    const prepareTelegramDraft = (serverUnavailable = false) => {
      const selectedItem = payload.items?.[0];
      const product = products.find((item) => item.id === selectedItem?.productId);
      const plan = product?.pricingOptions.find((item) => item.id === selectedItem?.pricingOptionId);
      const message = [
        "Вітаю! Хочу оформити замовлення:",
        `Сервіс: ${product?.name ?? "не вибрано"}`,
        `Тариф: ${plan?.label ?? "не вибрано"}${plan ? ` — ${formatPrice(plan)}` : ""}`,
        payload.neededBy ? `Потрібно з: ${payload.neededBy}` : "",
        payload.utmSource ? `Джерело: ${[payload.utmSource, payload.utmMedium, payload.utmCampaign].filter(Boolean).join(" · ")}` : "",
        `Ім'я: ${leadValues.name.trim()}`,
        `Мій контакт: ${leadValues.contact.trim()}`,
        leadValues.message.trim() ? `Коментар: ${leadValues.message.trim()}` : ""
      ]
        .filter(Boolean)
        .join("\n");
      const telegramUrl = new URL(displaySettings.telegramContactUrl);
      telegramUrl.searchParams.set("text", message);
      setLeadTelegramDraftUrl(telegramUrl.toString());
      setLeadSuccess(serverUnavailable
        ? "Сервер заявок тимчасово недоступний, тому заявка не збережена. Відкрий підготовлений текст у Telegram і надішли його продавцю."
        : "Telegram відкриється з підготовленим текстом. Перевір його та натисни «Надіслати» в чаті; заявка не зберігається в адмінці.");
      pushToast(serverUnavailable
        ? "Сервер недоступний — підготував запасний варіант у Telegram."
        : "Підготував заявку для Telegram.", serverUnavailable ? "error" : "success");
    };

    if (isStaticSite && !hasConfiguredLiveApi) {
      prepareTelegramDraft();
      return;
    }

    setLeadSubmitting(true);

    try {
      const lead = await api.createLead(payload);
      const orderNumber = lead.id.slice(0, 8).toUpperCase();
      setLeadOrderId(orderNumber);

      const successMessage = `Заявку збережено в адмінці. Номер: ${orderNumber}.`;
      setLeadSuccess(successMessage);
      pushToast(successMessage, "success");
      setLeadValues({
        name: "",
        contact: "",
        message: "",
        productId: "",
        pricingOptionId: "",
        neededBy: ""
      });
      setLeadErrors({});
    } catch (caughtError) {
      if (isStaticSite) {
        prepareTelegramDraft(true);
        return;
      }

      const message =
        caughtError instanceof ApiError
          ? caughtError.message
          : "Не вдалося відправити заявку.";
      const recoveryMessage = `${message} Дані у формі збережені, можна спробувати ще раз.`;

      setLeadSubmitError(recoveryMessage);
      pushToast(recoveryMessage, "error");
    } finally {
      setLeadSubmitting(false);
    }
  };

  const retryLeadSubmit = async () => {
    const nextErrors = validateLeadForm();
    setLeadErrors(nextErrors);
    setLeadSuccess("");

    if (Object.keys(nextErrors).length > 0) {
      pushToast("Перевір поля форми перед повторною відправкою.", "error");
      return;
    }

    const payload = buildLeadPayload();
    if (!payload) {
      setLeadSubmitError("Не вдалося зібрати заявку для повторної відправки.");
      pushToast("Онови вибір товару й тарифу перед повторною відправкою.", "error");
      return;
    }

    await submitLeadRequest(payload);
  };

  const handleLeadSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextErrors = validateLeadForm();
    setLeadErrors(nextErrors);
    setLeadSuccess("");
    setLeadSubmitError("");

    if (Object.keys(nextErrors).length > 0) {
      pushToast("Перевір поля форми перед відправкою.", "error");
      return;
    }

    const payload = buildLeadPayload();
    if (!payload) {
      setLeadSubmitError("Онови вибір товару й тарифу перед відправкою.");
      pushToast("Онови вибір товару й тарифу перед відправкою.", "error");
      return;
    }

    await submitLeadRequest(payload);
  };

  return (
    <PageShell>
      <header className={`site-header ${isScrolled ? "is-scrolled" : ""}`}>
        <div className="shell">
          <div className="header-row">
            <BrandLink
              href="#top"
              siteName={displaySettings.siteName}
              subtitle="Оренда підписок"
            />

            <nav className="desktop-nav" aria-label="Основна навігація">
              {sectionLinks.map((link) => (
                <a
                  className={activeSection === link.id ? "is-active" : ""}
                  href={`#${link.id}`}
                  key={link.id}
                >
                  {link.label}
                </a>
              ))}
            </nav>

            <div className="header-actions">
              <ThemeToggle />
              <a
                className="primary-button compact"
                href={displaySettings.telegramContactUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
              <button
                className="menu-toggle"
                type="button"
                aria-expanded={menuOpen}
                aria-controls="mobile-menu"
                aria-label={menuOpen ? "Закрити меню" : "Відкрити меню"}
                onClick={() => setMenuOpen((current) => !current)}
              >
                <span></span>
                <span></span>
                <span></span>
              </button>
            </div>
          </div>
        </div>

        {!menuOpen ? null : (
          <div className="mobile-menu" id="mobile-menu">
            <button
              className="mobile-menu-backdrop"
              type="button"
              aria-label="Закрити меню"
              onClick={() => setMenuOpen(false)}
            ></button>
            <div className="mobile-menu-panel">
              <div className="mobile-menu-head">
                <strong>Швидка навігація</strong>
                <p>Усе головне під рукою, без зайвого скролу і пошуку по сторінці.</p>
              </div>

              <nav className="mobile-nav" aria-label="Мобільна навігація">
                {sectionLinks.map((link) => (
                  <a
                    className={activeSection === link.id ? "is-active" : ""}
                    href={`#${link.id}`}
                    key={link.id}
                    onClick={() => setMenuOpen(false)}
                  >
                    <strong>{link.label}</strong>
                    <span>{sectionDescriptions[link.id]}</span>
                  </a>
                ))}
              </nav>

              <div className="mobile-menu-actions">
                <a
                  className="primary-button compact"
                  href="#lead-form"
                  onClick={() => setMenuOpen(false)}
                >
                  Подати заявку
                </a>
                <a
                  className="ghost-button compact"
                  href={displaySettings.telegramContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                >
                  Telegram
                </a>
                {!isStaticSite ? <a
                  className="ghost-button compact mobile-menu-admin-link"
                  href="/admin/login"
                  onClick={() => setMenuOpen(false)}
                >
                  Адмін-панель
                </a> : null}
              </div>

              <div className="mobile-menu-stats">
                {heroFacts.slice(0, 3).map((item) => (
                  <article className="mobile-menu-stat" key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </article>
                ))}
              </div>
            </div>
          </div>
        )}
      </header>

      <main id="top">
        <section className="hero">
          <div className="hero-blur hero-blur-a" aria-hidden="true"></div>
          <div className="hero-blur hero-blur-b" aria-hidden="true"></div>
          <div className="hero-blur hero-blur-c" aria-hidden="true"></div>

          <div className="shell hero-shell">
            <Reveal className="hero-copy">
              <div className="eyebrow">
                <span className="eyebrow-icon">✦</span>
                <span>Найкращі ціни в Україні</span>
              </div>
              <h1 className="hero-title">
                {renderHeroTitle(
                  displaySettings.heroTitle
                )}
              </h1>
              <p className="hero-lead">{displaySettings.heroSubtitle}</p>
              <div className="hero-actions-row">
                <a className="primary-button" href="#catalog">
                  Переглянути каталог
                </a>
                <a
                  className="ghost-button"
                  href={displaySettings.telegramContactUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Написати в Telegram
                </a>
              </div>
              <div className="hero-proof-grid">
                {heroFacts.map((item) => (
                  <article className="hero-proof-card" key={item.label}>
                    <strong>{item.value}</strong>
                    <span>{item.label}</span>
                  </article>
                ))}
              </div>
              <div className="hero-shortcuts">
                {heroShortcutIds.map((sectionId) => {
                  const section = sectionLinks.find((item) => item.id === sectionId);
                  if (!section) {
                    return null;
                  }

                  return (
                    <a className="hero-shortcut-card" href={`#${section.id}`} key={section.id}>
                      <strong>{section.label}</strong>
                      <span>{sectionDescriptions[section.id]}</span>
                    </a>
                  );
                })}
              </div>
            </Reveal>

            <div className="feature-row">
              <article className="feature-card">
                <div className="feature-icon">🛡️</div>
                <div>
                  <h2>Надійно</h2>
                  <p>Зрозуміла структура, фільтри каталогу і заявка з фіксацією тарифу.</p>
                </div>
              </article>
              <article className="feature-card">
                <div className="feature-icon accent">⚡</div>
                <div>
                  <h2>Швидко</h2>
                  <p>Пошук, сортування і мобільні CTA прискорюють шлях до замовлення.</p>
                </div>
              </article>
              <article className="feature-card">
                <div className="feature-icon">🌗</div>
                <div>
                  <h2>Сучасно</h2>
                  <p>Темна тема, плавні переходи і комфортний перегляд з телефона.</p>
                </div>
              </article>
            </div>
          </div>
        </section>

        <section className="section section-light" id="catalog">
          <div className="shell">
            <Reveal className="section-head">
              <span className="section-kicker">Каталог</span>
              <h2>Наш каталог</h2>
              <p>Пошук, категорії і сортування працюють разом. Наявність та остаточну ціну підтверди в менеджера перед оплатою.</p>
              <a
                className="news-channel-link"
                href={displaySettings.telegramContactUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Уточнити ціну й наявність у Telegram ↗
              </a>
            </Reveal>

            {error ? (
              <EmptyState
                title="Не вдалося завантажити каталог"
                description={error}
                action={
                  <button
                    className="primary-button compact"
                    type="button"
                    onClick={() => void loadInitialData()}
                  >
                    Спробувати ще раз
                  </button>
                }
              />
            ) : loading ? (
              <LoadingGrid />
            ) : (
              <>
                <Reveal className="catalog-toolbar">
                  <label className="toolbar-search">
                    <span>Пошук</span>
                    <input
                      placeholder="Наприклад, ChatGPT, Netflix, VPN..."
                      value={searchTerm}
                      onChange={(event) =>
                        updateCatalogParams({ q: event.target.value })
                      }
                    />
                  </label>

                  <label className="toolbar-select">
                    <span>Сортування</span>
                    <select
                      value={sortKey}
                      onChange={(event) =>
                        updateCatalogParams({
                          sort: normalizeSort(event.target.value)
                        })
                      }
                    >
                      {sortOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <button
                    className="ghost-button compact"
                    type="button"
                    onClick={() => setSearchParams({}, { replace: true })}
                  >
                    Скинути
                  </button>
                </Reveal>

                <Reveal className="pill-row">
                  <button
                    className={`filter-pill ${activeCategory === "all" ? "active" : ""}`}
                    type="button"
                    onClick={() => updateCatalogParams({ category: "all" })}
                  >
                    <span>◼</span>
                    <span>Всі</span>
                  </button>
                  {categories.map((category) => (
                    <button
                      className={`filter-pill ${
                        activeCategory === category.id ? "active" : ""
                      }`}
                      key={category.id}
                      type="button"
                      onClick={() => updateCatalogParams({ category: category.id })}
                    >
                      <span>{category.icon}</span>
                      <span>{category.name}</span>
                    </button>
                  ))}
                </Reveal>

                {!activeCatalogFilters.length ? null : (
                  <div className="catalog-active-filters">
                    <div className="catalog-active-filters-head">
                      <strong>Активні фільтри</strong>
                      <span>{activeCatalogFilters.length}</span>
                    </div>
                    <div className="catalog-active-filters-list">
                      {activeCatalogFilters.map((filter) => (
                        <button
                          className="catalog-filter-chip"
                          key={filter.key}
                          type="button"
                          onClick={filter.onClear}
                        >
                          <span>{filter.label}</span>
                          <strong>×</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="catalog-meta">
                  <p>
                    Знайдено <strong>{visibleProducts.length}</strong> із{" "}
                    <strong>{products.length}</strong>
                  </p>
                  <span>
                    {totalReviews ? <>{totalReviews}+ відгуків • </> : null}
                    від{" "}
                    {formatPrice(minimalPrice)}
                  </span>
                </div>

                {!visibleProducts.length ? (
                  <EmptyState
                    title="Нічого не знайдено"
                    description="Спробуй інший пошуковий запит або скинь фільтри каталогу."
                    action={
                      <>
                        <button
                          className="primary-button compact"
                          type="button"
                          onClick={() => setSearchParams({}, { replace: true })}
                        >
                          Показати весь каталог
                        </button>
                        <a
                          className="ghost-button compact"
                          href="#lead-form"
                        >
                          Залишити заявку вручну
                        </a>
                      </>
                    }
                  />
                ) : (
                  <div className="products-grid">
                    {visibleProducts.map((product) => {
                      const lowestPlan = getLowestPlan(product);
                      const bestValuePlan = getBestValuePlan(product);
                      const category = categories.find(
                        (item) => item.id === product.categoryId
                      );

                      return (
                        <Reveal className="product-card" key={product.id}>
                          <div className="product-top">
                            <ProductLogo
                              src={product.logo}
                              alt={product.name}
                              fallback={product.name}
                            />
                            <div className="badge-row">
                              {product.isHot ? <span className="badge hot">Хіт</span> : null}
                              {!bestValuePlan || !getPlanSavings(bestValuePlan) ? null : (
                                <span className="badge savings">
                                  Вигода {formatPrice(getPlanSavings(bestValuePlan), bestValuePlan.currency)}
                                </span>
                              )}
                              <span className="badge outline">
                                {category?.name ?? "Категорія"}
                              </span>
                            </div>
                          </div>

                          <div className="product-meta">
                            <span className="product-category">{category?.name ?? ""}</span>
                            <h3>{product.name}</h3>
                            <p className="product-summary">{product.summary}</p>
                            <a
                              className="product-seo-link"
                              href={preserveUtmAttribution(`${isStaticSite ? staticSiteBasePath : ""}/p/${product.slug}`)}
                            >
                              Окрема сторінка товару ↗
                            </a>
                          </div>

                          <div className="price-box">
                            <div className="price-main">
                              <strong>
                                {lowestPlan ? formatPrice(lowestPlan) : "Тариф скоро"}
                              </strong>
                              {!lowestPlan?.compareAt ? null : (
                                <s>{formatPrice(lowestPlan.compareAt, lowestPlan.currency)}</s>
                              )}
                            </div>
                            <div className="price-copy">
                              <span>
                                {lowestPlan
                                  ? lowestPlan.label.toLowerCase()
                                  : "Очікуємо налаштування тарифу"}
                              </span>
                              {!lowestPlan || !getPlanSavings(lowestPlan) ? null : (
                                <small>Економія {formatPrice(getPlanSavings(lowestPlan), lowestPlan.currency)}</small>
                              )}
                            </div>
                          </div>

                          <div className="product-plans">
                            {getDisplayPlans(product).slice(0, 4).map((plan) => (
                              <span
                                className={`plan-chip ${bestValuePlan?.id === plan.id ? "is-featured" : ""}`}
                                key={plan.id}
                              >
                                <strong>{plan.label}</strong>
                                <span>
                                  {formatPrice(plan)}
                                  {getPlanSavings(plan) > 0
                                    ? ` • економія ${formatPrice(getPlanSavings(plan), plan.currency)}`
                                    : ""}
                                </span>
                              </span>
                            ))}
                          </div>

                          <div className="product-note-row">
                            <span>{getDisplayPlans(product).length} тарифів на вибір</span>
                            <span>Наявність уточнюйте</span>
                          </div>

                          <div className="card-footer">
                            <button
                              className="detail-button"
                              type="button"
                              onClick={() => openProductModal(product)}
                            >
                              Детальніше
                            </button>
                            <button
                              className="cta-button"
                              type="button"
                              onClick={() => startLeadForProduct(product, lowestPlan?.id)}
                              disabled={!lowestPlan}
                            >
                              Замовити
                            </button>
                          </div>
                        </Reveal>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <section className="section" id="faq">
          <div className="shell narrow">
            <Reveal className="section-head">
              <span className="section-kicker">Часті питання</span>
              <h2>Маєте питання?</h2>
              <p>Тут зібрані найпоширеніші відповіді перед замовленням.</p>
            </Reveal>

            {!faqs.length ? (
              <EmptyState
                title="FAQ ще наповнюється"
                description="Якщо потрібна відповідь прямо зараз, залиш заявку або напиши в Telegram."
                action={
                  <>
                    <a className="primary-button compact" href="#lead-form">
                      Подати заявку
                    </a>
                    <a
                      className="ghost-button compact"
                      href={displaySettings.telegramContactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Telegram
                    </a>
                  </>
                }
              />
            ) : (
              <div className="faq-list">
                {faqs.map((item, index) => {
                  const isOpen = openFaqIndex === index;
                  return (
                    <article className={`faq-item ${isOpen ? "is-open" : ""}`} key={item.id}>
                      <button
                        className="faq-question"
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                      >
                        <span className="faq-question-copy">
                          <small className="faq-index">{String(index + 1).padStart(2, "0")}</small>
                          <span>{item.question}</span>
                        </span>
                        <strong>{isOpen ? "−" : "+"}</strong>
                      </button>
                      <div className="faq-answer">
                        <div>
                          <p>{item.answer}</p>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        <section className="section section-light" id="news">
          <div className="shell">
            <Reveal className="section-head">
              <span className="section-kicker">Оновлення</span>
              <h2>Останні новини</h2>
              <p>Публікації з каналу. Автоматична перевірка стрічки — приблизно раз на 30 хвилин.</p>
              {isStaticSite && (
                <p
                  className={`news-feed-status${newsFeedCheckIsStale || latestPostIsStale || !newsFeedFetchedAt ? " is-warning" : ""}`}
                  role="status"
                >
                  {newsFeedFetchedAt
                    ? `Остання автоматична перевірка: ${new Intl.DateTimeFormat("uk-UA", {
                        dateStyle: "medium",
                        timeStyle: "short"
                      }).format(new Date(newsFeedFetchedAt))}.`
                    : "Не вдалося підтвердити час автоматичного оновлення стрічки."}
                  {latestPostDateLabel
                    ? ` Найновіший допис у каналі: ${latestPostDateLabel}.`
                    : ""}
                  {newsFeedCheckIsStale
                    ? " Автооновлення затримується — перевірте канал напряму."
                    : latestPostIsStale
                      ? " Новіших дописів понад 14 днів — актуальні умови перевірте в каналі."
                      : ""}
                </p>
              )}
              <a
                className="news-channel-link"
                href={displaySettings.telegramNewsChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Відкрити канал у Telegram ↗
              </a>
            </Reveal>

            {!news.length ? (
              <EmptyState
                title="Новини скоро з'являться"
                description={
                  isStaticSite
                    ? "Стрічка оновлюється з Telegram автоматично. Переглянь канал, поки оновлення завантажується."
                    : "Коли адміністратор додасть оновлення по сервісах, вони з'являться тут."
                }
                action={
                  <a className="primary-button compact" href="#catalog">
                    Повернутися до каталогу
                  </a>
                }
              />
            ) : (
              <div className="news-grid">
                {news.map((item) => (
                  <Reveal className="news-card" key={item.id}>
                    <div className="news-card-top">
                      <div className="news-mark">📢</div>
                      <div className="news-date">{item.dateLabel}</div>
                    </div>
                    {(() => {
                      const expiry = getTelegramPromotionExpiry(item.title, item.publishedAt);
                      if (!expiry) return null;
                      const expired = expiry.getTime() < Date.now();
                      const expiryLabel = new Intl.DateTimeFormat("uk-UA", {
                        day: "numeric",
                        month: "long"
                      }).format(expiry);
                      return (
                        <span className={`news-expiry${expired ? " is-expired" : ""}`}>
                          {expired ? "Архівна акція · завершилась " : "Акція до "}
                          {expiryLabel}
                        </span>
                      );
                    })()}
                    <h3>{item.title}</h3>
                    <p>{item.content}</p>
                    <div className="news-card-footer">
                      <span>{item.sourceType === "telegram" ? "Публікація каналу" : "Оновлення для замовлення"}</span>
                      {item.sourceUrl ? (
                        <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                          Джерело в Telegram ↗
                        </a>
                      ) : (
                        <span>Актуальний публічний статус</span>
                      )}
                    </div>
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="section" id="lead-form">
          <div className="shell">
            <Reveal className="lead-panel">
              <div className="section-head">
                <span className="section-kicker">Заявка</span>
                <h2>{displaySettings.leadTitle}</h2>
                <p>{displaySettings.leadSubtitle}</p>
              </div>

              <div className="lead-flow-grid">
                {leadFlowSteps.map((step, index) => (
                  <article className="lead-flow-card" key={step.title}>
                    <strong>{step.title}</strong>
                    <p>
                      {isStaticSite && index === 2
                        ? "Перевір підготовлений текст і надішли його менеджеру в Telegram."
                        : step.description}
                    </p>
                  </article>
                ))}
              </div>

              {!leadQuickProducts.length ? null : (
                <div className="lead-quick-picks">
                  <strong>Швидкий вибір</strong>
                  <div className="lead-quick-picks-list">
                    {leadQuickProducts.map((product) => {
                      const lowestPlan = getLowestPlan(product);
                      if (!lowestPlan) {
                        return null;
                      }

                      const isCurrent =
                        selectedLeadProduct?.id === product.id &&
                        selectedLeadPlan?.id === lowestPlan.id;

                      return (
                        <button
                          className={`lead-quick-pick ${isCurrent ? "is-active" : ""}`}
                          key={product.id}
                          type="button"
                          onClick={() => startLeadForProduct(product, lowestPlan.id)}
                        >
                          <span>
                            {product.name}
                            {getPlanSavings(lowestPlan) > 0
                              ? ` • економія ${formatPrice(getPlanSavings(lowestPlan), lowestPlan.currency)}`
                              : ""}
                          </span>
                          <strong>{formatPrice(lowestPlan)}</strong>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <form className="lead-form" ref={leadRef} noValidate onSubmit={handleLeadSubmit}>
                <div className="lead-readiness">
                  <div className="lead-readiness-head">
                    <strong>Готовність заявки</strong>
                    <span>{leadReadyCount}/4</span>
                  </div>
                  <div className="lead-readiness-grid">
                    {leadReadiness.map((item) => (
                      <div
                        className={`lead-readiness-item ${item.ready ? "is-ready" : ""}`}
                        key={item.key}
                      >
                        <strong>{item.ready ? "✓" : "•"}</strong>
                        <span>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <label className={leadErrors.name ? "is-invalid" : ""}>
                  Ім'я
                  <input
                    aria-invalid={Boolean(leadErrors.name)}
                    className={leadErrors.name ? "is-invalid" : ""}
                    value={leadValues.name}
                    onChange={(event) => updateLeadTextField("name", event.target.value)}
                    placeholder="Як до тебе звертатися"
                  />
                  {!leadErrors.name ? null : (
                    <span className="field-error">{leadErrors.name}</span>
                  )}
                </label>

                <label className={leadErrors.contact ? "is-invalid" : ""}>
                  Контакт
                  <input
                    aria-invalid={Boolean(leadErrors.contact)}
                    className={leadErrors.contact ? "is-invalid" : ""}
                    value={leadValues.contact}
                    onChange={(event) => updateLeadTextField("contact", event.target.value)}
                    placeholder="Telegram, email або номер"
                  />
                  {!leadErrors.contact ? null : (
                    <span className="field-error">{leadErrors.contact}</span>
                  )}
                  {leadErrors.contact ? null : (
                    <small className={`field-hint field-hint-${contactFieldHint.tone}`}>
                      {contactFieldHint.text}
                    </small>
                  )}
                </label>

                <label className={leadErrors.productId ? "is-invalid" : ""}>
                  Товар
                  <select
                    aria-invalid={Boolean(leadErrors.productId)}
                    className={leadErrors.productId ? "is-invalid" : ""}
                    value={leadValues.productId}
                    onChange={(event) => updateLeadProductSelection(event.target.value)}
                  >
                    <option value="">Оберіть товар</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                  {!leadErrors.productId ? null : (
                    <span className="field-error">{leadErrors.productId}</span>
                  )}
                </label>

                <label className={leadErrors.pricingOptionId ? "is-invalid" : ""}>
                  Тариф
                  <select
                    aria-invalid={Boolean(leadErrors.pricingOptionId)}
                    className={leadErrors.pricingOptionId ? "is-invalid" : ""}
                    disabled={!selectedLeadProduct}
                    value={leadValues.pricingOptionId}
                    onChange={(event) => updateLeadPlanSelection(event.target.value)}
                  >
                    <option value="">Оберіть тариф</option>
                    {selectedLeadPlans.map((plan) => (
                      <option key={plan.id} value={plan.id}>
                        {plan.label} — {formatPrice(plan)}
                        {getPlanSavings(plan) > 0
                          ? ` • економія ${formatPrice(getPlanSavings(plan), plan.currency)}`
                          : ""}
                      </option>
                    ))}
                  </select>
                  {!leadErrors.pricingOptionId ? null : (
                    <span className="field-error">{leadErrors.pricingOptionId}</span>
                  )}
                </label>

                <label>
                  Коли потрібна підписка? <span className="field-optional">необов'язково</span>
                  <input
                    aria-label="Коли потрібна підписка"
                    type="date"
                    min={getTodayDateInputValue()}
                    value={leadValues.neededBy}
                    onChange={(event) => updateLeadTextField("neededBy", event.target.value)}
                  />
                </label>

                <label>
                  Повідомлення
                  <textarea
                    rows={5}
                    value={leadValues.message}
                    onChange={(event) => updateLeadTextField("message", event.target.value)}
                    placeholder="Що саме потрібно, на який термін, чи є питання"
                  />
                </label>

                <div
                  className={`lead-summary ${selectedLeadProduct && selectedLeadPlan ? "lead-summary-selected" : ""}`}
                >
                  <div className="lead-summary-row">
                    <div>
                      <strong>Поточний вибір</strong>
                      <span>
                        {selectedLeadProduct && selectedLeadPlan
                          ? `${selectedLeadProduct.name} — ${selectedLeadPlan.label}`
                          : "Ще не вибрано товар і тариф"}
                      </span>
                    </div>
                    {!selectedLeadProduct || !selectedLeadPlan ? null : (
                      <button
                        className="ghost-button compact"
                        type="button"
                        onClick={clearLeadSelection}
                      >
                        Очистити
                      </button>
                    )}
                  </div>
                  {!selectedLeadProduct || !selectedLeadPlan ? (
                    <small>Можна вибрати сервіс у каталозі або скористатися швидкими кнопками вище.</small>
                  ) : (
                    <div className="lead-summary-meta">
                      <span>{selectedLeadCategory || "Підписка"} • {formatPrice(selectedLeadPlan)}</span>
                      {selectedLeadSavings > 0 ? (
                        <span>Економія {formatPrice(selectedLeadSavings, selectedLeadPlan.currency)}</span>
                      ) : (
                        <span>Тариф уже готовий до відправки</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="lead-summary lead-summary-soft">
                  <strong>Що далі</strong>
                  <span>
                    {isStaticSite && !hasConfiguredLiveApi
                      ? "Після натискання Telegram відкриє чернетку з вибраним товаром і твоїм контактом. Повідомлення надішлеться лише після твого підтвердження."
                      : isStaticSite
                        ? "Заявка надійде на сервер і з'явиться в адмінці. Якщо сервер тимчасово недоступний, підготуємо запасний текст для Telegram."
                      : "Після відправки заявка збережеться в адмінці, а для швидкого зв'язку можна одразу написати в Telegram."}
                  </span>
                </div>

                {!leadSubmitError ? null : (
                  <NoticePanel
                    className="lead-submit-error"
                    title="Не вдалося відправити заявку"
                    description={leadSubmitError}
                    tone="danger"
                    action={
                      <button
                        className="ghost-button compact"
                        type="button"
                        disabled={leadSubmitting}
                        onClick={() => void retryLeadSubmit()}
                      >
                        Повторити відправку
                      </button>
                    }
                  />
                )}

                {!leadSuccess ? null : (
                  <NoticePanel
                    className="form-success"
                    title={leadTelegramDraftUrl ? "Заявка готова до відправлення" : "Заявку прийнято"}
                    description={leadSuccess}
                    tone={leadTelegramDraftUrl && hasConfiguredLiveApi ? "warning" : "success"}
                    action={
                      leadTelegramDraftUrl ? (
                        <a
                          className="primary-button compact"
                          href={leadTelegramDraftUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Перевірити й надіслати в Telegram ↗
                        </a>
                      ) : leadOrderId ? (
                        <a
                          className="primary-button compact"
                          href={`${displaySettings.telegramContactUrl}?text=${encodeURIComponent(`Вітаю! Пишу щодо заявки №${leadOrderId}.`)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Написати менеджеру ↗
                        </a>
                      ) : undefined
                    }
                  />
                )}

                <div className="lead-actions">
                  <button className="primary-button" type="submit" disabled={leadSubmitting}>
                    {leadSubmitting
                      ? "Відправлення..."
                      : leadReadyCount === leadReadiness.length
                        ? "Надіслати готову заявку"
                        : "Надіслати заявку"}
                  </button>
                  <a
                    className="ghost-button"
                    href={displaySettings.telegramContactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Написати в Telegram
                  </a>
                </div>
              </form>
            </Reveal>
          </div>
        </section>

        <section className="section" id="reviews">
          <div className="shell">
            <Reveal className="section-head">
              <span className="section-kicker">Відгуки</span>
              <h2>Що кажуть клієнти</h2>
              <p>Реальні відгуки клієнтів зібрані в нашому Telegram-каналі.</p>
            </Reveal>

            {!reviews.length ? (
              <div className="reviews-spotlight">
                <div className="reviews-spotlight-icon" aria-hidden="true">💬</div>
                <div className="reviews-spotlight-copy">
                  <span className="reviews-spotlight-label">Відгуки клієнтів · Telegram</span>
                  <h3>Переконайся на досвіді інших</h3>
                  <p>Переглянь відгуки в нашому каналі перед замовленням. На сайті показуємо лише відгуки, які пройшли модерацію.</p>
                  <a
                    className="reviews-channel-url"
                    href="https://t.me/cherepashka_vidguk"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Відкрити канал відгуків @cherepashka_vidguk у Telegram"
                  >
                    @cherepashka_vidguk ↗
                  </a>
                </div>
                <div className="reviews-spotlight-actions">
                  <a
                    className="primary-button compact"
                    href="https://t.me/cherepashka_vidguk"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Переглянути відгуки
                  </a>
                  <a className="ghost-button compact" href="#lead-form">
                    Запитати менеджера
                  </a>
                </div>
              </div>
            ) : (
              <div className="reviews-track">
                {reviews.map((review) => (
                  <Reveal className="review-card" key={review.id}>
                    <div className="review-card-head">
                      <div className="review-author">
                        <span className="review-avatar">{getReviewInitials(review.name)}</span>
                        <div>
                          <h3>{review.name}</h3>
                          <small>{formatReviewDate(review.createdAt)}</small>
                        </div>
                      </div>
                      <span className="review-badge">Перевірений відгук</span>
                    </div>
                    <div className="review-rating">{"★".repeat(review.rating)}</div>
                    <p>{review.content}</p>
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="shell">
          <div className="footer-grid">
            <div>
              <div className="brand footer-brand">
                <span className="brand-mark">🐢</span>
                <span className="brand-copy">
                  <strong>{displaySettings.siteName}</strong>
                  <small>Оренда підписок</small>
                </span>
              </div>
              <p className="footer-copy">{displaySettings.footerDescription}</p>
            </div>

            <div>
              <h3>Навігація</h3>
              <ul className="footer-links">
                {sectionLinks.map((link) => (
                  <li key={link.id}>
                    <a href={`#${link.id}`}>{link.label}</a>
                  </li>
                ))}
                {!isStaticSite ? <li><a href="/admin/login">Адмін-панель</a></li> : null}
              </ul>
            </div>

            <div>
              <h3>Зв'язок</h3>
              <p className="footer-copy">
                Для замовлення або питань звертайтесь у Telegram.
              </p>
              <a
                className="primary-button compact"
                href={displaySettings.telegramContactUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Написати в Telegram
              </a>
              <a
                className="ghost-button compact"
                href={displaySettings.telegramNewsChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Наш Telegram-канал
              </a>
            </div>
          </div>

          <div className="footer-bottom">
            <p>
              © {new Date().getFullYear()} {displaySettings.siteName}. Всі права
              захищені.
            </p>
            <p className="footer-legal-links">
              <a href={`${isStaticSite ? staticSiteBasePath : ""}/legal/privacy`}>Конфіденційність</a>
              <a href={`${isStaticSite ? staticSiteBasePath : ""}/legal/terms`}>Умови оренди</a>
              <a href={`${isStaticSite ? staticSiteBasePath : ""}/legal/refund`}>Заміна та повернення</a>
              <a href={`${isStaticSite ? staticSiteBasePath : ""}/legal/contacts`}>Контакти</a>
            </p>
          </div>
        </div>
      </footer>

      {!selectedLeadProduct || !selectedLeadPlan ? null : (
        <div className="desktop-selection-bar">
          <div className="desktop-selection-copy">
            <span>Готово до заявки</span>
            <strong>{selectedLeadProduct.name} · {selectedLeadPlan.label}</strong>
            <small>
              {selectedLeadCategory || "Підписка"} • {formatPrice(selectedLeadPlan)}
              {selectedLeadSavings > 0 ? ` • Економія ${formatPrice(selectedLeadSavings, selectedLeadPlan.currency)}` : ""}
            </small>
          </div>
          <div className="desktop-selection-actions">
            <button className="ghost-button compact" type="button" onClick={() => void copySelectionLink()}>
              Копіювати лінк
            </button>
            <button className="ghost-button compact" type="button" onClick={clearLeadSelection}>
              Очистити
            </button>
            <a className="primary-button compact" href="#lead-form">
              До заявки
            </a>
          </div>
        </div>
      )}

      <div className={`mobile-cta ${selectedLeadProduct && selectedLeadPlan ? "has-selection" : ""}`}>
        {!selectedLeadProduct || !selectedLeadPlan ? null : (
          <div className="mobile-cta-summary">
            <div>
              <strong>{selectedLeadProduct.name} · {selectedLeadPlan.label}</strong>
              <span>{formatPrice(selectedLeadPlan)}</span>
            </div>
            <button className="ghost-button compact" type="button" onClick={clearLeadSelection}>
              Очистити
            </button>
          </div>
        )}
        <a className="primary-button compact" href="#lead-form">
          {selectedLeadProduct && selectedLeadPlan ? "Оформити вибір" : "Подати заявку"}
        </a>
        <a
          className="ghost-button compact"
          href={displaySettings.telegramContactUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Telegram
        </a>
      </div>

      {!showScrollTop ? null : (
        <button
          className="scroll-top-button"
          type="button"
          aria-label="Повернутися нагору"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        >
          ↑
        </button>
      )}

      <div className={`modal ${selectedProduct ? "is-open" : ""}`} aria-hidden={!selectedProduct}>
        <div className="modal-backdrop" onClick={() => setSelectedProductId(null)}></div>
        {!selectedProduct ? null : (
          <div
            className="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
          >
            <button
              className="modal-close"
              type="button"
              aria-label="Закрити"
              onClick={() => setSelectedProductId(null)}
            >
              ×
            </button>
            <div className="modal-header">
              <ProductLogo
                src={selectedProduct.logo}
                alt={selectedProduct.name}
                fallback={selectedProduct.name}
              />
              <div className="modal-title-wrap">
                <span className="product-category">
                  {categories.find((item) => item.id === selectedProduct.categoryId)?.name ?? ""}
                </span>
                <h2 id="modal-title">{selectedProduct.name}</h2>
              </div>
            </div>

            <p className="modal-summary">{selectedProduct.summary}</p>

            <div className="modal-grid">
              <div>
                <h3>Що входить</h3>
                <ul className="detail-list">
                  {selectedProduct.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Тариф</h3>
                {!selectedProductPlans.length ? (
                  <EmptyState
                    title="Тарифи ще не налаштовані"
                    description="Напиши нам у Telegram, якщо хочеш забронювати цей сервіс раніше."
                  />
                ) : (
                  <div className="modal-plan-list">
                    {selectedProductPlans.map((plan) => (
                      <button
                        className={`modal-plan-option ${
                          selectedPlanId === plan.id ? "is-active" : ""
                        }`}
                        key={plan.id}
                        type="button"
                        onClick={() => setSelectedPlanId(plan.id)}
                      >
                        <span>
                          <strong>{plan.label}</strong>
                          <small>
                            {selectedProduct.name}
                            {getPlanSavings(plan) > 0
                              ? ` • економія ${formatPrice(getPlanSavings(plan), plan.currency)}`
                              : ""}
                          </small>
                          {bestModalPlan?.id !== plan.id ? null : (
                            <small className="modal-plan-flag">Найвигідніший варіант</small>
                          )}
                        </span>
                        <span>
                          <strong>{formatPrice(plan)}</strong>
                          {!plan.compareAt ? null : <s>{formatPrice(plan.compareAt, plan.currency)}</s>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {!selectedModalPlan ? null : (
              <div className="modal-selection-card">
                <div>
                  <strong>{selectedModalPlan.label}</strong>
                  <span>
                    Вибраний тариф для швидкого оформлення заявки
                    {getPlanSavings(selectedModalPlan) > 0
                      ? ` • економія ${formatPrice(getPlanSavings(selectedModalPlan), selectedModalPlan.currency)}`
                      : ""}
                  </span>
                </div>
                <div className="modal-selection-price">
                  <strong>{formatPrice(selectedModalPlan)}</strong>
                  {!selectedModalPlan.compareAt ? null : (
                    <s>{formatPrice(selectedModalPlan.compareAt, selectedModalPlan.currency)}</s>
                  )}
                </div>
              </div>
            )}

            <div className="modal-note-row">
              <span>{selectedProductPlans.length} тарифів доступно</span>
              <span>Після заявки ми підтвердимо деталі в Telegram</span>
            </div>

            <div className="modal-actions">
              <button
                className="primary-button"
                type="button"
                onClick={() => startLeadForProduct(selectedProduct, selectedPlanId)}
                disabled={!selectedProductPlans.length}
              >
                Замовити через заявку
              </button>
              <a
                className="ghost-button"
                href={displaySettings.telegramContactUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Написати в Telegram
              </a>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
