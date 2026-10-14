import type {
  BulkActionPayload,
  BulkMutationResult,
  Category,
  CreateLeadInput,
  FaqItem,
  Lead,
  LeadStatus,
  NewsItem,
  Product,
  Review,
  SiteSettings,
  TelegramWebhookEvent
} from "./types";
import type { AdminSessionResponse } from "./types";
import {
  seedCategories,
  seedFaqs,
  seedNews,
  seedProducts,
  seedReviews,
  seedSiteSettings
} from "../shared/seedData";

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
        (text && !isJson ? text.slice(0, 180) : "Помилка запиту."),
      response.status
    );
  }

  return (isJson ? data : (text as T)) as T;
}

const defaultGetTimeoutMs = 10000;
const defaultMutationTimeoutMs = 15000;
export const staticSiteBasePath = "/orenda-cherepashka";
export const isStaticSite = import.meta.env.VITE_STATIC_SITE === "true";
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

  if (isStaticSite) {
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
    const response = await fetch(path, {
      credentials: "same-origin",
      cache: method === "GET" ? "no-store" : init?.cache,
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    return parseResponse<T>(response);
  } catch (error) {
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
    if (!admin && isStaticSite) {
      try {
        const response = await fetch(`${staticSiteBasePath}/telegram-news.json`, {
          cache: "no-store"
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
          if (feed.items?.length) return feed.items;
        }
      } catch {
        // Fall back to the bundled news if the generated channel feed is unavailable.
      }
      staticNewsFeedFetchedAt = null;
    }
    return apiRequest<NewsItem[]>(admin ? "/api/admin/news" : "/api/news");
  },
  getReviews: (admin = false) =>
    apiRequest<Review[]>(admin ? "/api/admin/reviews" : "/api/reviews"),
  getLeads: () => apiRequest<Lead[]>("/api/admin/leads"),
  createLead: (payload: CreateLeadInput) =>
    apiRequest<Lead>("/api/leads", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getAdminSession: () =>
    apiRequest<AdminSessionResponse>("/api/admin/session"),
  login: (password: string) =>
    apiRequest<AdminSessionResponse>("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password })
    }),
  logout: () =>
    apiRequest<AdminSessionResponse>("/api/admin/logout", { method: "POST" }),
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
  updateSettings: (payload: Partial<SiteSettings>) =>
    apiRequest<SiteSettings>("/api/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(payload)
    })
};
