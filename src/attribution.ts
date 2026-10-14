import type { PublicAnalyticsEventInput } from "./types";

const utmKeys = [
  ["utm_source", "utmSource"],
  ["utm_medium", "utmMedium"],
  ["utm_campaign", "utmCampaign"]
] as const;

export function readUtmAttribution(search = window.location.search) {
  const params = new URLSearchParams(search);
  const attribution: Pick<PublicAnalyticsEventInput, "utmSource" | "utmMedium" | "utmCampaign"> = {};

  for (const [queryKey, field] of utmKeys) {
    const value = params.get(queryKey)?.trim().slice(0, 100);
    if (value && !/[<>\u0000-\u001f]/.test(value)) attribution[field] = value;
  }

  return attribution;
}

export function preserveUtmAttribution(href: string, search = window.location.search) {
  const url = new URL(href, window.location.origin);
  if (url.origin !== window.location.origin) return href;

  const current = new URLSearchParams(search);
  for (const [queryKey] of utmKeys) {
    const value = current.get(queryKey)?.trim();
    if (value && !url.searchParams.has(queryKey)) {
      url.searchParams.set(queryKey, value.slice(0, 100));
    }
  }

  return `${url.pathname}${url.search}${url.hash}`;
}
