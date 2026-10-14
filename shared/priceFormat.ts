import type { PricingOption } from "./models.js";

export function formatCurrencyAmount(
  amount: number,
  currency: PricingOption["currency"]
) {
  const formatted = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: currency === "USD" ? 2 : 0,
    maximumFractionDigits: currency === "USD" ? 2 : 0
  }).format(amount);

  return `${formatted} ${currency === "USD" ? "$" : "грн"}`;
}
