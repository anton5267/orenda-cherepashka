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
  }
];

export const seedProducts: SeedProduct[] = [
  {
    id: "grok-super",
    name: "Grok Super",
    slug: "grok-super",
    categoryId: "cat-ai",
    summary: "Мінімум цензури, фото та відео, великі ліміти на генерацію.",
    details: [
      "Підходить для текстових, файлових і мультимедійних сценаріїв.",
      "Є генерація фото та відео, а також збільшені добові ліміти.",
      "Формат оренди з можливістю подовження."
    ],
    logo: "https://www.nan.xyz/wp-content/uploads/grok-seeklogo-.svg",
    isHot: true,
    isActive: true,
    sortOrder: 1,
    pricingOptions: [
      { label: "Лайт", price: 175, compareAt: 1300, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 480, compareAt: 3900, sortOrder: 2, isActive: true },
      { label: "Ультра", price: 900, compareAt: 7800, sortOrder: 3, isActive: true }
    ]
  },
  {
    id: "chatgpt-plus-shared",
    name: "ChatGPT Plus",
    slug: "chatgpt-plus",
    categoryId: "cat-ai",
    summary: "Спільний акаунт Plus з генерацією зображень та довгими планами.",
    details: [
      "Доступ до тарифу Plus у форматі спільного акаунту.",
      "Є інструменти для генерації зображень та бонусні відеоможливості.",
      "Зручно для регулярної оренди на місяць або квартал."
    ],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/ChatGPT-Logo.svg/960px-ChatGPT-Logo.svg.png",
    isHot: true,
    isActive: true,
    sortOrder: 2,
    pricingOptions: [
      { label: "1 місяць", price: 199, compareAt: 249, sortOrder: 1, isActive: true },
      { label: "3 місяці", price: 549, compareAt: 747, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "gemini-pro",
    name: "Gemini [Pro]",
    slug: "gemini-pro",
    categoryId: "cat-ai",
    summary: "Google AI Pro з доступом до Studio, зображень, відео та сховища.",
    details: [
      "Підписка Pro із доступом до Google AI Studio.",
      "Є інструменти для генерації зображень і відео.",
      "Підійде для користувачів, яким потрібен екосистемний Google-набір."
    ],
    logo: "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/gemini-color.png",
    isHot: true,
    isActive: true,
    sortOrder: 3,
    pricingOptions: [
      { label: "Лайт", price: 120, compareAt: 999, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 330, compareAt: 2970, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "perplexity-pro",
    name: "Perplexity PRO",
    slug: "perplexity-pro",
    categoryId: "cat-ai",
    summary: "ШІ-пошук із доступом до декількох платних моделей і браузера Comet.",
    details: [
      "Пошук і генерація відповідей з підтримкою кількох моделей.",
      "Є окремий AI-браузер та розширений пакет функцій.",
      "Підходить для досліджень, резюме та щоденної роботи з інформацією."
    ],
    logo: "https://images.seeklogo.com/logo-png/61/2/perplexity-ai-icon-black-logo-png_seeklogo-611679.png",
    isHot: false,
    isActive: true,
    sortOrder: 4,
    pricingOptions: [
      { label: "Лайт", price: 115, compareAt: 820, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 320, compareAt: 2460, sortOrder: 2, isActive: true },
      { label: "Ультра", price: 600, compareAt: 4920, sortOrder: 3, isActive: true }
    ]
  },
  {
    id: "chatgpt-plus-personal",
    name: "ChatGPT Plus ⚡",
    slug: "chatgpt-plus-personal",
    categoryId: "cat-ai",
    summary: "Індивідуальний доступ до Plus для одного користувача.",
    details: [
      "Формат для персонального користування без поділу на інших людей.",
      "Є підтримка генерації зображень та актуальних Plus-функцій.",
      "Підходить тим, кому потрібен окремий профіль."
    ],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ef/ChatGPT-Logo.svg/960px-ChatGPT-Logo.svg.png",
    isHot: false,
    isActive: true,
    sortOrder: 5,
    pricingOptions: [
      { label: "Щомісячний", price: 329, compareAt: 990, sortOrder: 1, isActive: true }
    ]
  },
  {
    id: "adobe-creative-cloud",
    name: "Adobe Creative Cloud",
    slug: "adobe-creative-cloud",
    categoryId: "cat-ai",
    summary: "Набір програм Adobe з Firefly-кредитами та доступом до 20+ застосунків.",
    details: [
      "Пакет для дизайну, монтажу, графіки та AI-інструментів Adobe.",
      "Є варіант спільного або персонального доступу.",
      "Підходить для творчих задач та виробництва контенту."
    ],
    logo: "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/adobe-color.png",
    isHot: false,
    isActive: true,
    sortOrder: 6,
    pricingOptions: [
      { label: "Спільний", price: 349, compareAt: 2580, sortOrder: 1, isActive: true },
      { label: "Персональний", price: 449, compareAt: 2580, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "netflix-premium",
    name: "Netflix Premium",
    slug: "netflix-premium",
    categoryId: "cat-streaming",
    summary: "Окремий профіль Netflix Premium 4K з вигідними довгими планами.",
    details: [
      "Спільний акаунт із виділеним профілем для користувача.",
      "Доступ до Premium 4K та подовження підписки.",
      "Підійде для серіалів, фільмів і регулярного користування."
    ],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Netflix_2016_N_logo.svg/500px-Netflix_2016_N_logo.svg.png",
    isHot: true,
    isActive: true,
    sortOrder: 7,
    pricingOptions: [
      { label: "1 місяць", price: 149, compareAt: 199, sortOrder: 1, isActive: true },
      { label: "3 місяці", price: 399, compareAt: 597, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "youtube-premium",
    name: "YouTube Premium [UA]",
    slug: "youtube-premium-ua",
    categoryId: "cat-streaming",
    summary: "Преміум-сім'я для вашого акаунту без реклами та з YouTube Music.",
    details: [
      "Запрошення вашого особистого акаунту до Premium-сім'ї.",
      "Підписка орієнтована на український регіон.",
      "Дає відключення реклами та музичний пакет."
    ],
    logo: "https://upload.wikimedia.org/wikipedia/commons/e/ef/Youtube_logo.png",
    isHot: false,
    isActive: true,
    sortOrder: 8,
    pricingOptions: [
      { label: "Лайт", price: 59, compareAt: 159, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 165, compareAt: 477, sortOrder: 2, isActive: true },
      { label: "Ультра", price: 300, compareAt: 954, sortOrder: 3, isActive: true }
    ]
  },
  {
    id: "capcut-pro",
    name: "CapCut Pro",
    slug: "capcut-pro",
    categoryId: "cat-streaming",
    summary: "PRO-доступ до монтажу, шаблонів, AI-функцій і веб/ПК/мобільного входу.",
    details: [
      "Підходить для редагування відео та швидкого контент-продакшену.",
      "Є AI-функції, шаблони та окремий робочий простір.",
      "Орієнтовано на авторів коротких та середніх відеоформатів."
    ],
    logo: "https://1000logos.net/wp-content/uploads/2025/01/CapCut-Emblem.png",
    isHot: false,
    isActive: true,
    sortOrder: 9,
    pricingOptions: [
      { label: "Лайт", price: 149, compareAt: 870, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 390, compareAt: 2610, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "sora-invite",
    name: "Sora 2 [інвайт]",
    slug: "sora-2-invite",
    categoryId: "cat-streaming",
    summary: "Запрошення до генерації відео з короткими роликами та денними лімітами.",
    details: [
      "Формат оренди через інвайт на відеогенерацію.",
      "Працює у зв'язці з ChatGPT та орієнтований на короткі ролики.",
      "Потрібен VPN у США або Канаді."
    ],
    logo: "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/sora-color.png",
    isHot: false,
    isActive: true,
    sortOrder: 10,
    pricingOptions: [
      { label: "1 запрошення", price: 59, compareAt: 990, sortOrder: 1, isActive: true }
    ]
  },
  {
    id: "surfshark-vpn",
    name: "Surfshurk VPN",
    slug: "surfshark-vpn",
    categoryId: "cat-vpn",
    summary: "VPN Starter для кількох пристроїв зі зміною IP та блокуванням реклами.",
    details: [
      "Має підтримку ПК і смартфонів, до кількох пристроїв одночасно.",
      "Дає зміну IP та базовий пакет приватності.",
      "Зручно для постійного використання у браузері й застосунках."
    ],
    logo: "https://ameliaandjp.com/wp-content/uploads/2024/08/Surfshark-Logo-300x300.png",
    isHot: false,
    isActive: true,
    sortOrder: 11,
    pricingOptions: [
      { label: "Лайт", price: 95, compareAt: 645, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 270, compareAt: 1950, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "clear-vpn",
    name: "Clear VPN [назавжди]",
    slug: "clear-vpn-forever",
    categoryId: "cat-vpn",
    summary: "Преміум VPN з доступом назавжди та серверами в Україні, США й Європі.",
    details: [
      "Підключення преміум-пакету на ваш email без обмеження строку.",
      "Є десятки країн та підтримка мобільного і десктопного доступу.",
      "Підходить для тих, хто хоче одноразову покупку замість щомісячної оренди."
    ],
    logo: "https://cdn3.macpaw.com/images/product-icons/clearvpn/clearvpn4x.png?id=2a2c609825db25ebf665e09fc17db71c",
    isHot: false,
    isActive: true,
    sortOrder: 12,
    pricingOptions: [
      { label: "Назавжди", price: 249, compareAt: 1349, sortOrder: 1, isActive: true }
    ]
  },
  {
    id: "spotify-premium",
    name: "Spotify Premium",
    slug: "spotify-premium",
    categoryId: "cat-music",
    summary: "Spotify без реклами, з офлайном та високою якістю звуку.",
    details: [
      "Запрошення особистого акаунту до преміум-сім'ї.",
      "Є офлайн-режим і висока якість відтворення.",
      "Підійде для щоденного прослуховування музики на будь-яких пристроях."
    ],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/1/19/Spotify_logo_without_text.svg/960px-Spotify_logo_without_text.svg.png",
    isHot: false,
    isActive: true,
    sortOrder: 13,
    pricingOptions: [
      { label: "1 місяць", price: 89, compareAt: 119, sortOrder: 1, isActive: true },
      { label: "3 місяці", price: 239, compareAt: 357, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "gemini-personal",
    name: "Gemini PRO [особистий]",
    slug: "gemini-pro-personal",
    categoryId: "cat-music",
    summary: "Персональна підписка Google AI Pro на окремий або ваш акаунт.",
    details: [
      "Підключення підписки Pro на персональний акаунт.",
      "Є доступ до сучасних функцій, глибокого ресерчу та мультимедіа.",
      "Підходить для тих, кому потрібна гарантія персонального формату."
    ],
    logo: "https://raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/dark/gemini-color.png",
    isHot: false,
    isActive: true,
    sortOrder: 14,
    pricingOptions: [
      { label: "4 місяці", price: 449, compareAt: 2970, sortOrder: 1, isActive: true }
    ]
  },
  {
    id: "canva-pro",
    name: "Canva PRO",
    slug: "canva-pro",
    categoryId: "cat-presentations",
    summary: "Преміум-шаблони, дизайн, відео та презентації у зручному вебсервісі.",
    details: [
      "Спільний акаунт із доступом до PRO-функцій.",
      "Є шаблони для соцмереж, презентацій, брендингу й маркетингу.",
      "Підходить для швидкого дизайну без складних програм."
    ],
    logo: "https://www.edigitalagency.com.au/wp-content/uploads/Canva-logo-PNG-large-size.png",
    isHot: false,
    isActive: true,
    sortOrder: 15,
    pricingOptions: [
      { label: "1 місяць", price: 149, compareAt: 199, sortOrder: 1, isActive: true },
      { label: "3 місяці", price: 399, compareAt: 597, sortOrder: 2, isActive: true }
    ]
  },
  {
    id: "gamma-ai",
    name: "Gamma AI",
    slug: "gamma-ai",
    categoryId: "cat-presentations",
    summary: "Платформа для створення презентацій, документів, зображень і сайтів.",
    details: [
      "Дає кредити на генерацію та швидке складання презентацій.",
      "Може стати заміною звичним слайд-декам для швидких задач.",
      "Підходить для продажів, навчання та візуальних чернеток."
    ],
    logo: "https://www.wpcrafter.com/wp-content/uploads/2024/08/gamma-1.png",
    isHot: false,
    isActive: true,
    sortOrder: 16,
    pricingOptions: [
      { label: "Лайт", price: 259, compareAt: 1120, sortOrder: 1, isActive: true },
      { label: "Медіум", price: 720, compareAt: 3360, sortOrder: 2, isActive: true },
      { label: "Ультра", price: 1140, compareAt: 6720, sortOrder: 3, isActive: true }
    ]
  }
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

export const seedReviews: Review[] = [
  {
    id: "review-1",
    name: "Олександр К.",
    rating: 5,
    content: "Чудовий сервіс. Уже довго користуюся ChatGPT Plus, усе працює стабільно.",
    sortOrder: 1,
    isActive: true,
    isModerated: true,
    createdAt: "2026-03-18T16:48:54.779Z"
  },
  {
    id: "review-2",
    name: "Марія П.",
    rating: 5,
    content: "Брала Netflix на кілька місяців. Ціна адекватна, доступ дали швидко.",
    sortOrder: 2,
    isActive: true,
    isModerated: true,
    createdAt: "2026-03-18T16:48:54.792Z"
  },
  {
    id: "review-3",
    name: "Денис В.",
    rating: 5,
    content: "Підключав Gemini Advanced. Вийшло суттєво дешевше за офіційну ціну.",
    sortOrder: 3,
    isActive: true,
    isModerated: true,
    createdAt: "2026-03-18T16:48:54.803Z"
  }
];
