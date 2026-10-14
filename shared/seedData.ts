import type {
  Category,
  FaqItem,
  NewsItem,
  PricingOption,
  Product,
  Review,
  SiteSettings
} from "./models.js";
import { defaultSiteSettings } from "./siteDefaults.js";

type SeedProduct = Omit<Product, "pricingOptions"> & {
  pricingOptions: Array<Omit<PricingOption, "id">>;
};

export const seedSiteSettings: SiteSettings = defaultSiteSettings;

export const seedCategories: Category[] = [
  { id: "cat-ai", name: "AI", slug: "ai", icon: "🤖", sortOrder: 1, isActive: true },
  {
    id: "cat-streaming",
    name: "Стрімінг",
    slug: "streaming",
    icon: "📺",
    sortOrder: 2,
    isActive: true
  },
  { id: "cat-vpn", name: "VPN", slug: "vpn", icon: "🛜", sortOrder: 3, isActive: true },
  { id: "cat-music", name: "Музика", slug: "music", icon: "🎧", sortOrder: 4, isActive: true },
  {
    id: "cat-presentations",
    name: "Презентації",
    slug: "presentations",
    icon: "🎨",
    sortOrder: 5,
    isActive: true
  },
  {
    id: "cat-productivity",
    name: "Продуктивність",
    slug: "productivity",
    icon: "🧰",
    sortOrder: 6,
    isActive: true
  }
];

type Currency = PricingOption["currency"];

function plan(label: string, price: number, sortOrder: number, currency: Currency = "UAH") {
  return { label, price, currency, compareAt: null, sortOrder, isActive: true };
}

function monthlyPlans(oneMonth: number, threePlusMonths: number) {
  return [
    plan("1 міс · за місяць", oneMonth, 1),
    plan("від 3 міс · за місяць", threePlusMonths, 2)
  ];
}

function makeProduct(
  id: string,
  name: string,
  slug: string,
  categoryId: string,
  summary: string,
  logo: string,
  pricingOptions: SeedProduct["pricingOptions"],
  sortOrder: number
): SeedProduct {
  return {
    id,
    name,
    slug,
    categoryId,
    summary,
    details: [
      "Оберіть потрібний варіант тарифу на сайті.",
      "Перед оплатою уточніть актуальну наявність і умови у менеджера."
    ],
    logo,
    isHot: false,
    isActive: true,
    sortOrder,
    pricingOptions
  };
}

const chatGptLogo = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/ChatGPT-Logo.svg/960px-ChatGPT-Logo.svg.png";
const grokLogo = "https://www.nan.xyz/wp-content/uploads/grok-seeklogo-.svg";
const geminiLogo = "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/gemini-color.png";
const netflixLogo = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Netflix_2016_N_logo.svg/500px-Netflix_2016_N_logo.svg.png";
const capCutLogo = "https://1000logos.net/wp-content/uploads/2025/01/CapCut-Emblem.png";
const perplexityLogo = "https://images.seeklogo.com/logo-png/61/2/perplexity-ai-icon-black-logo-png_seeklogo-611679.png";
const adobeLogo = "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/adobe-color.png";
const youtubeLogo = "https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png";
const spotifyLogo = "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/960px-Spotify_logo_without_text.svg.png";
const canvaLogo = "https://www.edigitalagency.com.au/wp-content/uploads/Canva-logo-PNG-large-size.png";

export const seedProducts: SeedProduct[] = [
  makeProduct("chatgpt-pro-shared", "📱 ChatGPT Pro [спільний до 5–6 користувачів]", "chatgpt-pro-shared", "cat-ai", "Спільний формат для 5–6 користувачів. Виберіть Codex або варіант без Codex.", chatGptLogo, [
    plan("1 міс · +Codex", 1390, 1),
    plan("1 міс · без Codex", 1100, 2),
    plan("3+ міс · +Codex / міс", 1250, 3),
    plan("3+ міс · без Codex / міс", 1000, 4)
  ], 1),
  makeProduct("chatgpt-plus-shared", "📱 ChatGPT Plus [спільний до 9 користувачів]", "chatgpt-plus-9", "cat-ai", "Спільний доступ до ChatGPT Plus до 9 користувачів.", chatGptLogo, monthlyPlans(110, 100), 2),
  makeProduct("chatgpt-plus-shared-5", "📱 ChatGPT Plus [спільний до 5 користувачів]", "chatgpt-plus-5", "cat-ai", "Спільний доступ до ChatGPT Plus до 5 користувачів.", chatGptLogo, monthlyPlans(280, 260), 3),
  makeProduct("chatgpt-plus-personal-no-guarantee", "📱 ChatGPT Plus [особистий без гарантії]", "chatgpt-plus-personal-no-guarantee", "cat-ai", "Особистий формат ChatGPT Plus без гарантії.", chatGptLogo, [plan("1 міс · за місяць", 250, 1)], 4),
  makeProduct("chatgpt-plus-personal-15-day-guarantee", "📱 ChatGPT Plus [особистий, гарантія 15 днів]", "chatgpt-plus-personal-guarantee", "cat-ai", "Особистий формат ChatGPT Plus із гарантією 15 днів.", chatGptLogo, [plan("1 міс · за місяць", 350, 1)], 5),
  makeProduct("netflix-profile", "📹 Netflix Premium 4K [доступ у профіль]", "netflix-premium-profile", "cat-streaming", "Доступ до профілю Netflix Premium 4K.", netflixLogo, monthlyPlans(130, 115), 6),
  makeProduct("netflix-personal-admin", "📹 Netflix Premium 4K [особистий адм. акаунт]", "netflix-premium-personal-admin", "cat-streaming", "Особистий адміністраторський акаунт Netflix Premium 4K.", netflixLogo, [plan("1 міс · за місяць", 280, 1)], 7),
  makeProduct(
    "grok-super",
    "🏷 Grok Super [особистий]",
    "grok-super-personal",
    "cat-ai",
    "Особистий формат Grok Super: 800 грн за 1 місяць або 2200 грн за пакет на 3 місяці.",
    grokLogo,
    [plan("1 міс · за місяць", 800, 1), plan("3 міс · за пакет", 2200, 2)],
    8
  ),
  makeProduct("grok-super-shared", "🏷 Grok Super [спільний]", "grok-super-shared", "cat-ai", "Спільний формат Grok Super.", grokLogo, monthlyPlans(185, 165), 9),
  makeProduct("capcut-pro", "📱 CapCut Pro [спільний]", "capcut-pro-shared", "cat-presentations", "Спільний доступ до CapCut Pro.", capCutLogo, monthlyPlans(160, 150), 10),
  makeProduct("capcut-pro-personal", "📱 CapCut Pro [особистий]", "capcut-pro-personal", "cat-presentations", "Особистий доступ до CapCut Pro.", capCutLogo, monthlyPlans(350, 300), 11),
  makeProduct("gemini-pro", "🏷 Gemini Pro [спільний]", "gemini-pro-shared", "cat-ai", "Спільний доступ до Gemini Pro.", geminiLogo, monthlyPlans(130, 115), 12),
  makeProduct("google-ai-pro-18-months", "🏷 Google AI Pro 18 міс [на особистий акаунт]", "google-ai-pro-18-months", "cat-ai", "Підключення Google AI Pro на особистий акаунт на 18 місяців.", geminiLogo, [plan("18 міс · 1 штука", 790, 1), plan("18 міс · від 2 штук · ціна за штуку", 700, 2)], 13),
  makeProduct("perplexity-pro", "❤️ Perplexity Pro [спільний]", "perplexity-pro-shared", "cat-ai", "Спільний доступ до Perplexity Pro.", perplexityLogo, monthlyPlans(130, 110), 14),
  makeProduct("perplexity-pro-personal-12-months", "❤️ Perplexity Pro [особистий 12 міс]", "perplexity-pro-personal-12-months", "cat-ai", "Особистий доступ до Perplexity Pro на 12 місяців.", perplexityLogo, [plan("12 міс · за пакет", 3290, 1)], 15),
  makeProduct("gamma-ai", "🌈 Gamma AI [спільний]", "gamma-ai-shared", "cat-presentations", "Спільний доступ до Gamma AI.", "", monthlyPlans(230, 215), 16),
  makeProduct("adobe-creative-cloud-shared", "🏷 Adobe Creative Cloud Pro [спільний]", "adobe-creative-cloud-pro-shared", "cat-presentations", "Спільний доступ до Adobe Creative Cloud Pro.", adobeLogo, monthlyPlans(330, 300), 17),
  makeProduct("adobe-creative-cloud-personal", "🏷 Adobe Creative Cloud Pro [особистий без гарантії]", "adobe-creative-cloud-pro-personal", "cat-presentations", "Особистий формат Adobe Creative Cloud Pro без гарантії.", adobeLogo, monthlyPlans(380, 350), 18),
  makeProduct("megogo-megopack", "🎬 MEGOGO [MegoPack]", "megogo-megopack", "cat-streaming", "Тариф MegoPack із ціною за пристрій.", "", [plan("1 міс · за пристрій", 135, 1), plan("від 3 міс · за пристрій / міс", 120, 2)], 19),
  makeProduct("youtube-family", "🌐 YouTube [у сім'ю]", "youtube-family", "cat-streaming", "Запрошення до сімейного плану YouTube.", youtubeLogo, monthlyPlans(65, 60), 20),
  makeProduct("sweet-tv-l", "🎬 Sweet TV [L]", "sweet-tv-l", "cat-streaming", "Тариф Sweet TV L.", "", monthlyPlans(95, 85), 21),
  makeProduct("spotify-family", "🎵 Spotify [Premium Family]", "spotify-premium-family", "cat-music", "Місце у Spotify Premium Family.", spotifyLogo, monthlyPlans(100, 90), 22),
  makeProduct("microsoft-365-family", "🌐 Microsoft 365 [Family]", "microsoft-365-family", "cat-productivity", "Місце у плані Microsoft 365 Family.", "", monthlyPlans(150, 140), 23),
  makeProduct("duolingo-super-family", "👅 Duolingo Super [Family]", "duolingo-super-family", "cat-productivity", "Місце у плані Duolingo Super Family.", "", monthlyPlans(120, 110), 24),
  makeProduct("leonardo-ai-personal", "😶 Leonardo AI 8500 credits [особистий]", "leonardo-ai-8500-credits", "cat-ai", "Особистий план Leonardo AI із 8500 кредитами.", "", [plan("8500 credits · за пакет", 320, 1)], 25),
  makeProduct("surfshark-vpn", "🏷 Surfshark", "surfshark", "cat-vpn", "Підписка Surfshark.", "https://ameliaandjp.com/wp-content/uploads/2024/08/Surfshark-Logo-300x300.png", monthlyPlans(95, 85), 26),
  makeProduct("heygen-creator-personal", "😊 HeyGen Creator [особистий]", "heygen-creator-personal", "cat-ai", "Особистий план HeyGen Creator.", "", [plan("1 міс · за місяць", 550, 1)], 27),
  makeProduct("clear-vpn", "🔗 Clear VPN [назавжди]", "clear-vpn-forever", "cat-vpn", "Постійний доступ до Clear VPN.", "https://cdn3.macpaw.com/images/product-icons/clearvpn/clearvpn4x.png?id=2a2c609825db25ebf665e09fc17db71c", [plan("назавжди · за 1 штуку", 250, 1)], 28),
  makeProduct("gmail-mailbox", "✉️ Gmail пошта", "gmail-mailbox", "cat-productivity", "Ціна за одну поштову скриньку залежить від обсягу замовлення.", "", [plan("5–10 шт · за штуку", 1.9, 1, "USD"), plan("від 11 шт · за штуку", 1.7, 2, "USD")], 29),
  makeProduct("canva-pro", "🖥 Canva Pro [спільний]", "canva-pro-shared", "cat-presentations", "Спільний доступ до Canva Pro.", canvaLogo, monthlyPlans(120, 110), 30),
  makeProduct("canva-pro-personal-team", "🖥 Canva Pro [особистий, у команду]", "canva-pro-personal-team", "cat-presentations", "Особистий доступ до Canva Pro у командному форматі.", canvaLogo, monthlyPlans(190, 170), 31),
  makeProduct("hbo-premium", "🎥 HBO Premium", "hbo-premium", "cat-streaming", "Підписка HBO Premium.", "", monthlyPlans(180, 160), 32),
  makeProduct("amazon-prime-video-6-months", "🎬 Amazon Prime Video 6 Month Adsfree", "amazon-prime-video-6-months-adsfree", "cat-streaming", "Пакет Amazon Prime Video на 6 місяців без реклами.", "", [plan("6 міс · за пакет", 550, 1)], 33),
  makeProduct("figma-pro-personal-1-year", "📱 Figma Pro [1 рік, особистий]", "figma-pro-personal-1-year", "cat-presentations", "Особистий план Figma Pro на один рік.", "", [plan("1 рік · за пакет", 790, 1)], 34),
  makeProduct("elevenlabs-creator-131k", "🐦 ELEVENLABS 131K credits, Creator Plan [особистий]", "elevenlabs-creator-131k", "cat-ai", "Особистий Creator Plan ElevenLabs із 131K credits.", "", [plan("131K credits · за пакет", 590, 1)], 35)
];

export const seedFaqs: FaqItem[] = [
  {
    id: "faq-1",
    question: "Як працює оренда підписок?",
    answer:
      "Ви отримуєте доступ до акаунту з активною підпискою та користуєтесь повним функціоналом без оформлення офіційного тарифу самостійно.",
    sortOrder: 1,
    isActive: true
  },
  {
    id: "faq-2",
    question: "Як передаються дані для входу?",
    answer:
      "Після оплати надсилаються логін або email і пароль. Якщо для сервісу потрібен додатковий код, його також оперативно передають.",
    sortOrder: 2,
    isActive: true
  },
  {
    id: "faq-3",
    question: "Що робити, якщо пароль змінився?",
    answer:
      "Для спільних акаунтів це нормальна ситуація. Якщо оренда активна, вам швидко видають оновлені дані доступу.",
    sortOrder: 3,
    isActive: true
  },
  {
    id: "faq-4",
    question: "Чи безпечно користуватися спільними акаунтами?",
    answer:
      "Так, за умови нормального користування. Персональні дані не варто зберігати у спільних профілях, але для сервісного доступу це звичний формат.",
    sortOrder: 4,
    isActive: true
  },
  {
    id: "faq-5",
    question: "Як відбувається оплата?",
    answer:
      "Замовлення та оплата координуються через Telegram: ви обираєте сервіс, зв'язуєтесь з продавцем і отримуєте реквізити.",
    sortOrder: 5,
    isActive: true
  }
];

export const seedNews: NewsItem[] = [
  {
    id: "news-claude-pause",
    title: "Тимчасове вилучення Claude PRO",
    dateLabel: "Оновлення від лютого 2026",
    content:
      "Після посилення перевірок безпеки сервіс почав активніше блокувати спільні акаунти при входах з різних IP. Через це продаж такої оренди тимчасово призупинено.",
    sortOrder: 1,
    isActive: true
  }
];

export const seedReviews: Review[] = [];
