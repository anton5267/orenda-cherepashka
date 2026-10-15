import assert from "node:assert/strict";
import { loadProductsForMetadata } from "./productMetadataSource.js";

const seedProducts = await loadProductsForMetadata({});
assert.equal(seedProducts.length, 35, "Local builds must retain the canonical 35-product fallback.");

const selected = seedProducts[0];
const inactive = { ...selected, id: "inactive", slug: "inactive-item", isActive: false };
let requestedUrl = "";
let requestHeaders: Headers | undefined;
const liveProducts = await loadProductsForMetadata({
  supabaseUrl: "https://orenda-project.supabase.co",
  publishableKey: "sb_publishable_orenda_test",
  fetcher: async (input, init) => {
    requestedUrl = String(input);
    requestHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify([selected, inactive]), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
});
assert.equal(liveProducts.length, 1, "Inactive products must not be emitted into the public sitemap.");
assert.equal(new URL(requestedUrl).searchParams.get("path"), "/api/products");
assert.equal(requestHeaders?.get("apikey"), "sb_publishable_orenda_test");
assert.equal(requestHeaders?.get("Authorization"), null, "The build must not send an opaque key as Bearer auth.");

await assert.rejects(
  () => loadProductsForMetadata({ supabaseUrl: "https://orenda-project.supabase.co" }),
  /Both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/
);
await assert.rejects(
  () => loadProductsForMetadata({
    supabaseUrl: "https://orenda-project.supabase.co",
    publishableKey: "sb_secret_never-public"
  }),
  /server-only Supabase key/
);
await assert.rejects(
  () => loadProductsForMetadata({
    supabaseUrl: "https://orenda-project.supabase.co",
    publishableKey: "sb_publishable_orenda_test",
    fetcher: async () => new Response("offline", { status: 503 })
  }),
  /HTTP 503/
);
await assert.rejects(
  () => loadProductsForMetadata({
    supabaseUrl: "https://orenda-project.supabase.co",
    publishableKey: "sb_publishable_orenda_test",
    fetcher: async () => new Response(JSON.stringify([]), { status: 200 })
  }),
  /no active products/
);

console.log("Static product SEO uses live active Supabase products and safely rejects stale or invalid builds.");
