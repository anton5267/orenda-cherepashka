const baseUrl =
  process.env.SELF_QA_URL ??
  "https://orenda-cherepashka-webbs.fly.dev";
const baseOrigin = new URL(baseUrl).origin;

const headers = {
  "content-type": "application/json",
  Origin: baseOrigin,
  "ngrok-skip-browser-warning": "true"
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "ngrok-skip-browser-warning": "true",
      Origin: baseOrigin,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
  }

  return {
    data,
    response
  };
}

function withCookie(cookie) {
  return {
    cookie,
    "ngrok-skip-browser-warning": "true"
  };
}

async function login() {
  const response = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers,
    body: JSON.stringify({ password: "admin1234" })
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Admin login failed: ${response.status} ${body}`);
  }

  const cookie = response.headers.get("set-cookie");
  assert(cookie, "Admin login did not return a session cookie.");
  return cookie.split(";")[0];
}

async function main() {
  const cookie = await login();
  const stamp = Date.now();

  for (const eventName of ["page_view", "product_view", "telegram_click"]) {
    await request("/api/analytics/events", {
      method: "POST",
      body: JSON.stringify({
        eventName,
        path: eventName === "product_view" ? "/p/chatgpt-plus-9" : "/",
        ...(eventName === "product_view" ? { productSlug: "chatgpt-plus-9" } : {}),
        utmSource: "admin-api-smoke"
      })
    });
  }

  const invalidAnalyticsEvent = await fetch(`${baseUrl}/api/analytics/events`, {
    method: "POST",
    headers,
    body: JSON.stringify({ eventName: "page_view", path: "/?email=private@example.com" })
  });
  assert(
    invalidAnalyticsEvent.status === 400,
    "Analytics accepted a path containing query parameters."
  );

  const { data: existingLeads } = await request("/api/admin/leads", {
    headers: withCookie(cookie)
  });
  const staleTestLeadIds = existingLeads
    .filter(
      (lead) =>
        typeof lead.name === "string" &&
        (lead.name.startsWith("TEST_UI_") || lead.name.startsWith("TEST Lead ")) &&
        lead.status !== "closed"
    )
    .map((lead) => lead.id);

  if (staleTestLeadIds.length) {
    await request("/api/admin/leads/bulk", {
      method: "PATCH",
      headers: withCookie(cookie),
      body: JSON.stringify({
        ids: staleTestLeadIds,
        action: "closed"
      })
    });
  }

  const categoryPayload = {
    name: `TEST Категорія ${stamp}`,
    slug: `test-category-${stamp}`,
    icon: "🧪",
    sortOrder: 999,
    isActive: true
  };

  const { data: category } = await request("/api/admin/categories", {
    method: "POST",
    headers: withCookie(cookie),
    body: JSON.stringify(categoryPayload)
  });

  const { data: updatedCategory } = await request(`/api/admin/categories/${category.id}`, {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      name: `${categoryPayload.name} Updated`,
      isActive: false
    })
  });
  assert(updatedCategory.isActive === false, "Category update did not persist.");

  const productPayload = {
    name: `TEST Product ${stamp}`,
    slug: `test-product-${stamp}`,
    categoryId: category.id,
    summary: "Тестовий товар для smoke-перевірки.",
    details: ["Перший пункт", "Другий пункт"],
    logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/512px-Placeholder_view_vector.svg.png",
    isHot: false,
    isActive: true,
    sortOrder: 999,
    pricingOptions: [
      {
        id: `test-plan-${stamp}`,
        label: "Тестовий план",
        price: 123,
        compareAt: 456,
        sortOrder: 1,
        isActive: true
      }
    ]
  };

  const { data: product } = await request("/api/admin/products", {
    method: "POST",
    headers: withCookie(cookie),
    body: JSON.stringify(productPayload)
  });

  const { data: bulkDeactivateProduct } = await request("/api/admin/products/bulk", {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      ids: [product.id],
      action: "deactivate"
    })
  });
  assert(bulkDeactivateProduct.count === 1, "Product bulk deactivate did not affect one row.");

  const { data: bulkActivateProduct } = await request("/api/admin/products/bulk", {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      ids: [product.id],
      action: "activate"
    })
  });
  assert(bulkActivateProduct.count === 1, "Product bulk activate did not affect one row.");

  const faqPayload = {
    question: `TEST FAQ ${stamp}?`,
    answer: "Тестова відповідь для smoke-перевірки.",
    sortOrder: 999,
    isActive: true
  };

  const { data: faq } = await request("/api/admin/faqs", {
    method: "POST",
    headers: withCookie(cookie),
    body: JSON.stringify(faqPayload)
  });

  const { data: bulkFaq } = await request("/api/admin/faqs/bulk", {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      ids: [faq.id],
      action: "deactivate"
    })
  });
  assert(bulkFaq.count === 1, "FAQ bulk action did not affect one row.");

  const newsPayload = {
    title: `TEST News ${stamp}`,
    dateLabel: "27 квітня 2026",
    content: "Тестова новина для smoke-перевірки.",
    sortOrder: 999,
    isActive: true
  };

  const { data: news } = await request("/api/admin/news", {
    method: "POST",
    headers: withCookie(cookie),
    body: JSON.stringify(newsPayload)
  });

  const { data: bulkNews } = await request("/api/admin/news/bulk", {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      ids: [news.id],
      action: "deactivate"
    })
  });
  assert(bulkNews.count === 1, "News bulk action did not affect one row.");

  const reviewPayload = {
    name: `TEST Review ${stamp}`,
    rating: 5,
    content: "Тестовий відгук для smoke-перевірки.",
    sortOrder: 999,
    isActive: true,
    isModerated: false
  };

  const { data: review } = await request("/api/admin/reviews", {
    method: "POST",
    headers: withCookie(cookie),
    body: JSON.stringify(reviewPayload)
  });

  const { data: bulkReview } = await request("/api/admin/reviews/bulk", {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      ids: [review.id],
      action: "moderate"
    })
  });
  assert(bulkReview.count === 1, "Review bulk moderation did not affect one row.");

  const { data: lead } = await request("/api/leads", {
    method: "POST",
    body: JSON.stringify({
      name: `TEST Lead ${stamp}`,
      contact: "@test_lead_contact",
      message: "Admin API smoke lead",
      neededBy: "2026-10-25",
      utmSource: "admin-api-smoke",
      utmMedium: "test",
      utmCampaign: "smoke-run",
      items: [
        {
          productId: "chatgpt-plus-shared",
          pricingOptionId: "chatgpt-plus-shared-plan-1",
          quantity: 1
        }
      ]
    })
  });
  assert(lead.neededBy === "2026-10-25", "Lead requested date did not persist.");
  assert(lead.utmSource === "admin-api-smoke", "Lead UTM source did not persist.");
  assert(lead.utmCampaign === "smoke-run", "Lead UTM campaign did not persist.");

  const { data: leads } = await request("/api/admin/leads", {
    headers: withCookie(cookie)
  });
  assert(
    leads.some((item) => item.id === lead.id && item.neededBy === "2026-10-25"),
    "Admin leads payload omitted requested date or the newly created lead."
  );

  const { data: analytics } = await request("/api/admin/analytics", {
    headers: withCookie(cookie)
  });
  assert(analytics.pageViews >= 1 && analytics.productViews >= 1 && analytics.telegramClicks >= 1);
  assert(
    analytics.popularProducts.some((item) => item.slug === "chatgpt-plus-9" && item.views >= 1),
    "Analytics summary omitted product popularity."
  );
  assert(
    analytics.campaignSources.some((item) => item.source === "admin-api-smoke" && item.leads >= 1),
    "Analytics summary omitted UTM source attribution."
  );

  const { data: bulkLeads } = await request("/api/admin/leads/bulk", {
    method: "PATCH",
    headers: withCookie(cookie),
    body: JSON.stringify({
      ids: [lead.id],
      action: "closed"
    })
  });
  assert(bulkLeads.count === 1, "Lead bulk status update did not affect one row.");

  const { data: settings } = await request("/api/admin/settings", {
    headers: withCookie(cookie)
  });
  assert(settings.heroTitle, "Admin settings payload is missing heroTitle.");

  await request(`/api/admin/products/${product.id}`, {
    method: "DELETE",
    headers: withCookie(cookie)
  });
  await request(`/api/admin/categories/${category.id}`, {
    method: "DELETE",
    headers: withCookie(cookie)
  });
  await request(`/api/admin/faqs/${faq.id}`, {
    method: "DELETE",
    headers: withCookie(cookie)
  });
  await request(`/api/admin/news/${news.id}`, {
    method: "DELETE",
    headers: withCookie(cookie)
  });
  await request(`/api/admin/reviews/${review.id}`, {
    method: "DELETE",
    headers: withCookie(cookie)
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        categoryId: category.id,
        productId: product.id,
        faqId: faq.id,
        newsId: news.id,
        reviewId: review.id,
        leadId: lead.id
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
