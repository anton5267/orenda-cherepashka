import type {
  BulkActionPayload,
  BulkMutationResult,
  AnalyticsSummary,
  Category,
  CreateLeadInput,
  FaqItem,
  Lead,
  LeadStatus,
  NewsItem,
  Product,
  PublicAnalyticsEventInput,
  Review,
  SiteSettings,
  TelegramWebhookEvent
} from "./types";
import type { AdminSessionResponse } from "./types";
import {
  getSupabaseClient,
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl
} from "./supabase";
import {
  seedCategories,
  seedFaqs,
  seedNews,
  seedProducts,
  seedReviews,
  seedSiteSettings
} from "../shared/seedData";
import { mergeTelegramNews } from "./newsFeed";
import { createSupabaseApiHeaders } from "../supabase/functions/_shared/supabaseApiKeyHeaders";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const data = text && isJson ? (JSON.parse(text) as T & { message?: string }) : null;

  if (!response.ok) {
    throw new ApiError(
      (data as { message?: string } | null)?.message ??
        (isJson ? "Помилка запиту." : "Сервер тимчасово недоступний. Спробуй ще раз."),
      response.status
    );
  }

  return (isJson ? data : (text as T)) as T;
}

const defaultGetTimeoutMs = 10000;
const defaultMutationTimeoutMs = 15000;
export const isStaticSite = import.meta.env.VITE_STATIC_SITE === "true";
export const staticSiteBasePath = isStaticSite
  ? import.meta.env.BASE_URL.replace(/\/+$/, "")
  : "";
export { isSupabaseConfigured };
const liveApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
export const hasConfiguredLiveApi = Boolean(liveApiBaseUrl) || isSupabaseConfigured;
let staticNewsFeedFetchedAt: string | null = null;

export function getStaticNewsFeedFetchedAt() {
  return staticNewsFeedFetchedAt;
}

function staticPublicRequest<T>(path: string, method: string): T {
  if (method === "GET") {
    const publicData: Record<string, unknown> = {
      "/api/site": seedSiteSettings,
      "/api/categories": seedCategories.filter((item) => item.isActive),
      "/api/products": seedProducts
        .filter((item) => item.isActive)
        .map((product) => ({
          ...product,
          pricingOptions: product.pricingOptions.map((plan, index) => ({
            ...plan,
            id: `${product.id}-plan-${index + 1}`
          }))
        })),
      "/api/faqs": seedFaqs.filter((item) => item.isActive),
      "/api/news": seedNews.filter((item) => item.isActive),
      "/api/news/excluded": [],
      "/api/reviews": seedReviews.filter((item) => item.isActive && item.isModerated)
    };

    if (path in publicData) {
      return publicData[path] as T;
    }
  }

  throw new ApiError(
    "Ця функція доступна після підключення серверної версії сайту.",
    501
  );
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const method = init?.method?.toUpperCase() ?? "GET";
  if (isSupabaseConfigured) {
    const timeoutMs = method === "GET" ? 30000 : 45000;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

    if (init?.signal) {
      if (init.signal.aborted) controller.abort();
      else init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }

    try {
      const supabase = await getSupabaseClient();
      const isAdminPath = path.startsWith("/api/admin/");
      const functionName = isAdminPath ? "orenda-admin" : "orenda-public";
      const sessionResult = isAdminPath ? await supabase.auth.getSession() : null;
      const accessToken = sessionResult?.data.session?.access_token;
      const headers = createSupabaseApiHeaders(supabasePublishableKey, accessToken, init?.headers);
      if (init?.body != null && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      const response = await fetch(
        `${supabaseUrl}/functions/v1/${functionName}?path=${encodeURIComponent(path)}`,
        {
          ...init,
          credentials: "omit",
          cache: "no-store",
          signal: controller.signal,
          headers
        }
      );
      return await parseResponse<T>(response);
    } catch (error) {
      if (
        isStaticSite &&
        method === "GET" &&
        !path.startsWith("/api/admin/") &&
        ["/api/site", "/api/categories", "/api/products", "/api/faqs", "/api/news", "/api/news/excluded", "/api/reviews"].includes(path)
      ) {
        return staticPublicRequest<T>(path, method);
      }
      if (error instanceof ApiError) throw error;
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ApiError("Запит перевищив час очікування. Спробуй ще раз.", 408);
      }
      if (error instanceof TypeError) {
        throw new ApiError("Не вдалося зв'язатися з Supabase. Перевір з'єднання і спробуй ще раз.", 0);
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  const staticRemoteReadPaths = new Set([
    "/api/site",
    "/api/categories",
    "/api/products",
    "/api/faqs",
    "/api/news",
    "/api/news/excluded",
    "/api/reviews"
  ]);
  const canUseRemoteApi =
    isStaticSite &&
    hasConfiguredLiveApi &&
    ((method === "GET" && staticRemoteReadPaths.has(path)) ||
      (method === "POST" && ["/api/leads", "/api/analytics/events"].includes(path)));

  if (isStaticSite && !canUseRemoteApi) {
    return staticPublicRequest<T>(path, method);
  }

  const timeoutMs = method === "GET" ? defaultGetTimeoutMs : defaultMutationTimeoutMs;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  if (init?.signal) {
    if (init.signal.aborted) {
      controller.abort();
    } else {
      init.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const headers = new Headers(init?.headers);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const requestUrl = canUseRemoteApi ? `${liveApiBaseUrl}${path}` : path;
    const response = await fetch(requestUrl, {
      credentials: isStaticSite ? "omit" : "same-origin",
      cache: method === "GET" ? "no-store" : init?.cache,
      ...init,
      signal: controller.signal,
      headers
    });

    return await parseResponse<T>(response);
  } catch (error) {
    if (isStaticSite && canUseRemoteApi && method === "GET") {
      return staticPublicRequest<T>(path, method);
    }

    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError(
        "Запит перевищив час очікування. Спробуй ще раз.",
        408
      );
    }

    if (error instanceof TypeError) {
      throw new ApiError(
        "Не вдалося зв'язатися з сервером. Перевір з'єднання і спробуй ще раз.",
        0
      );
    }

    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const api = {
  getSite: () => apiRequest<SiteSettings>("/api/site"),
  getCategories: (admin = false) =>
    apiRequest<Category[]>(admin ? "/api/admin/categories" : "/api/categories"),
  getProducts: (admin = false) =>
    apiRequest<Product[]>(admin ? "/api/admin/products" : "/api/products"),
  getFaqs: (admin = false) =>
    apiRequest<FaqItem[]>(admin ? "/api/admin/faqs" : "/api/faqs"),
  getNews: async (admin = false) => {
    if (admin) return apiRequest<NewsItem[]>("/api/admin/news");

    let channelItems: NewsItem[] = [];
    if (isStaticSite) {
      try {
        const response = await fetch(`${staticSiteBasePath}/telegram-news.json`, {
          cache: "no-store",
          signal: AbortSignal.timeout(10000)
        });
        if (response.ok) {
          const feed = (await response.json()) as {
            fetchedAt?: string;
            items?: NewsItem[];
          };
          staticNewsFeedFetchedAt =
            typeof feed.fetchedAt === "string" && Number.isFinite(Date.parse(feed.fetchedAt))
              ? feed.fetchedAt
              : null;
          channelItems = Array.isArray(feed.items)
            ? feed.items.filter((item) => item && item.isActive !== false && item.sourceType === "telegram")
            : [];
        } else {
          staticNewsFeedFetchedAt = null;
        }
      } catch {
        // The database or bundled catalog remains available if the generated channel feed is unavailable.
        staticNewsFeedFetchedAt = null;
      }
    }

    const [storedNews, excludedSources] = await Promise.all([
      apiRequest<NewsItem[]>("/api/news"),
      isSupabaseConfigured
        ? apiRequest<Array<{ sourceUrl?: string | null; sourceMessageId?: number | null }>>("/api/news/excluded")
        : Promise.resolve([])
    ]);
    return mergeTelegramNews(storedNews, channelItems, excludedSources);
  },
  getReviews: (admin = false) =>
    apiRequest<Review[]>(admin ? "/api/admin/reviews" : "/api/reviews"),
  getLeads: () => apiRequest<Lead[]>("/api/admin/leads"),
  createLead: (payload: CreateLeadInput) =>
    apiRequest<Lead>("/api/leads", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getAdminSession: async () => {
    if (!isSupabaseConfigured) return apiRequest<AdminSessionResponse>("/api/admin/session");
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new ApiError(error.message, 401);
    if (!data.session) return { authenticated: false };
    try {
      return await apiRequest<AdminSessionResponse>("/api/admin/session");
    } catch (caughtError) {
      if (caughtError instanceof ApiError && [401, 403].includes(caughtError.status)) {
        return { authenticated: false };
      }
      throw caughtError;
    }
  },
  login: async (identifier: string, password?: string) => {
    if (!isSupabaseConfigured) {
      return apiRequest<AdminSessionResponse>("/api/admin/login", {
        method: "POST",
        body: JSON.stringify({ password: identifier })
      });
    }
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email: identifier, password: password ?? "" });
    if (error) throw new ApiError(error.message, error.status ?? 401);
    try {
      const session = await apiRequest<AdminSessionResponse>("/api/admin/session");
      if (!session.authenticated) throw new ApiError("Цей акаунт не має прав адміністратора.", 403);
      return session;
    } catch (error) {
      await supabase.auth.signOut();
      throw error;
    }
  },
  logout: async () => {
    if (!isSupabaseConfigured) {
      return apiRequest<AdminSessionResponse>("/api/admin/logout", { method: "POST" });
    }
    const supabase = await getSupabaseClient();
    const { error } = await supabase.auth.signOut();
    if (error) throw new ApiError(error.message, 500);
    return { authenticated: false };
  },
  createCategory: (payload: Partial<Category>) =>
    apiRequest<Category>("/api/admin/categories", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateCategory: (id: string, payload: Partial<Category>) =>
    apiRequest<Category>(`/api/admin/categories/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteCategory: (id: string) =>
    apiRequest<void>(`/api/admin/categories/${id}`, { method: "DELETE" }),
  createProduct: (payload: Partial<Product>) =>
    apiRequest<Product>("/api/admin/products", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateProduct: (id: string, payload: Partial<Product>) =>
    apiRequest<Product>(`/api/admin/products/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteProduct: (id: string) =>
    apiRequest<void>(`/api/admin/products/${id}`, { method: "DELETE" }),
  bulkProducts: (payload: BulkActionPayload) =>
    apiRequest<BulkMutationResult>("/api/admin/products/bulk", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createFaq: (payload: Partial<FaqItem>) =>
    apiRequest<FaqItem>("/api/admin/faqs", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateFaq: (id: string, payload: Partial<FaqItem>) =>
    apiRequest<FaqItem>(`/api/admin/faqs/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteFaq: (id: string) =>
    apiRequest<void>(`/api/admin/faqs/${id}`, { method: "DELETE" }),
  bulkFaqs: (payload: BulkActionPayload) =>
    apiRequest<BulkMutationResult>("/api/admin/faqs/bulk", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createNews: (payload: Partial<NewsItem>) =>
    apiRequest<NewsItem>("/api/admin/news", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateNews: (id: string, payload: Partial<NewsItem>) =>
    apiRequest<NewsItem>(`/api/admin/news/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteNews: (id: string) =>
    apiRequest<void>(`/api/admin/news/${id}`, { method: "DELETE" }),
  bulkNews: (payload: BulkActionPayload) =>
    apiRequest<BulkMutationResult>("/api/admin/news/bulk", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  createReview: (payload: Partial<Review>) =>
    apiRequest<Review>("/api/admin/reviews", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateReview: (id: string, payload: Partial<Review>) =>
    apiRequest<Review>(`/api/admin/reviews/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  deleteReview: (id: string) =>
    apiRequest<void>(`/api/admin/reviews/${id}`, { method: "DELETE" }),
  bulkReviews: (payload: BulkActionPayload) =>
    apiRequest<BulkMutationResult>("/api/admin/reviews/bulk", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  updateLeadStatus: (id: string, status: LeadStatus) =>
    apiRequest<Lead>(`/api/admin/leads/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    }),
  bulkLeads: (payload: BulkActionPayload) =>
    apiRequest<BulkMutationResult>("/api/admin/leads/bulk", {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),
  getSettings: () => apiRequest<SiteSettings>("/api/admin/settings"),
  getTelegramEvents: () => apiRequest<TelegramWebhookEvent[]>("/api/admin/telegram/events"),
  getAnalytics: () => apiRequest<AnalyticsSummary>("/api/admin/analytics"),
  trackEvent: (payload: PublicAnalyticsEventInput) => {
    if (typeof navigator !== "undefined" && (
      navigator.doNotTrack === "1" || Reflect.get(navigator, "globalPrivacyControl") === true
    )) {
      return Promise.resolve();
    }

    return apiRequest<void>("/api/analytics/events", {
      method: "POST",
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(() => undefined);
  },
  updateSettings: (payload: Partial<SiteSettings>) =>
    apiRequest<SiteSettings>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    })
};
