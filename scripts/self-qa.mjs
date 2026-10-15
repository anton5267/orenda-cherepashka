import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium } from "playwright";

const baseUrl =
  process.env.SELF_QA_URL ??
  "https://orenda-cherepashka-webbs.fly.dev";
const baseOrigin = new URL(baseUrl).origin;
const outputDir = resolve("artifacts", "self-qa");

mkdirSync(outputDir, { recursive: true });

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function requestJson(path, options = {}) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
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
        if (response.status >= 500 && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }

        throw new Error(`${options.method ?? "GET"} ${path} failed: ${response.status} ${text}`);
      }

      return {
        data,
        response
      };
    } catch (error) {
      const isNetworkError =
        error instanceof TypeError ||
        error?.cause?.code === "ECONNRESET" ||
        error?.cause?.code === "ETIMEDOUT";

      if (!isNetworkError || attempt === maxAttempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
}

async function loginAdminCookie() {
  const { response } = await requestJson("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password: "admin1234" })
  });
  const cookie = response.headers.get("set-cookie");
  assert(cookie, "Admin login did not return a session cookie.");
  return cookie.split(";")[0];
}

function authHeaders(cookie) {
  return {
    cookie,
    "ngrok-skip-browser-warning": "true"
  };
}

async function saveScreenshot(page, name) {
  const path = join(outputDir, name);
  await page.screenshot({ path, fullPage: true });
  return path;
}

async function checkProductStructuredData() {
  const { data: products } = await requestJson("/api/products");
  const gmailProduct = products.find((product) => product.slug === "gmail-mailbox");
  assert(gmailProduct, "Gmail product was not available for structured-data checks.");
  assert(gmailProduct.pricingOptions.length === 2, "Gmail catalog data did not contain both plans.");

  const response = await fetch(`${baseUrl}/p/${gmailProduct.slug}`, {
    headers: { "ngrok-skip-browser-warning": "true" }
  });
  const html = await response.text();
  assert(response.ok, `Gmail product route returned ${response.status}.`);
  assert(html.includes(`<link rel="canonical" href="${baseUrl}/p/${gmailProduct.slug}" />`),
    "Server product canonical URL did not use the configured public site URL.");

  const schemas = [...html.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  )].map((match) => JSON.parse(match[1]));
  const schema = schemas.find((item) => item["@type"] === "Product");
  const breadcrumbs = schemas.find((item) => item["@type"] === "BreadcrumbList");
  assert(schema, "Product page did not include Product JSON-LD structured data.");
  assert(breadcrumbs?.itemListElement?.length === 3,
    "Server product page did not include BreadcrumbList structured data.");
  assert(Array.isArray(schema.offers) && schema.offers.length === 2,
    `Product JSON-LD did not expose both active Gmail price options: ${JSON.stringify(schema.offers)}`);
  assert(schema.offers.every((offer) => offer.priceCurrency === "USD"),
    "USD product offers were published with the wrong currency.");
  assert(schema.offers.every((offer) => !("availability" in offer)),
    "Product JSON-LD claimed stock availability without an inventory source.");

  const robotsResponse = await fetch(`${baseUrl}/robots.txt`);
  assert(robotsResponse.ok && (await robotsResponse.text()).includes(`${baseUrl}/sitemap.xml`),
    "Server robots.txt did not reference the sitemap.");
  const sitemapResponse = await fetch(`${baseUrl}/sitemap.xml`);
  const sitemap = await sitemapResponse.text();
  assert(sitemapResponse.ok && sitemap.includes(`${baseUrl}/p/${gmailProduct.slug}`),
    "Server sitemap did not contain the product URL.");
}

async function revealSections(page) {
  const targets = ["#catalog", "#faq", "#news", "#lead-form", "#reviews", "footer"];

  for (const selector of targets) {
    const locator = page.locator(selector).first();
    if ((await locator.count()) === 0) {
      continue;
    }

    await locator.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
  }
}

async function closeBrowserSmokeLeads(cookie, leadName) {
  const { data: leads } = await requestJson("/api/admin/leads", {
    headers: authHeaders(cookie)
  });
  const matchingIds = leads
    .filter((lead) => lead.name === leadName && lead.status !== "closed")
    .map((lead) => lead.id);

  if (!matchingIds.length) {
    return;
  }

  await requestJson("/api/admin/leads/bulk", {
    method: "PATCH",
    headers: authHeaders(cookie),
    body: JSON.stringify({
      ids: matchingIds,
      action: "closed"
    })
  });
}

async function runCatalogFreshnessRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  let category = null;
  let product = null;

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();

  try {
    ({ data: category } = await requestJson("/api/admin/categories", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({
        name: `TEST Refresh Category ${stamp}`,
        slug: `test-refresh-category-${stamp}`,
        icon: "🧪",
        sortOrder: 999,
        isActive: true
      })
    }));

    ({ data: product } = await requestJson("/api/admin/products", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({
        name: `TEST Refresh Product ${stamp}`,
        slug: `test-refresh-product-${stamp}`,
        categoryId: category.id,
        summary: "Тестовий товар для перевірки live-refresh каталогу.",
        details: ["Автоматичний регресійний тест"],
        logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/512px-Placeholder_view_vector.svg.png",
        isHot: false,
        isActive: true,
        sortOrder: 999,
        pricingOptions: [
          {
            id: `test-refresh-plan-${stamp}`,
            label: "Тестовий тариф",
            price: 111,
            compareAt: 222,
            sortOrder: 1,
            isActive: true
          }
        ]
      })
    }));

    await page.goto(`${baseUrl}/?q=${encodeURIComponent(`TEST Refresh Product ${stamp}`)}`, {
      waitUntil: "networkidle"
    });
    const testCard = page.locator(".product-card").filter({ hasText: `TEST Refresh Product ${stamp}` }).first();
    await testCard.waitFor({ timeout: 15000 });
    await testCard.getByRole("button", { name: "Замовити" }).click();
    await page.locator(".lead-summary-selected").filter({ hasText: `TEST Refresh Product ${stamp}` }).waitFor();

    await requestJson("/api/admin/products/bulk", {
      method: "PATCH",
      headers: authHeaders(cookie),
      body: JSON.stringify({
        ids: [product.id],
        action: "deactivate"
      })
    });

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForFunction(
      (expectedName) =>
        document.querySelectorAll(".product-card").length === 0 ||
        !Array.from(document.querySelectorAll(".product-card")).some((card) =>
          card.textContent?.includes(expectedName)
        ),
      `TEST Refresh Product ${stamp}`,
      { timeout: 15000 }
    );

    await page.waitForFunction(
      (expectedName) =>
        !document.querySelector(".lead-summary-selected") ||
        !document.querySelector(".lead-summary-selected")?.textContent?.includes(expectedName),
      `TEST Refresh Product ${stamp}`,
      { timeout: 15000 }
    );

    assert(
      (await page.locator(".product-card").filter({ hasText: `TEST Refresh Product ${stamp}` }).count()) === 0,
      "Disabled product is still visible in the already opened catalog."
    );
  } finally {
    await context.close();
    if (product?.id) {
      await requestJson(`/api/admin/products/${product.id}`, {
        method: "DELETE",
        headers: authHeaders(cookie)
      });
    }
    if (category?.id) {
      await requestJson(`/api/admin/categories/${category.id}`, {
        method: "DELETE",
        headers: authHeaders(cookie)
      });
    }
  }
}

async function cleanupProductsByName(cookie, productName) {
  const { data: products } = await requestJson("/api/admin/products", {
    headers: authHeaders(cookie)
  });
  const matching = products.filter((product) => product.name === productName);

  for (const product of matching) {
    await requestJson(`/api/admin/products/${product.id}`, {
      method: "DELETE",
      headers: authHeaders(cookie)
    });
  }
}

async function cleanupCategoriesByName(cookie, categoryName) {
  const { data: categories } = await requestJson("/api/admin/categories", {
    headers: authHeaders(cookie)
  });
  const matching = categories.filter((category) => category.name === categoryName);

  for (const category of matching) {
    await requestJson(`/api/admin/categories/${category.id}`, {
      method: "DELETE",
      headers: authHeaders(cookie)
    });
  }
}

async function cleanupFaqsByQuestion(cookie, question) {
  const { data: faqs } = await requestJson("/api/admin/faqs", {
    headers: authHeaders(cookie)
  });
  const matching = faqs.filter((item) => item.question === question);

  for (const item of matching) {
    await requestJson(`/api/admin/faqs/${item.id}`, {
      method: "DELETE",
      headers: authHeaders(cookie)
    });
  }
}

async function cleanupNewsByTitle(cookie, title) {
  const { data: news } = await requestJson("/api/admin/news", {
    headers: authHeaders(cookie)
  });
  const matching = news.filter((item) => item.title === title);

  for (const item of matching) {
    await requestJson(`/api/admin/news/${item.id}`, {
      method: "DELETE",
      headers: authHeaders(cookie)
    });
  }
}

async function cleanupReviewsByName(cookie, name) {
  const { data: reviews } = await requestJson("/api/admin/reviews", {
    headers: authHeaders(cookie)
  });
  const matching = reviews.filter((item) => item.name === name);

  for (const item of matching) {
    await requestJson(`/api/admin/reviews/${item.id}`, {
      method: "DELETE",
      headers: authHeaders(cookie)
    });
  }
}

async function closeLeadsByName(cookie, leadName) {
  const { data: leads } = await requestJson("/api/admin/leads", {
    headers: authHeaders(cookie)
  });
  const matchingIds = leads
    .filter((lead) => lead.name === leadName && lead.status !== "closed")
    .map((lead) => lead.id);

  if (!matchingIds.length) {
    return;
  }

  await requestJson("/api/admin/leads/bulk", {
    method: "PATCH",
    headers: authHeaders(cookie),
    body: JSON.stringify({
      ids: matchingIds,
      action: "closed"
    })
  });
}

async function waitForCardToDisappear(page, selector, expectedText) {
  await page.waitForFunction(
    ({ selector, expectedText }) =>
      document.querySelectorAll(selector).length === 0 ||
      !Array.from(document.querySelectorAll(selector)).some((card) =>
        card.textContent?.includes(expectedText)
      ),
    { selector, expectedText },
    { timeout: 15000 }
  );
}

async function runAdminCategoryRecoveryRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const categoryName = `TEST UI Category ${stamp}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await cleanupCategoriesByName(cookie, categoryName);

    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/categories`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Категорії" }).first().waitFor();

    const publicPage = await context.newPage();
    await publicPage.goto(baseUrl, { waitUntil: "networkidle" });
    await publicPage.getByRole("heading", { name: /топові сервіси/i }).waitFor();

    const form = page.locator("#editor-panel form").first();
    const topLevelLabels = form.locator(":scope > label");
    const nameInput = topLevelLabels.nth(0).locator("input");
    const slugInput = topLevelLabels.nth(1).locator("input");
    const iconInput = topLevelLabels.nth(2).locator("input");

    let createFailureInjected = false;
    await page.route("**/api/admin/categories", async (route, request) => {
      if (request.method() === "POST" && !createFailureInjected) {
        createFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося зберегти категорію."
          })
        });
        return;
      }

      await route.continue();
    });

    await nameInput.fill(categoryName);
    await slugInput.fill(`test-ui-category-${stamp}`);
    await iconInput.fill("🧪");
    await form.getByRole("button", { name: "Створити", exact: true }).first().click();

    const saveFailureNotice = form
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося зберегти категорію" })
      .first();
    await saveFailureNotice.waitFor({ timeout: 15000 });
    assert(
      (await nameInput.inputValue()) === categoryName,
      "Category draft name was lost after failed save recovery scenario."
    );
    await saveFailureNotice.getByRole("button", { name: "Повторити збереження" }).click();
    await page.unroute("**/api/admin/categories");

    const createdCard = page.locator(".admin-list-item").filter({ hasText: categoryName }).first();
    await createdCard.waitFor({ timeout: 15000 });
    await createdCard.getByText("Активна").waitFor({ timeout: 15000 });

    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await publicPage.locator(".filter-pill").filter({ hasText: categoryName }).first().waitFor({
      timeout: 15000
    });

    let quickFailureInjected = false;
    await page.route("**/api/admin/categories/*", async (route, request) => {
      if (request.method() === "PATCH" && !quickFailureInjected) {
        quickFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося оновити категорію."
          })
        });
        return;
      }

      await route.continue();
    });

    await createdCard.getByRole("button", { name: "Вимкнути", exact: true }).click();
    const quickFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося оновити категорію" })
      .first();
    await quickFailureNotice.waitFor({ timeout: 15000 });
    await createdCard.getByText("Активна").waitFor({ timeout: 15000 });
    await quickFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await createdCard.getByText("Вимкнена").waitFor({ timeout: 15000 });
    await page.unroute("**/api/admin/categories/*");

    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForCardToDisappear(publicPage, ".filter-pill", categoryName);

    let deleteFailureInjected = false;
    await page.route("**/api/admin/categories/*", async (route, request) => {
      if (request.method() === "DELETE" && !deleteFailureInjected) {
        deleteFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося видалити категорію."
          })
        });
        return;
      }

      await route.continue();
    });

    await createdCard.getByRole("button", { name: "Видалити", exact: true }).click();
    const deleteFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося видалити категорію" })
      .first();
    await deleteFailureNotice.waitFor({ timeout: 15000 });
    await deleteFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await page.unroute("**/api/admin/categories/*");
    await page.waitForFunction(
      (expectedName) =>
        !Array.from(document.querySelectorAll(".admin-list-item")).some((card) =>
          card.textContent?.includes(expectedName)
        ),
      categoryName,
      { timeout: 15000 }
    );

    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForCardToDisappear(publicPage, ".filter-pill", categoryName);
    await publicPage.close();
  } finally {
    await context.close();
    await cleanupCategoriesByName(cookie, categoryName);
  }
}

async function runAdminProductCrudRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const productName = `TEST UI Product ${stamp}`;
  const updatedSummary = `Оновлений UI summary ${stamp}`;
  const updatedPrice = 555;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/products`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Товари" }).first().waitFor();

    const form = page.locator("#editor-panel form").first();
    const topLevelLabels = form.locator(":scope > label");
    const productNameInput = topLevelLabels.nth(0).locator("input");
    const slugInput = topLevelLabels.nth(1).locator("input");
    const categorySelect = topLevelLabels.nth(2).locator("select");
    const summaryTextarea = topLevelLabels.nth(3).locator("textarea");
    const logoInput = topLevelLabels.nth(4).locator("input");
    const detailInput = form.getByPlaceholder("Окрема перевага або деталь").first();
    const pricingCard = form.locator(".pricing-editor-card").first();

    await productNameInput.fill(productName);
    await slugInput.fill(`test-ui-product-${stamp}`);
    await categorySelect.selectOption({ index: 1 });
    await summaryTextarea.fill(`Первинний UI summary ${stamp}`);
    await logoInput.fill(
      "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/512px-Placeholder_view_vector.svg.png"
    );
    await detailInput.fill("UI regression detail");
    await pricingCard.getByLabel("Назва", { exact: true }).fill("UI Plan");
    await pricingCard.getByLabel("Ціна", { exact: true }).fill("333");
    await pricingCard.getByLabel("Стара ціна", { exact: true }).fill("444");
    let productCreateFailureInjected = false;
    await page.route("**/api/admin/products", async (route, request) => {
      if (request.method() === "POST" && !productCreateFailureInjected) {
        productCreateFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося зберегти товар."
          })
        });
        return;
      }

      await route.continue();
    });
    await form.getByRole("button", { name: "Створити", exact: true }).first().click();
    const productSaveFailureNotice = form
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося зберегти товар" })
      .first();
    await productSaveFailureNotice.waitFor({ timeout: 15000 });
    assert(
      (await productNameInput.inputValue()) === productName,
      "Product draft name was lost after failed save recovery scenario."
    );
    await productSaveFailureNotice
      .getByRole("button", { name: "Повторити збереження" })
      .click();
    await page.unroute("**/api/admin/products");

    const createdCard = page.locator(".admin-list-item").filter({ hasText: productName }).first();
    await createdCard.waitFor({ timeout: 15000 });
    await createdCard.getByText("333 грн").waitFor();

    const publicPage = await context.newPage();
    await publicPage.goto(`${baseUrl}/?q=${encodeURIComponent(productName)}`, {
      waitUntil: "networkidle"
    });
    const publicCard = publicPage.locator(".product-card").filter({ hasText: productName }).first();
    await publicCard.waitFor({ timeout: 15000 });
    await publicCard.locator(".price-box strong").getByText("333 грн", { exact: true }).waitFor();

    await createdCard.getByRole("button", { name: "Редагувати", exact: true }).click();
    await page.waitForFunction(
      (expectedName) => {
        const input = document.querySelector("#editor-panel form input");
        return input && input.value === expectedName;
      },
      productName
    );

    await summaryTextarea.fill(updatedSummary);
    await pricingCard.getByLabel("Ціна", { exact: true }).fill(String(updatedPrice));
    const hotCheckbox = form.getByLabel("Хіт", { exact: true });
    if (!(await hotCheckbox.isChecked())) {
      await hotCheckbox.check();
    }
    await form.getByRole("button", { name: "Оновити", exact: true }).first().click();
    await createdCard.getByText(updatedSummary).waitFor({ timeout: 15000 });
    await createdCard.getByText("555 грн").waitFor();
    await createdCard.getByRole("button", { name: "Зняти хіт", exact: true }).waitFor();

    await publicPage.reload({ waitUntil: "networkidle" });
    const updatedPublicCard = publicPage.locator(".product-card").filter({ hasText: productName }).first();
    await updatedPublicCard.waitFor({ timeout: 15000 });
    await updatedPublicCard
      .locator(".price-box strong")
      .getByText("555 грн", { exact: true })
      .waitFor();

    await createdCard.getByRole("button", { name: "Вимкнути", exact: true }).click();
    await createdCard.getByText("Вимкнений").waitFor({ timeout: 15000 });
    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await publicPage.waitForFunction(
      (expectedName) =>
        document.querySelectorAll(".product-card").length === 0 ||
        !Array.from(document.querySelectorAll(".product-card")).some((card) =>
          card.textContent?.includes(expectedName)
        ),
      productName,
      { timeout: 15000 }
    );

    let productDeleteFailureInjected = false;
    await page.route("**/api/admin/products/*", async (route, request) => {
      if (request.method() === "DELETE" && !productDeleteFailureInjected) {
        productDeleteFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося видалити товар."
          })
        });
        return;
      }

      await route.continue();
    });
    await createdCard.getByRole("button", { name: "Видалити", exact: true }).click();
    const productDeleteFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося видалити товар" })
      .first();
    await productDeleteFailureNotice.waitFor({ timeout: 15000 });
    await productDeleteFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await page.unroute("**/api/admin/products/*");
    await page.waitForFunction(
      (expectedName) =>
        !Array.from(document.querySelectorAll(".admin-list-item")).some((card) =>
          card.textContent?.includes(expectedName)
        ),
      productName,
      { timeout: 15000 }
    );

    await publicPage.close();
  } finally {
    await context.close();
    await cleanupProductsByName(cookie, productName);
  }
}

async function runAdminFaqCrudRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const question = `TEST UI FAQ ${stamp}?`;
  const updatedAnswer = `Оновлена FAQ відповідь ${stamp}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/faqs`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "FAQ" }).first().waitFor();

    const form = page.locator("#editor-panel form").first();
    const topLevelLabels = form.locator(":scope > label");
    await topLevelLabels.nth(0).locator("input").fill(question);
    await topLevelLabels.nth(1).locator("textarea").fill(`Первинна FAQ відповідь ${stamp}`);
    let faqCreateFailureInjected = false;
    await page.route("**/api/admin/faqs", async (route, request) => {
      if (request.method() === "POST" && !faqCreateFailureInjected) {
        faqCreateFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося зберегти FAQ."
          })
        });
        return;
      }

      await route.continue();
    });
    await form.getByRole("button", { name: "Створити", exact: true }).first().click();
    const faqSaveFailureNotice = form
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося зберегти FAQ" })
      .first();
    await faqSaveFailureNotice.waitFor({ timeout: 15000 });
    assert(
      (await topLevelLabels.nth(0).locator("input").inputValue()) === question,
      "FAQ draft question was lost after failed save recovery scenario."
    );
    await faqSaveFailureNotice.getByRole("button", { name: "Повторити збереження" }).click();
    await page.unroute("**/api/admin/faqs");

    const createdCard = page.locator(".admin-list-item").filter({ hasText: question }).first();
    await createdCard.waitFor({ timeout: 15000 });

    const publicPage = await context.newPage();
    await publicPage.goto(`${baseUrl}#faq`, { waitUntil: "networkidle" });
    const publicFaqCard = publicPage.locator(".faq-item").filter({ hasText: question }).first();
    await publicFaqCard.waitFor({ timeout: 15000 });
    await publicFaqCard.locator(".faq-question").click();
    await publicFaqCard.getByText(`Первинна FAQ відповідь ${stamp}`, { exact: true }).waitFor();

    await createdCard.getByRole("button", { name: "Редагувати", exact: true }).click();
    await topLevelLabels.nth(1).locator("textarea").fill(updatedAnswer);
    await form.getByRole("button", { name: "Оновити", exact: true }).first().click();
    await createdCard.getByText(updatedAnswer, { exact: true }).waitFor({ timeout: 15000 });

    await publicPage.reload({ waitUntil: "networkidle" });
    const updatedPublicFaqCard = publicPage.locator(".faq-item").filter({ hasText: question }).first();
    await updatedPublicFaqCard.waitFor({ timeout: 15000 });
    await updatedPublicFaqCard.locator(".faq-question").click();
    await updatedPublicFaqCard.getByText(updatedAnswer, { exact: true }).waitFor();

    let faqQuickFailureInjected = false;
    await page.route("**/api/admin/faqs/*", async (route, request) => {
      if (request.method() === "PATCH" && !faqQuickFailureInjected) {
        faqQuickFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося оновити FAQ."
          })
        });
        return;
      }

      await route.continue();
    });

    await createdCard.getByRole("button", { name: "Вимкнути", exact: true }).click();
    const faqFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося оновити FAQ" })
      .first();
    await faqFailureNotice.waitFor({ timeout: 15000 });
    await createdCard.getByText("Активний").waitFor({ timeout: 15000 });
    await faqFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await createdCard.getByText("Вимкнений").waitFor({ timeout: 15000 });
    await page.unroute("**/api/admin/faqs/*");
    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForCardToDisappear(publicPage, ".faq-item", question);

    let faqDeleteFailureInjected = false;
    await page.route("**/api/admin/faqs/*", async (route, request) => {
      if (request.method() === "DELETE" && !faqDeleteFailureInjected) {
        faqDeleteFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося видалити FAQ."
          })
        });
        return;
      }

      await route.continue();
    });
    await createdCard.getByRole("button", { name: "Видалити", exact: true }).click();
    const faqDeleteFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося видалити FAQ" })
      .first();
    await faqDeleteFailureNotice.waitFor({ timeout: 15000 });
    await faqDeleteFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await page.unroute("**/api/admin/faqs/*");
    await waitForCardToDisappear(page, ".admin-list-item", question);

    await publicPage.close();
  } finally {
    await context.close();
    await cleanupFaqsByQuestion(cookie, question);
  }
}

async function runAdminNewsCrudRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const title = `TEST UI News ${stamp}`;
  const updatedContent = `Оновлений news текст ${stamp}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/news`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Новини" }).first().waitFor();

    const form = page.locator("#editor-panel form").first();
    const topLevelLabels = form.locator(":scope > label");
    await topLevelLabels.nth(0).locator("input").fill(title);
    await topLevelLabels.nth(1).locator("input").fill("28.04.2026");
    await topLevelLabels.nth(2).locator("textarea").fill(`Первинний news текст ${stamp}`);
    let newsCreateFailureInjected = false;
    await page.route("**/api/admin/news", async (route, request) => {
      if (request.method() === "POST" && !newsCreateFailureInjected) {
        newsCreateFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося зберегти новину."
          })
        });
        return;
      }

      await route.continue();
    });
    await form.getByRole("button", { name: "Створити", exact: true }).first().click();
    const newsSaveFailureNotice = form
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося зберегти новину" })
      .first();
    await newsSaveFailureNotice.waitFor({ timeout: 15000 });
    assert(
      (await topLevelLabels.nth(0).locator("input").inputValue()) === title,
      "News draft title was lost after failed save recovery scenario."
    );
    await newsSaveFailureNotice.getByRole("button", { name: "Повторити збереження" }).click();
    await page.unroute("**/api/admin/news");

    const createdCard = page.locator(".admin-list-item").filter({ hasText: title }).first();
    await createdCard.waitFor({ timeout: 15000 });

    const publicPage = await context.newPage();
    await publicPage.goto(`${baseUrl}#news`, { waitUntil: "networkidle" });
    const publicNewsCard = publicPage.locator(".news-card").filter({ hasText: title }).first();
    await publicNewsCard.waitFor({ timeout: 15000 });
    await publicNewsCard.getByText("28.04.2026", { exact: true }).waitFor();

    await createdCard.getByRole("button", { name: "Редагувати", exact: true }).click();
    await topLevelLabels.nth(2).locator("textarea").fill(updatedContent);
    await form.getByRole("button", { name: "Оновити", exact: true }).first().click();
    await createdCard.getByText(updatedContent, { exact: true }).waitFor({ timeout: 15000 });

    await publicPage.reload({ waitUntil: "networkidle" });
    const updatedPublicNewsCard = publicPage.locator(".news-card").filter({ hasText: title }).first();
    await updatedPublicNewsCard.waitFor({ timeout: 15000 });
    await updatedPublicNewsCard.getByText(updatedContent, { exact: true }).waitFor();

    let newsQuickFailureInjected = false;
    await page.route("**/api/admin/news/*", async (route, request) => {
      if (request.method() === "PATCH" && !newsQuickFailureInjected) {
        newsQuickFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося оновити новину."
          })
        });
        return;
      }

      await route.continue();
    });

    await createdCard.getByRole("button", { name: "Вимкнути", exact: true }).click();
    const newsFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося оновити новину" })
      .first();
    await newsFailureNotice.waitFor({ timeout: 15000 });
    await createdCard.getByText("Активна").waitFor({ timeout: 15000 });
    await newsFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await createdCard.getByText("Вимкнена").waitFor({ timeout: 15000 });
    await page.unroute("**/api/admin/news/*");
    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForCardToDisappear(publicPage, ".news-card", title);

    let newsDeleteFailureInjected = false;
    await page.route("**/api/admin/news/*", async (route, request) => {
      if (request.method() === "DELETE" && !newsDeleteFailureInjected) {
        newsDeleteFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося видалити новину."
          })
        });
        return;
      }

      await route.continue();
    });
    await createdCard.getByRole("button", { name: "Видалити", exact: true }).click();
    const newsDeleteFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося видалити новину" })
      .first();
    await newsDeleteFailureNotice.waitFor({ timeout: 15000 });
    await newsDeleteFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await page.unroute("**/api/admin/news/*");
    await waitForCardToDisappear(page, ".admin-list-item", title);

    await publicPage.close();
  } finally {
    await context.close();
    await cleanupNewsByTitle(cookie, title);
  }
}

async function runAdminReviewCrudRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const reviewerName = `TEST UI Review ${stamp}`;
  const pendingContent = `Відгук до модерації ${stamp}`;
  const updatedContent = `Промодерований відгук ${stamp}`;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();
  page.on("dialog", (dialog) => dialog.accept());

  try {
    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/reviews`, { waitUntil: "networkidle" });
    await page.getByRole("heading", { name: "Відгуки" }).first().waitFor();

    const form = page.locator("#editor-panel form").first();
    const topLevelLabels = form.locator(":scope > label");
    await topLevelLabels.nth(0).locator("input").fill(reviewerName);
    await topLevelLabels.nth(1).locator("select").selectOption("4");
    await topLevelLabels.nth(2).locator("textarea").fill(pendingContent);
    const checkboxRows = form.locator(".checkbox-grid .checkbox-row");
    const moderatedCheckbox = checkboxRows.nth(1).locator("input");
    if (await moderatedCheckbox.isChecked()) {
      await moderatedCheckbox.uncheck();
    }
    let reviewCreateFailureInjected = false;
    await page.route("**/api/admin/reviews", async (route, request) => {
      if (request.method() === "POST" && !reviewCreateFailureInjected) {
        reviewCreateFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося зберегти відгук."
          })
        });
        return;
      }

      await route.continue();
    });
    await form.getByRole("button", { name: "Створити", exact: true }).first().click();
    const reviewSaveFailureNotice = form
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося зберегти відгук" })
      .first();
    await reviewSaveFailureNotice.waitFor({ timeout: 15000 });
    assert(
      (await topLevelLabels.nth(0).locator("input").inputValue()) === reviewerName,
      "Review draft name was lost after failed save recovery scenario."
    );
    await reviewSaveFailureNotice
      .getByRole("button", { name: "Повторити збереження" })
      .click();
    await page.unroute("**/api/admin/reviews");

    const createdCard = page.locator(".admin-list-item").filter({ hasText: reviewerName }).first();
    await createdCard.waitFor({ timeout: 15000 });
    await createdCard.getByText("Потрібна модерація", { exact: true }).waitFor();

    const publicPage = await context.newPage();
    await publicPage.goto(`${baseUrl}#reviews`, { waitUntil: "networkidle" });
    await waitForCardToDisappear(publicPage, ".review-card", reviewerName);

    await createdCard.getByRole("button", { name: "Редагувати", exact: true }).click();
    await topLevelLabels.nth(2).locator("textarea").fill(updatedContent);
    await form.getByRole("button", { name: "Оновити", exact: true }).first().click();
    await createdCard.getByText(updatedContent, { exact: true }).waitFor({ timeout: 15000 });

    let reviewQuickFailureInjected = false;
    await page.route("**/api/admin/reviews/*", async (route, request) => {
      if (request.method() === "PATCH" && !reviewQuickFailureInjected) {
        reviewQuickFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося оновити відгук."
          })
        });
        return;
      }

      await route.continue();
    });

    await createdCard.getByRole("button", { name: "Промодерувати", exact: true }).click();
    const reviewFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося оновити відгук" })
      .first();
    await reviewFailureNotice.waitFor({ timeout: 15000 });
    await createdCard.getByText("Потрібна модерація", { exact: true }).waitFor({
      timeout: 15000
    });
    await reviewFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await createdCard.getByText("Промодерований", { exact: true }).waitFor({ timeout: 15000 });
    await page.unroute("**/api/admin/reviews/*");
    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    const publicReviewCard = publicPage.locator(".review-card").filter({ hasText: reviewerName }).first();
    await publicReviewCard.waitFor({ timeout: 15000 });
    await publicReviewCard.getByText(updatedContent, { exact: true }).waitFor();

    await createdCard.getByRole("button", { name: "Вимкнути", exact: true }).click();
    await createdCard.getByText("Вимкнений", { exact: true }).waitFor({ timeout: 15000 });
    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await waitForCardToDisappear(publicPage, ".review-card", reviewerName);

    let reviewDeleteFailureInjected = false;
    await page.route("**/api/admin/reviews/*", async (route, request) => {
      if (request.method() === "DELETE" && !reviewDeleteFailureInjected) {
        reviewDeleteFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося видалити відгук."
          })
        });
        return;
      }

      await route.continue();
    });
    await createdCard.getByRole("button", { name: "Видалити", exact: true }).click();
    const reviewDeleteFailureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося видалити відгук" })
      .first();
    await reviewDeleteFailureNotice.waitFor({ timeout: 15000 });
    await reviewDeleteFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await page.unroute("**/api/admin/reviews/*");
    await waitForCardToDisappear(page, ".admin-list-item", reviewerName);

    await publicPage.close();
  } finally {
    await context.close();
    await cleanupReviewsByName(cookie, reviewerName);
  }
}

async function runAdminMobileFaqBulkRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const questionPrefix = `TEST UI Bulk FAQ ${stamp}`;
  const questions = [`${questionPrefix} A?`, `${questionPrefix} B?`];
  const createdIds = [];

  const publicContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const publicPage = await publicContext.newPage();

  const adminContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const adminPage = await adminContext.newPage();
  adminPage.on("dialog", (dialog) => dialog.accept());

  try {
    for (const [index, question] of questions.entries()) {
      const { data: faq } = await requestJson("/api/admin/faqs", {
        method: "POST",
        headers: authHeaders(cookie),
        body: JSON.stringify({
          question,
          answer: `Bulk FAQ answer ${stamp} ${index + 1}`,
          sortOrder: 900 + index,
          isActive: true
        })
      });
      createdIds.push(faq.id);
    }

    await publicPage.goto(`${baseUrl}#faq`, { waitUntil: "networkidle" });
    for (const question of questions) {
      await publicPage.locator(".faq-item").filter({ hasText: question }).first().waitFor({
        timeout: 15000
      });
    }

    await adminPage.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await adminPage.getByLabel("Пароль").fill("admin1234");
    await adminPage.getByRole("button", { name: "Увійти" }).click();
    await adminPage.waitForURL(/\/admin\/dashboard/);
    await adminPage.locator(".admin-menu-toggle").click();
    const mobileMenuPanel = adminPage.locator(".admin-mobile-menu-panel");
    await mobileMenuPanel.waitFor();
    const mobileFaqLink = mobileMenuPanel
      .locator(".admin-mobile-nav a")
      .filter({ hasText: "FAQ" })
      .first();
    await mobileFaqLink.scrollIntoViewIfNeeded();
    await mobileFaqLink.click();
    await mobileMenuPanel.waitFor({ state: "detached" });
    await adminPage.getByRole("heading", { name: "FAQ" }).first().waitFor();

    await adminPage.getByPlaceholder("Питання або відповідь").fill(questionPrefix);
    const faqCards = adminPage.locator(".admin-list-item").filter({ hasText: questionPrefix });
    await faqCards.first().waitFor({ timeout: 15000 });

    await adminPage.getByLabel("Виділити всі видимі").check();
    const floatingToolbar = adminPage.locator(".bulk-toolbar-floating");
    await floatingToolbar.waitFor();

    let faqBulkFailureInjected = false;
    await adminPage.route("**/api/admin/faqs/bulk", async (route, request) => {
      if (request.method() === "PATCH" && !faqBulkFailureInjected) {
        faqBulkFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося виконати bulk-операцію для FAQ."
          })
        });
        return;
      }

      await route.continue();
    });

    await floatingToolbar.locator("select").selectOption({ label: "Деактивувати" });
    await floatingToolbar.getByRole("button", { name: "Застосувати", exact: true }).click();
    const faqFailureNotice = adminPage
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося виконати bulk-дію для FAQ" })
      .first();
    await faqFailureNotice.waitFor({ timeout: 15000 });
    assert(
      (await floatingToolbar.locator("select").inputValue()) === "deactivate",
      "FAQ bulk action choice was lost after failed mobile bulk recovery scenario."
    );
    await faqFailureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await adminPage.waitForFunction(
      (prefix) =>
        Array.from(document.querySelectorAll(".admin-list-item"))
          .filter((card) => card.textContent?.includes(prefix))
          .every((card) => card.textContent?.includes("Вимкнений")),
      questionPrefix,
      { timeout: 15000 }
    );
    await adminPage.unroute("**/api/admin/faqs/bulk");

    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    for (const question of questions) {
      await waitForCardToDisappear(publicPage, ".faq-item", question);
    }

    await adminPage.getByLabel("Виділити всі видимі").check();
    await floatingToolbar.locator("select").selectOption({ label: "Активувати" });
    await floatingToolbar.getByRole("button", { name: "Застосувати", exact: true }).click();
    await adminPage.waitForFunction(
      (prefix) =>
        Array.from(document.querySelectorAll(".admin-list-item"))
          .filter((card) => card.textContent?.includes(prefix))
          .every((card) => card.textContent?.includes("Активний")),
      questionPrefix,
      { timeout: 15000 }
    );

    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    for (const question of questions) {
      await publicPage.locator(".faq-item").filter({ hasText: question }).first().waitFor({
        timeout: 15000
      });
    }

    await adminPage.getByLabel("Виділити всі видимі").check();
    await floatingToolbar.locator("select").selectOption({ label: "Видалити" });
    await floatingToolbar.getByRole("button", { name: "Застосувати", exact: true }).click();
    await adminPage.waitForFunction(
      (prefix) =>
        !Array.from(document.querySelectorAll(".admin-list-item")).some((card) =>
          card.textContent?.includes(prefix)
        ),
      questionPrefix,
      { timeout: 15000 }
    );

    await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    for (const question of questions) {
      await waitForCardToDisappear(publicPage, ".faq-item", question);
    }
  } finally {
    await adminContext.close();
    await publicContext.close();
    for (const id of createdIds) {
      try {
        await requestJson(`/api/admin/faqs/${id}`, {
          method: "DELETE",
          headers: authHeaders(cookie)
        });
      } catch {
        // Ignore cleanup races if the UI regression already deleted the records.
      }
    }
  }
}

async function runAdminProductBulkRecoveryRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const productName = `TEST UI Product Bulk Recovery ${stamp}`;
  let productId = null;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();

  try {
    const { data: categories } = await requestJson("/api/admin/categories", {
      headers: authHeaders(cookie)
    });
    const fallbackCategory = categories.find((item) => item.isActive) ?? categories[0];
    assert(fallbackCategory, "No category available for product bulk recovery regression.");

    const { data: product } = await requestJson("/api/admin/products", {
      method: "POST",
      headers: authHeaders(cookie),
      body: JSON.stringify({
        name: productName,
        slug: `test-ui-product-bulk-recovery-${stamp}`,
        categoryId: fallbackCategory.id,
        summary: "Тестовий товар для bulk recovery.",
        details: ["Тестовий товар для bulk recovery."],
        logo: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/Placeholder_view_vector.svg/512px-Placeholder_view_vector.svg.png",
        isHot: false,
        isActive: false,
        sortOrder: 999,
        pricingOptions: [
          {
            id: `test-ui-product-bulk-plan-${stamp}`,
            label: "Тестовий тариф",
            price: 99,
            compareAt: 199,
            sortOrder: 1,
            isActive: true
          }
        ]
      })
    });
    productId = product.id;

    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/products?q=${encodeURIComponent(productName)}`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("heading", { name: "Товари" }).first().waitFor();

    const createdCard = page.locator(".admin-list-item").filter({ hasText: productName }).first();
    await createdCard.waitFor({ timeout: 15000 });
    await createdCard.getByText("Вимкнений").waitFor({ timeout: 15000 });
    await createdCard.locator('input[type="checkbox"]').check();

    const bulkToolbar = page.locator(".bulk-toolbar-inline");
    await bulkToolbar.locator("select").selectOption({ label: "Активувати" });

    let bulkFailureInjected = false;
    await page.route("**/api/admin/products/bulk", async (route, request) => {
      if (request.method() === "PATCH" && !bulkFailureInjected) {
        bulkFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося виконати bulk-операцію."
          })
        });
        return;
      }

      await route.continue();
    });

    await bulkToolbar.getByRole("button", { name: "Застосувати", exact: true }).click();
    const failureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося виконати bulk-дію" })
      .first();
    await failureNotice.waitFor({ timeout: 15000 });
    assert(
      await createdCard.locator('input[type="checkbox"]').isChecked(),
      "Product selection was lost after failed bulk recovery scenario."
    );
    assert(
      (await bulkToolbar.locator("select").inputValue()) === "activate",
      "Bulk action choice was lost after failed product bulk scenario."
    );

    await failureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await createdCard.getByText("Активний").waitFor({ timeout: 15000 });
    await createdCard.getByRole("button", { name: "Вимкнути", exact: true }).waitFor();
    await page.unroute("**/api/admin/products/bulk");
  } finally {
    await context.close();
    if (productId) {
      try {
        await requestJson(`/api/admin/products/${productId}`, {
          method: "DELETE",
          headers: authHeaders(cookie)
        });
      } catch {
        // ignore cleanup races
      }
    }
    await cleanupProductsByName(cookie, productName);
  }
}

async function runAdminLeadStatusRecoveryRegression(browser) {
  const cookie = await loginAdminCookie();
  const stamp = Date.now();
  const leadName = `TEST UI Lead Recovery ${stamp}`;
  let leadId = null;
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await context.newPage();

  try {
    const { data: products } = await requestJson("/api/admin/products", {
      headers: authHeaders(cookie)
    });
    const sourceProduct = products.find(
      (item) => item.isActive && item.pricingOptions.some((plan) => plan.isActive)
    );
    assert(sourceProduct, "No active product with plans available for lead recovery regression.");
    const sourcePlan = sourceProduct.pricingOptions.find((plan) => plan.isActive) ?? sourceProduct.pricingOptions[0];
    assert(sourcePlan, "No pricing option available for lead recovery regression.");

    const { data: lead } = await requestJson("/api/leads", {
      method: "POST",
      body: JSON.stringify({
        name: leadName,
        contact: "@test_ui_lead_recovery",
        message: "Regression lead for retry flow",
        items: [
          {
            productId: sourceProduct.id,
            pricingOptionId: sourcePlan.id,
            quantity: 1
          }
        ]
      })
    });
    leadId = lead.id;

    await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
    await page.getByLabel("Пароль").fill("admin1234");
    await page.getByRole("button", { name: "Увійти" }).click();
    await page.waitForURL(/\/admin\/dashboard/);
    await page.goto(`${baseUrl}/admin/leads?q=${encodeURIComponent(leadName)}`, {
      waitUntil: "networkidle"
    });
    await page.getByRole("heading", { name: "Заявки" }).first().waitFor();

    const leadCard = page.locator(".admin-list-item").filter({ hasText: leadName }).first();
    await leadCard.waitFor({ timeout: 15000 });
    await leadCard.locator(".status-badge").filter({ hasText: "Нова" }).first().waitFor({
      timeout: 15000
    });

    let statusFailureInjected = false;
    await page.route("**/api/admin/leads/*", async (route, request) => {
      if (request.method() === "PATCH" && !statusFailureInjected) {
        statusFailureInjected = true;
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({
            message: "Тимчасово не вдалося оновити статус."
          })
        });
        return;
      }

      await route.continue();
    });

    await leadCard.getByRole("button", { name: "У роботі", exact: true }).click();
    const failureNotice = page
      .locator(".notice-panel")
      .filter({ hasText: "Не вдалося оновити статус заявки" })
      .first();
    await failureNotice.waitFor({ timeout: 15000 });
    await leadCard.locator(".status-badge").filter({ hasText: "Нова" }).first().waitFor({
      timeout: 15000
    });

    await failureNotice.getByRole("button", { name: "Повторити дію" }).click();
    await leadCard.locator(".status-badge").filter({ hasText: "У роботі" }).first().waitFor({
      timeout: 15000
    });
    await page.unroute("**/api/admin/leads/*");
  } finally {
    await context.close();
    await closeLeadsByName(cookie, leadName);
    if (leadId) {
      try {
        await requestJson(`/api/admin/leads/${leadId}`, {
          method: "PATCH",
          headers: authHeaders(cookie),
          body: JSON.stringify({ status: "closed" })
        });
      } catch {
        // ignore cleanup races
      }
    }
  }
}

async function runPublicChecks(browser) {
  await checkProductStructuredData();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1200 },
    colorScheme: "light",
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });

  const page = await context.newPage();
  const leadName = `TEST_UI_${Date.now()}`;

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("heading", {
    name: /топові сервіси/i
  }).waitFor();

  const heroText = await page.locator("main").innerText();
  assert(
    heroText.includes("ChatGPT, Netflix, Spotify, VPN"),
    "Hero subtitle did not render expected services text."
  );

  const initialCatalogCards = page.locator(".product-card");
  await initialCatalogCards.filter({ hasText: "ELEVENLABS 131K credits" }).waitFor();
  assert(
    (await initialCatalogCards.count()) === 35,
    "Public catalog did not render all 35 items from the seller's price list."
  );
  const gmailCard = initialCatalogCards.filter({ hasText: "Gmail пошта" }).first();
  assert(
    (await gmailCard.locator(".plan-chip").filter({ hasText: "$1.90" }).count()) === 1 &&
      (await gmailCard.locator(".plan-chip").filter({ hasText: "$1.70" }).count()) === 1,
    "Gmail quantity prices were not rendered in USD."
  );
  const chatGptProCard = initialCatalogCards.filter({ hasText: "ChatGPT Pro" }).first();
  assert(
    (await chatGptProCard.locator(".plan-chip").count()) === 4,
    "ChatGPT Pro did not show all four Codex and multi-month price options."
  );
  const grokPersonalCard = initialCatalogCards.filter({ hasText: "Grok Super [особистий]" }).first();
  assert(
    (await grokPersonalCard.locator(".plan-chip").filter({ hasText: "800 грн" }).count()) === 1 &&
      (await grokPersonalCard.locator(".plan-chip").filter({ hasText: "3 міс · за пакет" }).filter({ hasText: "2 200 грн" }).count()) === 1,
    "Grok personal monthly and three-month package prices were not rendered accurately."
  );

  const initialTheme = await page.evaluate(
    () => document.documentElement.dataset.theme
  );
  await page.locator(".theme-toggle").first().click();
  await page.waitForFunction(
    (previousTheme) => document.documentElement.dataset.theme !== previousTheme,
    initialTheme
  );
  const toggledTheme = await page.evaluate(
    () => document.documentElement.dataset.theme
  );
  assert(
    initialTheme && toggledTheme && initialTheme !== toggledTheme,
    "Theme toggle did not change the document theme."
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (expectedTheme) => document.documentElement.dataset.theme === expectedTheme,
    toggledTheme
  );
  const persistedTheme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert(
    persistedTheme === toggledTheme,
    "Theme preference did not persist after reload."
  );

  await page.getByPlaceholder("Наприклад, ChatGPT, Netflix, VPN...").fill("ChatGPT");
  await page.waitForTimeout(400);
  const productCards = page.locator(".product-card");
  const filteredCount = await productCards.count();
  assert(filteredCount >= 1, "Catalog search returned no cards for ChatGPT.");

  const targetCard = productCards.filter({ hasText: "ChatGPT Plus" }).first();
  await targetCard.getByRole("button", { name: "Замовити" }).click();

  const currentSelection = page.locator(".lead-summary-selected");
  await currentSelection.waitFor();
  const selectionText = await currentSelection.innerText();
  assert(
    selectionText.includes("ChatGPT Plus"),
    "Lead form did not receive selected product."
  );

  await page.getByRole("button", { name: /Надіслати/ }).click();
  await page.getByText("Вкажи ім'я.").waitFor();
  await page.getByText("Вкажи контакт для зв'язку.").waitFor();

  await page.getByLabel("Ім'я").fill(leadName);
  await page.getByLabel("Контакт").fill("@test_ui_contact");
  await page.getByLabel("Повідомлення").fill("Self QA browser smoke");
  let leadFailureInjected = false;
  await page.route("**/api/leads", async (route, request) => {
    if (request.method() === "POST" && !leadFailureInjected) {
      leadFailureInjected = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Тимчасово не вдалося прийняти заявку."
        })
      });
      return;
    }

    await route.continue();
  });
  await page.getByRole("button", { name: /Надіслати/ }).click();
  const leadFailureNotice = page
    .locator(".notice-panel")
    .filter({ hasText: "Не вдалося відправити заявку" })
    .first();
  await leadFailureNotice.waitFor({ timeout: 15000 });
  assert(
    (await page.getByLabel("Ім'я").inputValue()) === leadName,
    "Lead name was lost after failed submit recovery scenario."
  );
  assert(
    (await page.getByLabel("Контакт").inputValue()) === "@test_ui_contact",
    "Lead contact was lost after failed submit recovery scenario."
  );
  await leadFailureNotice.getByRole("button", { name: "Повторити відправку" }).click();

  await page.locator(".form-success").waitFor({ timeout: 15000 });
  const successText = await page.locator(".form-success").innerText();
  assert(
    /заявк/i.test(successText),
    "Lead form success state did not appear after submit."
  );
  await page.unroute("**/api/leads");

  await revealSections(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const desktopShot = await saveScreenshot(page, "public-desktop.png");

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    colorScheme: "dark",
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });

  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(baseUrl, { waitUntil: "networkidle" });
  await mobilePage.getByRole("heading", {
    name: /топові сервіси/i
  }).waitFor();
  const mobileMenuToggle = mobilePage.locator(".menu-toggle");
  const mobileCta = mobilePage.locator(".mobile-cta");

  assert(await mobileCta.isVisible(), "Mobile CTA is not visible.");

  if (await mobileMenuToggle.count()) {
    await mobileMenuToggle.click();
    const mobileMenuPanel = mobilePage.locator(".mobile-menu-panel");
    await mobileMenuPanel.waitFor();
    await mobileMenuPanel.getByRole("link", { name: "Залишити заявку" }).click();
    await mobileMenuPanel.waitFor({ state: "detached" });
    await mobilePage.locator("#lead-form").waitFor();
  }

  await mobilePage.goto(`${baseUrl}/?q=ChatGPT`, { waitUntil: "networkidle" });
  await mobilePage
    .locator(".product-card")
    .filter({ hasText: "ChatGPT Plus" })
    .first()
    .getByRole("button", { name: "Замовити" })
    .click();
  await mobilePage.locator(".mobile-cta.has-selection").waitFor();
  await mobilePage.getByRole("link", { name: "Оформити вибір" }).click();
  await mobilePage.locator("#lead-form").scrollIntoViewIfNeeded();
  await mobilePage.locator(".lead-summary-selected").waitFor();

  await revealSections(mobilePage);
  await mobilePage.evaluate(() => window.scrollTo(0, 0));
  await mobilePage.waitForTimeout(300);
  const mobileShot = await saveScreenshot(mobilePage, "public-mobile.png");
  await mobilePage.locator("#lead-form").scrollIntoViewIfNeeded();
  const mobileLeadShot = await saveScreenshot(mobilePage, "public-mobile-lead.png");
  await mobileContext.close();

  const cookie = await loginAdminCookie();
  await closeBrowserSmokeLeads(cookie, leadName);
  await context.close();

  return {
    leadName,
    desktopShot,
    mobileShot,
    mobileLeadShot
  };
}

async function runAdminChecks(browser) {
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const page = await desktopContext.newPage();

  let loginSessionFailureInjected = false;
  await page.route("**/api/admin/session", async (route, request) => {
    if (request.method() === "GET" && !loginSessionFailureInjected) {
      loginSessionFailureInjected = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Тимчасово не вдалося перевірити сесію."
        })
      });
      return;
    }

    await route.continue();
  });
  await page.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Вхід в адмін-панель" }).waitFor();
  const loginSessionFailureNotice = page
    .locator(".notice-panel")
    .filter({ hasText: "Не вдалося перевірити сесію" })
    .first();
  await loginSessionFailureNotice.waitFor({ timeout: 15000 });
  await loginSessionFailureNotice.getByRole("button", { name: "Повторити запит" }).click();
  await page.unroute("**/api/admin/session");
  await page.getByLabel("Пароль").waitFor({ timeout: 15000 });
  let loginFailureInjected = false;
  await page.route("**/api/admin/login", async (route, request) => {
    if (request.method() === "POST" && !loginFailureInjected) {
      loginFailureInjected = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Тимчасово не вдалося увійти."
        })
      });
      return;
    }

    await route.continue();
  });
  await page.getByLabel("Пароль").fill("admin1234");
  await page.getByRole("button", { name: "Увійти" }).click();
  const loginFailureNotice = page
    .locator(".notice-panel")
    .filter({ hasText: "Не вдалося увійти" })
    .first();
  await loginFailureNotice.waitFor({ timeout: 15000 });
  await loginFailureNotice.getByRole("button", { name: "Повторити вхід" }).click();
  await page.unroute("**/api/admin/login");
  await page.waitForURL(/\/admin\/dashboard/);
  await page.getByText("Огляд").first().waitFor();

  const navTargets = [
    { label: "Товари", heading: "Товари" },
    { label: "FAQ", heading: "FAQ" },
    { label: "Заявки", heading: "Заявки" },
    { label: "Налаштування", heading: "Налаштування" }
  ];

  for (const target of navTargets) {
    await page
      .locator(".admin-nav")
      .getByRole("link", { name: target.label, exact: true })
      .click();
    await page.getByRole("heading", { name: target.heading }).first().waitFor();
  }

  const settingsForm = page.locator(".admin-card form").first();
  const settingsHeroTitleInput = settingsForm
    .locator("label")
    .filter({ hasText: "Заголовок hero" })
    .locator("input");
  const originalHeroTitle = await settingsHeroTitleInput.inputValue();
  const draftHeroTitle = `${originalHeroTitle} TEST`;
  await settingsHeroTitleInput.fill(draftHeroTitle);
  await page.locator(".admin-sidebar-status").getByText("Незбережені зміни").waitFor();

  page.once("dialog", (dialog) => {
    void dialog.dismiss().catch(() => {});
  });
  await page
    .locator(".admin-nav")
    .getByRole("link", { name: "Новини", exact: true })
    .click();
  await page.waitForFunction(() => window.location.pathname === "/admin/settings");
  assert(
    (await settingsHeroTitleInput.inputValue()) === draftHeroTitle,
    "Unsaved settings draft was lost after dismissing guarded navigation."
  );

  const acceptDesktopDialog = (dialog) => {
    void dialog.accept().catch(() => {});
  };
  page.on("dialog", acceptDesktopDialog);
  const desktopNewsLink = page
    .locator(".admin-nav")
    .getByRole("link", { name: "Новини", exact: true });
  try {
    await desktopNewsLink.click();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await page.waitForTimeout(500);
      if ((await page.evaluate(() => window.location.pathname)) === "/admin/news") {
        break;
      }

      await desktopNewsLink.click();
    }
    await Promise.race([
      page.waitForFunction(() => window.location.pathname === "/admin/news", undefined, {
        timeout: 45000
      }),
      page.getByRole("heading", { name: "Новини" }).first().waitFor({ timeout: 45000 })
    ]);
  } finally {
    page.off("dialog", acceptDesktopDialog);
  }
  await page
    .locator(".admin-nav")
    .getByRole("link", { name: "Налаштування", exact: true })
    .click();
  await page.waitForFunction(() => window.location.pathname === "/admin/settings");
  assert(
    (await settingsHeroTitleInput.inputValue()) === originalHeroTitle,
    "Discarded settings draft leaked into persisted settings after guarded navigation."
  );

  let settingsSaveFailureInjected = false;
  await page.route("**/api/admin/settings", async (route, request) => {
    if (request.method() === "PATCH" && !settingsSaveFailureInjected) {
      settingsSaveFailureInjected = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Тимчасово не вдалося зберегти налаштування."
        })
      });
      return;
    }

    await route.continue();
  });

  const retryHeroTitle = `${originalHeroTitle} RETRY`;
  await settingsHeroTitleInput.fill(retryHeroTitle);
  await settingsForm.locator(".editor-toolbar").getByRole("button", { name: "Зберегти" }).click();
  const settingsFailureNotice = settingsForm
    .locator(".notice-panel")
    .filter({ hasText: "Не вдалося зберегти налаштування" })
    .first();
  await settingsFailureNotice.waitFor({ timeout: 15000 });
  assert(
    (await settingsHeroTitleInput.inputValue()) === retryHeroTitle,
    "Settings draft was lost after failed save recovery scenario."
  );
  await settingsFailureNotice
    .getByRole("button", { name: "Повторити збереження" })
    .click();
  await page.waitForFunction(
    () => !document.querySelector(".admin-sidebar-status") &&
      document.body.textContent?.includes("Все збережено"),
    undefined,
    { timeout: 15000 }
  );
  assert(
    (await settingsHeroTitleInput.inputValue()) === retryHeroTitle,
    "Settings value changed unexpectedly after retry save."
  );

  await settingsHeroTitleInput.fill(originalHeroTitle);
  await settingsForm.locator(".editor-toolbar").getByRole("button", { name: "Зберегти" }).click();
  await page.waitForFunction(
    () => !document.querySelector(".admin-sidebar-status"),
    undefined,
    { timeout: 15000 }
  );
  await page.unroute("**/api/admin/settings");

  const adminShot = await saveScreenshot(page, "admin-settings.png");
  let logoutFailureInjected = false;
  await page.route("**/api/admin/logout", async (route, request) => {
    if (request.method() === "POST" && !logoutFailureInjected) {
      logoutFailureInjected = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Тимчасово не вдалося завершити сесію."
        })
      });
      return;
    }

    await route.continue();
  });
  await page
    .locator(".admin-sidebar-footer")
    .getByRole("button", { name: "Вийти", exact: true })
    .click();
  const logoutFailureNotice = page
    .locator(".notice-panel")
    .filter({ hasText: "Не вдалося завершити сесію" })
    .first();
  await logoutFailureNotice.waitFor({ timeout: 15000 });
  await logoutFailureNotice.getByRole("button", { name: "Повторити вихід" }).click();
  await page.waitForURL(/\/admin\/login/, { timeout: 30000 });
  await page.unroute("**/api/admin/logout");
  await desktopContext.close();

  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    extraHTTPHeaders: {
      "ngrok-skip-browser-warning": "true"
    }
  });
  const mobilePage = await mobileContext.newPage();

  await mobilePage.goto(`${baseUrl}/admin/login`, { waitUntil: "networkidle" });
  await mobilePage.getByRole("heading", { name: "Вхід в адмін-панель" }).waitFor();
  await mobilePage.getByLabel("Пароль").fill("admin1234");
  await mobilePage.getByRole("button", { name: "Увійти" }).click();
  await mobilePage.waitForURL(/\/admin\/dashboard/);
  await mobilePage.locator(".admin-mobile-bar").waitFor();

  await mobilePage.locator(".admin-menu-toggle").click();
  const mobileMenuPanel = mobilePage.locator(".admin-mobile-menu-panel");
  await mobileMenuPanel.waitFor();
  const mobileLeadsLink = mobileMenuPanel
    .locator(".admin-mobile-nav a")
    .filter({ hasText: "Заявки" })
    .first();
  await mobileLeadsLink.scrollIntoViewIfNeeded();
  await mobileLeadsLink.click();
  await mobileMenuPanel.waitFor({ state: "detached" });
  await mobilePage.getByRole("heading", { name: "Заявки" }).first().waitFor();

  await mobilePage.locator(".admin-menu-toggle").click();
  await mobileMenuPanel.waitFor();
  const mobileSettingsLink = mobileMenuPanel
    .locator(".admin-mobile-nav a")
    .filter({ hasText: "Налаштування" })
    .first();
  await mobileSettingsLink.scrollIntoViewIfNeeded();
  await mobileSettingsLink.click();
  await mobileMenuPanel.waitFor({ state: "detached" });
  await mobilePage.getByRole("heading", { name: "Налаштування" }).first().waitFor();

  const mobileSettingsForm = mobilePage.locator(".admin-card form").first();
  const mobileSettingsHeroTitleInput = mobileSettingsForm
    .locator("label")
    .filter({ hasText: "Заголовок hero" })
    .locator("input");
  const originalMobileHeroTitle = await mobileSettingsHeroTitleInput.inputValue();
  const mobileDraftHeroTitle = `${originalMobileHeroTitle} MOBILE`;
  await mobileSettingsHeroTitleInput.fill(mobileDraftHeroTitle);
  await mobilePage.locator(".admin-mobile-bar .admin-unsaved-pill").waitFor();

  await mobilePage.locator(".admin-menu-toggle").click();
  await mobileMenuPanel.waitFor();
  await mobileMenuPanel.locator(".admin-mobile-menu-status").getByText("Незбережені зміни").waitFor();

  mobilePage.once("dialog", (dialog) => {
    void dialog.dismiss().catch(() => {});
  });
  await mobileLeadsLink.click();
  await mobilePage.waitForFunction(() => window.location.pathname === "/admin/settings");
  assert(
    (await mobileSettingsHeroTitleInput.inputValue()) === mobileDraftHeroTitle,
    "Unsaved mobile settings draft was lost after dismissing guarded drawer navigation."
  );
  await mobilePage.waitForTimeout(200);
  if (!(await mobileMenuPanel.isVisible().catch(() => false))) {
    await mobilePage.locator(".admin-menu-toggle").click();
    await mobileMenuPanel.waitFor();
  }

  mobilePage.once("dialog", (dialog) => {
    void dialog.accept().catch(() => {});
  });
  const mobileLeadsLinkRetry = mobileMenuPanel
    .locator(".admin-mobile-nav a")
    .filter({ hasText: "Заявки" })
    .first();
  await mobileLeadsLinkRetry.scrollIntoViewIfNeeded();
  await mobileLeadsLinkRetry.click();
  await mobilePage.waitForFunction(() => window.location.pathname === "/admin/leads");
  await mobileMenuPanel.waitFor({ state: "detached" });
  assert(
    !(await mobilePage.locator(".admin-mobile-bar .admin-unsaved-pill").count()),
    "Mobile unsaved indicator remained visible after discarding draft and leaving settings."
  );

  await mobilePage.locator(".admin-menu-toggle").click();
  await mobileMenuPanel.waitFor();
  await mobileSettingsLink.scrollIntoViewIfNeeded();
  await mobileSettingsLink.click();
  await mobileMenuPanel.waitFor({ state: "detached" });
  await mobilePage.waitForFunction(() => window.location.pathname === "/admin/settings");
  assert(
    (await mobileSettingsHeroTitleInput.inputValue()) === originalMobileHeroTitle,
    "Discarded mobile settings draft leaked into persisted settings after drawer navigation."
  );

  const responsiveWidths = [320, 375, 390, 768, 1024, 1440, 1920];
  const adminResponsiveAudit = [];
  for (const width of responsiveWidths) {
    await mobilePage.setViewportSize({ width, height: 900 });
    const layout = await mobilePage.evaluate(() => {
      const textClips = [...document.querySelectorAll("body *")]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return rect.width > 0 && rect.height > 0 && element.children.length === 0 &&
            Boolean(element.textContent?.trim()) && !(Number(style.webkitLineClamp) > 0) &&
            (["hidden", "clip"].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 2 ||
              ["hidden", "clip"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 2);
        })
        .map((element) => element.textContent.trim().slice(0, 60));
      const controlsOutsideViewport = [...document.querySelectorAll(
        "a, button, input, select, textarea"
      )]
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return getComputedStyle(element).display !== "none" && rect.width > 0 &&
            (rect.left < -1 || rect.right > window.innerWidth + 1);
        })
        .map((element) => element.textContent.trim().slice(0, 50) || element.tagName);
      const overlappingGroups = [];
      for (const selector of [".admin-mobile-bar", ".admin-section-head", ".admin-form-actions", ".editor-toolbar"]) {
        const group = document.querySelector(selector);
        if (!group) continue;
        const items = [...group.children].filter((element) => {
          const rect = element.getBoundingClientRect();
          return getComputedStyle(element).display !== "none" && rect.width > 0;
        });
        for (let index = 0; index < items.length; index += 1) {
          for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
            const first = items[index].getBoundingClientRect();
            const second = items[otherIndex].getBoundingClientRect();
            if (
              Math.min(first.right, second.right) - Math.max(first.left, second.left) > 2 &&
              Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top) > 2
            ) {
              overlappingGroups.push(selector);
            }
          }
        }
      }
      return {
        width: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        textClips,
        controlsOutsideViewport,
        overlappingGroups
      };
    });

    assert(
      layout.documentWidth <= width + 1,
      `Admin settings overflow horizontally at ${width}px: ${layout.documentWidth}px.`
    );
    assert(layout.textClips.length === 0, `Admin settings clip text at ${width}px: ${layout.textClips.join(" | ")}`);
    assert(
      layout.controlsOutsideViewport.length === 0,
      `Admin controls are off-screen at ${width}px: ${layout.controlsOutsideViewport.join(" | ")}`
    );
    assert(
      layout.overlappingGroups.length === 0,
      `Admin layout items overlap at ${width}px: ${layout.overlappingGroups.join(", ")}`
    );
    adminResponsiveAudit.push(width);
  }
  await mobilePage.setViewportSize({ width: 390, height: 844 });

  const adminMobileShot = await saveScreenshot(mobilePage, "admin-mobile-settings.png");
  let mobileLogoutFailureInjected = false;
  await mobilePage.route("**/api/admin/logout", async (route, request) => {
    if (request.method() === "POST" && !mobileLogoutFailureInjected) {
      mobileLogoutFailureInjected = true;
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          message: "Тимчасово не вдалося завершити сесію."
        })
      });
      return;
    }

    await route.continue();
  });
  await mobilePage.locator(".admin-menu-toggle").click();
  await mobileMenuPanel.waitFor();
  await mobileMenuPanel
    .locator(".admin-mobile-menu-actions")
    .getByRole("button", { name: "Вийти", exact: true })
    .click();
  const mobileLogoutFailureNotice = mobileMenuPanel
    .locator(".notice-panel")
    .filter({ hasText: "Не вдалося завершити сесію" })
    .first();
  await mobileLogoutFailureNotice.waitFor({ timeout: 15000 });
  await mobileLogoutFailureNotice
    .getByRole("button", { name: "Повторити вихід" })
    .click();
  await mobilePage.unroute("**/api/admin/logout");
  await mobilePage.waitForURL(/\/admin\/login/, { timeout: 15000 });
  await mobileContext.close();

  return { adminShot, adminMobileShot, adminResponsiveAudit };
}

async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    const publicResult = await runPublicChecks(browser);
    await runCatalogFreshnessRegression(browser);
    await runAdminCategoryRecoveryRegression(browser);
    await runAdminProductCrudRegression(browser);
    await runAdminProductBulkRecoveryRegression(browser);
    await runAdminFaqCrudRegression(browser);
    await runAdminNewsCrudRegression(browser);
    await runAdminReviewCrudRegression(browser);
    await runAdminMobileFaqBulkRegression(browser);
    await runAdminLeadStatusRecoveryRegression(browser);
    const adminResult = await runAdminChecks(browser);

    console.log(
      JSON.stringify(
        {
          ok: true,
          baseUrl,
          ...publicResult,
          ...adminResult
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
