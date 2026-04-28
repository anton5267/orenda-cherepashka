import { compareSync } from "bcryptjs";
import express from "express";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { clearAdminSession, hasAdminSession, issueAdminSession } from "./auth.js";
import { env } from "./env.js";
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
  listCategories,
  listFaqs,
  listLeads,
  listNews,
  listProducts,
  listReviews,
  updateCategory,
  updateFaq,
  updateLeadStatus,
  updateNewsItem,
  updateProduct,
  updateReview,
  updateSiteSettings
} from "./store.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..", "..");
const distDir = resolve(rootDir, "dist");

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use("/api", (_request, response, next) => {
  response.set({
    "Cache-Control": "no-store",
    Pragma: "no-cache",
    Expires: "0"
  });
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
      handler(request, response);
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
  response.json({ ok: true });
});

app.post(
  "/api/leads",
  wrap((request, response) => {
    const lead = createLead(request.body);
    response.status(201).json(lead);
  })
);

app.get("/api/admin/session", (request, response) => {
  response.json({ authenticated: hasAdminSession(request) });
});

app.post("/api/admin/login", (request, response) => {
  const password =
    typeof request.body?.password === "string" ? request.body.password : "";

  if (!password || !compareSync(password, env.adminPasswordHash)) {
    response.status(401).json({ message: "Невірний пароль." });
    return;
  }

  issueAdminSession(response);
  response.json({ authenticated: true });
});

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

app.patch(
  "/api/admin/settings",
  requireAdmin,
  wrap((request, response) => {
    response.json(updateSiteSettings(request.body));
  })
);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(distDir));

  app.get(/.*/, (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      next();
      return;
    }

    response.sendFile(resolve(distDir, "index.html"));
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
});
