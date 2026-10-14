import type { SiteSettings } from "./models.js";

export const recommendedSettingsCopy: Pick<
  SiteSettings,
  "heroTitle" | "heroSubtitle" | "footerDescription" | "leadTitle" | "leadSubtitle"
> = {
  heroTitle: "Оренда підписок на топові сервіси без переплат",
  heroSubtitle:
    "ChatGPT, Netflix, Spotify, VPN та інші сервіси з швидким підключенням і зрозумілими тарифами",
  footerDescription:
    "Оренда популярних підписок з вигідними тарифами, швидкою видачею доступу та підтримкою через Telegram.",
  leadTitle: "Залишити заявку",
  leadSubtitle:
    "Обери сервіс і тариф, залиш контакт, а ми швидко зв'яжемося з тобою для підтвердження замовлення."
};

export const defaultSiteSettings: SiteSettings = {
  siteName: "Orenda Cherepashka",
  telegramContactUrl: "https://t.me/yts_nnn",
  telegramNewsChannelUrl: "https://t.me/arenda_cherepashka",
  ...recommendedSettingsCopy
};
