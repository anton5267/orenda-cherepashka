import assert from "node:assert/strict";
import {
  createSupabaseApiHeaders,
  createSupabaseApiKeyFetch,
  readSupabasePublishableKey,
  readSupabaseSecretKey
} from "../supabase/functions/_shared/supabaseApiKeyHeaders";

const env = new Map<string, string>([
  ["SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_new_default" })],
  ["SUPABASE_PUBLISHABLE_KEYS", JSON.stringify({ default: "sb_publishable_new_default" })]
]);
assert.equal(readSupabaseSecretKey((name) => env.get(name)), "sb_secret_new_default");
assert.equal(readSupabasePublishableKey((name) => env.get(name)), "sb_publishable_new_default");
const legacyEnv = new Map([["SUPABASE_SERVICE_ROLE_KEY", "legacy-service"], ["SUPABASE_ANON_KEY", "legacy-anon"]]);
assert.equal(readSupabaseSecretKey((name) => legacyEnv.get(name)), "legacy-service");
assert.equal(readSupabasePublishableKey((name) => legacyEnv.get(name)), "legacy-anon");

const publishableKey = "sb_publishable_orenda_test";
const anonymousHeaders = createSupabaseApiHeaders(publishableKey, null, {
  Authorization: "Bearer stale-token"
});
assert.equal(anonymousHeaders.get("apikey"), publishableKey);
assert.equal(anonymousHeaders.get("Authorization"), null);

const sessionToken = "eyJhbGciOiJIUzI1NiJ9.session.signature";
const authenticatedHeaders = createSupabaseApiHeaders(publishableKey, sessionToken);
assert.equal(authenticatedHeaders.get("apikey"), publishableKey);
assert.equal(authenticatedHeaders.get("Authorization"), `Bearer ${sessionToken}`);

const secretKey = "sb_secret_orenda_test";
let capturedRequest: RequestInit | undefined;
const fakeFetch: typeof fetch = async (_input, init) => {
  capturedRequest = init;
  return new Response(null, { status: 204 });
};
await createSupabaseApiKeyFetch(secretKey, fakeFetch)("https://example.supabase.co/rest/v1/site_content", {
  headers: { apikey: secretKey, Authorization: `Bearer ${secretKey}` }
});
const secretRequestHeaders = new Headers(capturedRequest?.headers);
assert.equal(secretRequestHeaders.get("apikey"), secretKey);
assert.equal(secretRequestHeaders.get("Authorization"), null);

const legacyKey = "eyJhbGciOiJIUzI1NiJ9.legacy.signature";
assert.equal(createSupabaseApiKeyFetch(legacyKey, fakeFetch), fakeFetch);

console.log("Supabase API-key headers preserve user JWTs and avoid opaque-key Bearer auth.");
