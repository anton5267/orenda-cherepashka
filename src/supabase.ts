import type { SupabaseClient } from "@supabase/supabase-js";

const configuredUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const configuredPublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? "";

export const isSupabaseConfigured = Boolean(configuredUrl && configuredPublishableKey);
export const supabaseUrl = configuredUrl.replace(/\/$/, "");
export const supabasePublishableKey = configuredPublishableKey;

let supabasePromise: Promise<SupabaseClient> | undefined;

export function getSupabaseClient(): Promise<SupabaseClient> {
  if (!isSupabaseConfigured) {
    return Promise.reject(new Error("Supabase не налаштовано для цього середовища."));
  }

  supabasePromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
    createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  );

  return supabasePromise;
}
