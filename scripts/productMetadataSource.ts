import { seedProducts } from "../shared/seedData.js";
import type { Product, PricingOption } from "../shared/models.js";
import { createSupabaseApiHeaders } from "../supabase/functions/_shared/supabaseApiKeyHeaders.js";
import { fetchWithNetworkRetries } from "./liveMetadataFetch.js";

export type ProductMetadataRecord = Pick<Product, "name" | "slug" | "summary" | "logo" | "isActive" | "pricingOptions">;
type MetadataPrice = Pick<PricingOption, "label" | "price" | "currency" | "sortOrder" | "isActive">;
type MetadataSourceMode = "auto" | "live" | "seed";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isMetadataPrice(value: unknown): value is MetadataPrice {
  if (!isRecord(value)) return false;
  return typeof value.label === "string" && typeof value.price === "number" && Number.isFinite(value.price) && value.price >= 0 &&
    (value.currency === "UAH" || value.currency === "USD") &&
    typeof value.sortOrder === "number" && Number.isFinite(value.sortOrder) &&
    typeof value.isActive === "boolean";
}

function isMetadataProduct(value: unknown): value is ProductMetadataRecord {
  if (!isRecord(value)) return false;
  return typeof value.name === "string" && value.name.trim().length > 0 &&
    typeof value.slug === "string" && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(value.slug) &&
    typeof value.summary === "string" && typeof value.logo === "string" &&
    typeof value.isActive === "boolean" && Array.isArray(value.pricingOptions) &&
    value.pricingOptions.every(isMetadataPrice);
}

function seedCatalog(): ProductMetadataRecord[] {
  return seedProducts.filter((product) => product.isActive);
}

export async function loadProductsForMetadata(options: {
  supabaseUrl?: string;
  publishableKey?: string;
  mode?: MetadataSourceMode;
  fetcher?: typeof fetch;
}): Promise<ProductMetadataRecord[]> {
  const mode = options.mode ?? "auto";
  if (mode === "seed") return seedCatalog();

  const configuredUrl = options.supabaseUrl?.trim() ?? "";
  const publishableKey = options.publishableKey?.trim() ?? "";
  if (!configuredUrl && !publishableKey && mode === "auto") return seedCatalog();
  if (!configuredUrl || !publishableKey) {
    throw new Error("Both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are required for live product metadata.");
  }
  if (publishableKey.startsWith("sb_secret_") || publishableKey.startsWith("service_role")) {
    throw new Error("A server-only Supabase key cannot be used to build public product metadata.");
  }

  let projectOrigin: string;
  try {
    const parsedUrl = new URL(configuredUrl);
    if (parsedUrl.protocol !== "https:" || parsedUrl.pathname !== "/" || parsedUrl.search || parsedUrl.hash ||
        !parsedUrl.hostname.endsWith(".supabase.co")) {
      throw new Error();
    }
    projectOrigin = parsedUrl.origin;
  } catch {
    throw new Error("VITE_SUPABASE_URL must be the HTTPS origin of the Orenda Supabase project.");
  }

  const endpoint = new URL("/functions/v1/orenda-public", projectOrigin);
  endpoint.searchParams.set("path", "/api/products");
  const headers = createSupabaseApiHeaders(publishableKey, null, { Accept: "application/json" });
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);

  let response: Response;
  try {
    response = await fetchWithNetworkRetries(options.fetcher ?? fetch, endpoint, {
      method: "GET",
      headers,
      signal: controller.signal,
      cache: "no-store"
    });
  } catch {
    throw new Error("Could not fetch live Supabase product metadata; refusing to publish a stale sitemap.");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Supabase product metadata returned HTTP ${response.status}; refusing to publish a stale sitemap.`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Supabase product metadata was not valid JSON.");
  }
  if (!Array.isArray(body)) throw new Error("Supabase product metadata did not return a product list.");

  const activeRows = body.filter((item) => isRecord(item) && item.isActive === true);
  if (!activeRows.every(isMetadataProduct)) {
    throw new Error("Supabase returned an invalid active product; refusing to generate incomplete SEO pages.");
  }

  const products = activeRows as ProductMetadataRecord[];
  if (!products.length) throw new Error("Supabase has no active products; seed the catalog before publishing.");
  const slugs = products.map((product) => product.slug);
  if (new Set(slugs).size !== slugs.length) {
    throw new Error("Supabase returned duplicate product slugs; refusing to overwrite generated SEO pages.");
  }

  return products;
}
