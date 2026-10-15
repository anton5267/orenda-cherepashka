import { compareSync } from "bcryptjs";
import express from "express";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { clearAdminSession, hasAdminSession, issueAdminSession } from "./auth.js";
import { startDatabaseBackupScheduler } from "./database-backup.js";
import { env } from "./env.js";
import { pruneExpiredRateLimitEntries } from "./rateLimitEntries.js";
import {
  HttpError,
  bulkUpdateFaqs,
  bulkUpdateLeads,
  bulkUpdateNews,
  bulkUpdateProducts,
  bulkUpdateReviews,
  createCategory,
  createFaq,
  createLead,
  createNewsItem,
  createProduct,
  createReview,
  deleteCategory,
  deleteFaq,
  deleteNewsItem,
  deleteProduct,
  deleteReview,
  getSiteSettings,
  getAnalyticsSummary,
  getProductBySlug,
  listCategories,
  listFaqs,
  listLeads,
  listNews,
  listProducts,
  listReviews,
  listTelegramWebhookEvents,
  recordPublicAnalyticsEvent,
  updateCategory,
  updateFaq,
  updateLeadStatus,
  updateNewsItem,
  updateProduct,
  updateReview,
  updateSiteSettings
} from "./store.js";
import {
  configureTelegramWebhook,
  handleTelegramUpdate,
  notifyLeadInTelegram
} from "./telegram.js";
import {
  validateLeadPayload,
  validatePublicAnalyticsEvent,
  validateNewsPayload,
  validateSettingsPayload,
  validateTelegramWebhookUpdate
} from "./validation.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..", "..");
const distDir = resolve(rootDir, "dist");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", process.env.NODE_ENV === "production" ? 1 : false);

const publicCorsGetPaths = new Set([
  "/api/site",
  "/api/categories",
  "/api/products",
  "/api/faqs",
  "/api/news",
  "/api/reviews"
]);

app.use((request, response, next) => {
  if (!request.path.startsWith("/api/")) {
    next();
    return;
  }

  const origin = request.get("Origin");
  if (!origin) {
    next();
    return;
  }

  const requestOrigin = `${request.protocol}://${request.get("host")}`;
  if (origin === requestOrigin) {
    next();
    return;
  }

  const requestedMethod = request.method === "OPTIONS"
    ? request.get("Access-Control-Request-Method")?.toUpperCase()
    : request.method;
  const isAllowedPathAndMethod =
    (requestedMethod === "GET" && publicCorsGetPaths.has(request.path)) ||
    (requestedMethod === "POST" && ["/api/leads", "/api/analytics/events"].includes(request.path));
  const requestedHeaders = (request.get("Access-Control-Request-Headers") ?? "")
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);
  const headersAreAllowed = requestedHeaders.every((header) => header === "content-type");

  if (
    !env.publicApiAllowedOrigins.includes(origin) ||
    !isAllowedPathAndMethod ||
    (request.method === "OPTIONS" && !headersAreAllowed)
  ) {
    response.status(403).json({ message: "Неприпустиме джерело запиту." });
    return;
  }

  response.set({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  });

  if (request.method === "OPTIONS") {
    response.sendStatus(204);
    return;
  }

  next();
});

app.use(express.json({ limit: "1mb" }));

type RateLimitEntry = { count: number; resetAt: number };
const rateLimitEntries = new Map<string, RateLimitEntry>();
const loginFailureEntries = new Map<string, RateLimitEntry>();
const rateLimitCleanupTimer = setInterval(() => {
  const now = Date.now();
  pruneExpiredRateLimitEntries(rateLimitEntries, now);
  pruneExpiredRateLimitEntries(loginFailureEntries, now);
}, 60 * 1000);
rateLimitCleanupTimer.unref();

function getClientKey(request: express.Request) {
  return request.ip || "unknown";
}

function rateLimit(options: { key: string; max: number; windowMs: number }) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const now = Date.now();
    const key = `${options.key}:${getClientKey(request)}`;
    const current = rateLimitEntries.get(key);

    if (!current || current.resetAt <= now) {
      rateLimitEntries.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (current.count >= options.max) {
      response.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
      response.status(429).json({ message: "Забагато запитів. Спробуй трохи пізніше." });
      return;
    }

    current.count += 1;
    next();
  };
}

function loginAttemptAllowed(request: express.Request, response: express.Response) {
  const key = `admin-login:${getClientKey(request)}`;
  const current = loginFailureEntries.get(key);
  if (!current || current.resetAt <= Date.now()) {
    loginFailureEntries.delete(key);
    return true;
  }

  if (current.count >= 5) {
    response.setHeader("Retry-After", Math.ceil((current.resetAt - Date.now()) / 1000));
    response.status(429).json({ message: "Забагато невдалих спроб. Спробуй через 15 хвилин." });
    return false;
  }

  return true;
}

function recordLoginFailure(request: express.Request) {
  const key = `admin-login:${getClientKey(request)}`;
  const now = Date.now();
  const current = loginFailureEntries.get(key);
  if (!current || current.resetAt <= now) {
    loginFailureEntries.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return;
  }
  current.count += 1;
}

function clearLoginFailures(request: express.Request) {
  loginFailureEntries.delete(`admin-login:${getClientKey(request)}`);
}

function sameOrigin(request: express.Request) {
  const origin = request.get("origin");
  const requestOrigin = `${request.protocol}://${request.get("host")}`;
  if (origin) {
    return origin === requestOrigin;
  }

  const referer = request.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === requestOrigin;
  } catch {
    return false;
  }
}

app.use((_request, response, next) => {
  response.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  });

  if (process.env.NODE_ENV === "production") {
    response.set({
      "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
      "Content-Security-Policy":
        "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' https: data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; connect-src 'self' https://api.telegram.org"
    });
  }

  next();
});
app.use("/api", (_request, response, next) => {
  response.set({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0"
  });
  next();
});

app.use("/api/admin", (request, response, next) => {
  if (["POST", "PATCH", "PUT", "DELETE"].includes(request.method) && !sameOrigin(request)) {
    response.status(403).json({ message: "Неприпустиме джерело запиту." });
    return;
  }

  next();
});

function getRouteParam(request: express.Request, name: string) {
  const value = request.params[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function requireAdmin(
  request: express.Request,
  response: express.Response,
  next: express.NextFunction
) {
  if (!hasAdminSession(request)) {
    response.status(401).json({ message: "Потрібна авторизація." });
    return;
  }

  next();
}

function wrap(
  handler: (
    request: express.Request,
    response: express.Response
  ) => unknown
) {
  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction
  ) => {
    try {
      Promise.resolve(handler(request, response)).catch(next);
    } catch (error) {
      next(error);
    }
  };
}

app.get("/api/site", (_request, response) => {
  response.json(getSiteSettings());
});

app.get("/api/categories", (_request, response) => {
  response.json(listCategories(false));
});

app.get("/api/products", (_request, response) => {
  response.json(listProducts(false));
});

app.get("/api/faqs", (_request, response) => {
  response.json(listFaqs(false));
});

app.get("/api/news", (_request, response) => {
  response.json(listNews(false));
});

app.get("/api/reviews", (_request, response) => {
  response.json(listReviews(false, false));
});

app.get("/api/health", (_request, response) => {
  response.json({ ok: true, service: "orenda-cherepashka", version: "2026.10" });
});

app.post(
  "/api/leads",
  rateLimit({ key: "lead", max: 10, windowMs: 10 * 60 * 1000 }),
  wrap((request, response) => {
    validateLeadPayload(request.body);
    const lead = createLead(request.body);
    void notifyLeadInTelegram(lead).catch((error) => {
      console.error("Failed to notify Telegram about lead", error);
    });
    response.status(201).json(lead);
  })
);

app.post(
  "/api/analytics/events",
  rateLimit({ key: "analytics-event", max: 120, windowMs: 10 * 60 * 1000 }),
  wrap((request, response) => {
    recordPublicAnalyticsEvent(validatePublicAnalyticsEvent(request.body));
    response.status(204).end();
  })
);

app.post(
  "/api/telegram/webhook",
  rateLimit({ key: "telegram-webhook", max: 120, windowMs: 60 * 1000 }),
  wrap(async (request, response) => {
    if (
      !env.telegramWebhookSecret ||
      request.get("X-Telegram-Bot-Api-Secret-Token") !== env.telegramWebhookSecret
    ) {
      response.status(403).json({ message: "Невірний Telegram webhook secret." });
      return;
    }

    const result = await handleTelegramUpdate(validateTelegramWebhookUpdate(request.body));
    if (result.forbidden) {
      response.status(403).json({ message: "Telegram-допис надійшов не з налаштованого каналу." });
      return;
    }
    response.status(200).json({ ok: true, ...result });
  })
);

app.get("/api/admin/session", (request, response) => {
  response.json({ authenticated: hasAdminSession(request) });
});

app.get("/api/admin/analytics", requireAdmin, (_request, response) => {
  response.json(getAnalyticsSummary());
});

app.post(
  "/api/admin/login",
  (request, response) => {
  if (!loginAttemptAllowed(request, response)) {
    return;
  }

  const password =
    typeof request.body?.password === "string" ? request.body.password : "";

  if (!password || !compareSync(password, env.adminPasswordHash)) {
    recordLoginFailure(request);
    response.status(401).json({ message: "Невірний пароль." });
    return;
  }

  clearLoginFailures(request);
  issueAdminSession(response);
  response.json({ authenticated: true });
  }
);

app.post("/api/admin/logout", (_request, response) => {
  clearAdminSession(response);
  response.json({ authenticated: false });
});

app.get("/api/admin/categories", requireAdmin, (_request, response) => {
  response.json(listCategories(true));
});

app.post(
  "/api/admin/categories",
  requireAdmin,
  wrap((request, response) => {
    response.status(201).json(createCategory(request.body));
  })
);

app.patch(
  "/api/admin/categories/:id",
  requireAdmin,
  wrap((request, response) => {
    response.json(updateCategory(getRouteParam(request, "id"), request.body));
  })
);

app.delete(
  "/api/admin/categories/:id",
  requireAdmin,
  wrap((request, response) => {
    deleteCategory(getRouteParam(request, "id"));
    response.status(204).end();
  })
);

app.get("/api/admin/products", requireAdmin, (_request, response) => {
  response.json(listProducts(true));
});

app.post(
  "/api/admin/products",
  requireAdmin,
  wrap((request, response) => {
    response.status(201).json(createProduct(request.body));
  })
);

app.patch(
  "/api/admin/products/bulk",
  requireAdmin,
  wrap((request, response) => {
    response.json(bulkUpdateProducts(request.body));
  })
);

app.patch(
  "/api/admin/products/:id",
  requireAdmin,
  wrap((request, response) => {
    response.json(updateProduct(getRouteParam(request, "id"), request.body));
  })
);

app.delete(
  "/api/admin/products/:id",
  requireAdmin,
  wrap((request, response) => {
    deleteProduct(getRouteParam(request, "id"));
    response.status(204).end();
  })
);

app.get("/api/admin/faqs", requireAdmin, (_request, response) => {
  response.json(listFaqs(true));
});

app.post(
  "/api/admin/faqs",
  requireAdmin,
  wrap((request, response) => {
    response.status(201).json(createFaq(request.body));
  })
);

app.patch(
  "/api/admin/faqs/bulk",
  requireAdmin,
  wrap((request, response) => {
    response.json(bulkUpdateFaqs(request.body));
  })
);

app.patch(
  "/api/admin/faqs/:id",
  requireAdmin,
  wrap((request, response) => {
    response.json(updateFaq(getRouteParam(request, "id"), request.body));
  })
);

app.delete(
  "/api/admin/faqs/:id",
  requireAdmin,
  wrap((request, response) => {
    deleteFaq(getRouteParam(request, "id"));
    response.status(204).end();
  })
);

app.get("/api/admin/news", requireAdmin, (_request, response) => {
  response.json(listNews(true));
});

app.post(
  "/api/admin/news",
  requireAdmin,
  wrap((request, response) => {
    validateNewsPayload(request.body);
    response.status(201).json(createNewsItem(request.body));
  })
);

app.patch(
  "/api/admin/news/bulk",
  requireAdmin,
  wrap((request, response) => {
    response.json(bulkUpdateNews(request.body));
  })
);

app.patch(
  "/api/admin/news/:id",
  requireAdmin,
  wrap((request, response) => {
    validateNewsPayload(request.body);
    response.json(updateNewsItem(getRouteParam(request, "id"), request.body));
  })
);

app.delete(
  "/api/admin/news/:id",
  requireAdmin,
  wrap((request, response) => {
    deleteNewsItem(getRouteParam(request, "id"));
    response.status(204).end();
  })
);

app.get("/api/admin/reviews", requireAdmin, (_request, response) => {
  response.json(listReviews(true, true));
});

app.post(
  "/api/admin/reviews",
  requireAdmin,
  wrap((request, response) => {
    response.status(201).json(createReview(request.body));
  })
);

app.patch(
  "/api/admin/reviews/bulk",
  requireAdmin,
  wrap((request, response) => {
    response.json(bulkUpdateReviews(request.body));
  })
);

app.patch(
  "/api/admin/reviews/:id",
  requireAdmin,
  wrap((request, response) => {
    response.json(updateReview(getRouteParam(request, "id"), request.body));
  })
);

app.delete(
  "/api/admin/reviews/:id",
  requireAdmin,
  wrap((request, response) => {
    deleteReview(getRouteParam(request, "id"));
    response.status(204).end();
  })
);

app.get("/api/admin/leads", requireAdmin, (_request, response) => {
  response.json(listLeads());
});

app.patch(
  "/api/admin/leads/bulk",
  requireAdmin,
  wrap((request, response) => {
    response.json(bulkUpdateLeads(request.body));
  })
);

app.patch(
  "/api/admin/leads/:id",
  requireAdmin,
  wrap((request, response) => {
    response.json(
      updateLeadStatus(getRouteParam(request, "id"), request.body?.status)
    );
  })
);

app.get("/api/admin/settings", requireAdmin, (_request, response) => {
  response.json(getSiteSettings());
});

app.get("/api/admin/telegram/events", requireAdmin, (_request, response) => {
  response.json(listTelegramWebhookEvents());
});

app.patch(
  "/api/admin/settings",
  requireAdmin,
  wrap((request, response) => {
    validateSettingsPayload(request.body);
    response.json(updateSiteSettings(request.body));
  })
);

function escapeXml(value: string) {
  return value.replace(/[<>&'\"]/g, (character) => {
    const entities: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '\"': "&quot;"
    };
    return entities[character] ?? character;
  });
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function withPublicSiteBase(
  html: string,
  pathname = "/",
  metadata?: { title: string; description: string }
) {
  const baseUrl = env.publicSiteUrl.replace(/\/$/, "");
  const pageUrl = `${baseUrl}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
  let page = html
    .replace(/<link\s+rel="canonical"[^>]*\/>/, `<link rel="canonical" href="${escapeXml(pageUrl)}" />`)
    .replace(/<meta\s+property="og:url"[^>]*\/>/, `<meta property="og:url" content="${escapeXml(pageUrl)}" />`)
    .replace(/<meta\s+property="og:type"[^>]*\/>/, `<meta property="og:type" content="${pathname === "/" ? "website" : "product"}" />`)
    .replace(/("@type":\s*"Organization",[\s\S]*?"url":\s*)"[^"]+"/, `$1"${baseUrl}/"`);

  if (metadata) {
    page = page
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeXml(metadata.title)}</title>`)
      .replace(/<meta\s+property="og:title"[^>]*\/>/, `<meta property="og:title" content="${escapeXml(metadata.title)}" />`)
      .replace(/<meta\s+property="og:description"[^>]*\/>/, `<meta property="og:description" content="${escapeXml(metadata.description)}" />`);
  }

  return page;
}

app.get("/sitemap.xml", (_request, response) => {
  const baseUrl = env.publicSiteUrl.replace(/\/$/, "");
  const urls = [
    `${baseUrl}/`,
    `${baseUrl}/legal/privacy`,
    `${baseUrl}/legal/terms`,
    `${baseUrl}/legal/refund`,
    `${baseUrl}/legal/contacts`,
    ...listProducts(false).map((product) => `${baseUrl}/p/${product.slug}`)
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    "</urlset>"
  ].join("\n");

  response.type("application/xml").send(body);
});

app.get("/robots.txt", (_request, response) => {
  const baseUrl = env.publicSiteUrl.replace(/\/$/, "");
  response.type("text/plain").send(
    [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /api",
      `Sitemap: ${baseUrl}/sitemap.xml`
    ].join("\n")
  );
});

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir, { index: false }));

  app.get("/p/:slug", (request, response, next) => {
    try {
      const product = getProductBySlug(getRouteParam(request, "slug"));
      const html = withPublicSiteBase(
        readFileSync(resolve(distDir, "index.html"), "utf8"),
        `/p/${product.slug}`,
        { title: `${product.name} — Orenda Cherepashka`, description: product.summary }
      );
      const activePlans = product.pricingOptions
        .filter((plan) => plan.isActive)
        .sort((left, right) => left.sortOrder - right.sortOrder);
      const productSchema = {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.summary,
        ...(product.logo ? { image: product.logo } : {}),
        offers: activePlans.length
          ? activePlans.map((plan) => ({
              "@type": "Offer",
              name: plan.label,
              priceCurrency: plan.currency,
              price: plan.price,
              url: `${env.publicSiteUrl.replace(/\/$/, "")}/p/${product.slug}`
            }))
          : undefined
      };
      const baseUrl = env.publicSiteUrl.replace(/\/$/, "");
      const productUrl = `${baseUrl}/p/${product.slug}`;
      const breadcrumbSchema = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Головна", item: `${baseUrl}/` },
          { "@type": "ListItem", position: 2, name: "Каталог", item: `${baseUrl}/#catalog` },
          { "@type": "ListItem", position: 3, name: product.name, item: productUrl }
        ]
      };
      const meta = [
        `<script type="application/ld+json">${safeJson(productSchema)}</script>`,
        `<script type="application/ld+json">${safeJson(breadcrumbSchema)}</script>`
      ].join("\n    ");
      response.type("html").send(html.replace("</head>", `    ${meta}\n  </head>`));
    } catch (error) {
      if (error instanceof HttpError) {
        response.status(error.statusCode).send("Товар не знайдено.");
        return;
      }
      next(error);
    }
  });

  app.get(/.*/, (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.type("html").send(
      withPublicSiteBase(readFileSync(resolve(distDir, "index.html"), "utf8"))
    );
  });
}

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction
  ) => {
    if (error instanceof HttpError) {
      response.status(error.statusCode).json({ message: error.message });
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "type" in error &&
      error.type === "entity.parse.failed"
    ) {
      response.status(400).json({ message: "Невірний JSON у тілі запиту." });
      return;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string" &&
      error.code.startsWith("SQLITE_CONSTRAINT")
    ) {
      response.status(409).json({
        message: "Конфлікт даних. Перевір унікальність slug або зв'язки записів."
      });
      return;
    }

    console.error(error);
    response.status(500).json({ message: "Внутрішня помилка сервера." });
  }
);

app.listen(env.port, env.host, () => {
  console.log(`API server running at http://${env.host}:${env.port}`);
  startDatabaseBackupScheduler();
  void configureTelegramWebhook().catch((error) => {
    console.error("Failed to configure Telegram webhook", error);
  });
});
