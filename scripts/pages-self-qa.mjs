import assert from "node:assert/strict";
import express from "express";
import { resolve } from "node:path";
import { chromium } from "playwright";

const distDir = resolve("dist");
const app = express();
app.use("/orenda-cherepashka", express.static(distDir));
app.use("/orenda-cherepashka", (_request, response) => {
  response.sendFile(resolve(distDir, "index.html"));
});

const server = await new Promise((resolveServer, reject) => {
  const nextServer = app.listen(0, "127.0.0.1", () => resolveServer(nextServer));
  nextServer.once("error", reject);
});
const address = server.address();
assert(address && typeof address !== "string", "Pages smoke server did not expose a TCP port.");

const browser = await chromium.launch({ headless: true });
const errors = [];
const contentSecurityErrors = [];
const apiSmokeEnabled = process.env.PAGES_API_SMOKE === "true";
let mockedLeadPostCount = 0;
const mockedLeadPayloads = [];

async function installPagesApiMock(page, pageOrigin) {
  if (!apiSmokeEnabled) return;

  await page.route("https://orenda-cherepashka.onrender.com/api/**", async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    const origin = request.headers().origin ?? pageOrigin;
    const corsHeaders = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (request.method() === "POST" && requestUrl.pathname === "/api/leads") {
      mockedLeadPostCount += 1;
      const payload = JSON.parse(request.postData() ?? "{}");
      mockedLeadPayloads.push(payload);
      if (mockedLeadPostCount === 1) {
        await route.fulfill({
          status: 503,
          headers: corsHeaders,
          body: JSON.stringify({ message: "Mock server unavailable." })
        });
        return;
      }

      await route.fulfill({
        status: 201,
        headers: corsHeaders,
        body: JSON.stringify({
          id: "a1b2c3d4-e5f6-47a8-9b0c-1d2e3f4a5b6c",
          name: payload.name,
          contact: payload.contact,
          message: payload.message,
          items: [],
          status: "new",
          createdAt: new Date().toISOString()
        })
      });
      return;
    }

    await route.fulfill({
      status: 503,
      headers: corsHeaders,
      body: JSON.stringify({ message: "Mock public API is offline." })
    });
  });
}

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to (?:connect|load|execute)/i.test(message.text())) {
      contentSecurityErrors.push(message.text());
    }
  });
  const baseUrl = `http://127.0.0.1:${address.port}/orenda-cherepashka/`;
  const initialUrl = apiSmokeEnabled
    ? `${baseUrl}?utm_source=pages-qa&utm_medium=smoke&utm_campaign=pages-api`
    : baseUrl;
  await installPagesApiMock(page, new URL(baseUrl).origin);
  const response = await page.goto(initialUrl, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, "GitHub Pages root did not return HTTP 200.");

  const homeHtml = await (await fetch(baseUrl)).text();
  assert.match(homeHtml, /name="robots" content="index,follow"/);
  assert.match(homeHtml, /rel="canonical" href="https:\/\/anton5267\.github\.io\/orenda-cherepashka\//);
  assert.match(homeHtml, /http-equiv="Content-Security-Policy"/);
  assert.match(homeHtml, /connect-src[^\"]+orenda-cherepashka\.onrender\.com/);
  assert.doesNotMatch(homeHtml, /orenda-cherepashka\.shop/);
  const robotsResponse = await fetch(`${baseUrl}robots.txt`);
  const robotsText = await robotsResponse.text();
  assert.equal(robotsResponse.status, 200, "GitHub Pages robots.txt did not return HTTP 200.");
  assert.match(robotsText, /Sitemap: https:\/\/anton5267\.github\.io\/orenda-cherepashka\/sitemap\.xml/);
  const sitemapResponse = await fetch(`${baseUrl}sitemap.xml`);
  const sitemapText = await sitemapResponse.text();
  assert.equal(sitemapResponse.status, 200, "GitHub Pages sitemap.xml did not return HTTP 200.");
  assert.equal((sitemapText.match(/<loc>/g) ?? []).length, 40, "Sitemap should contain home, four legal pages and 35 products.");

  await page.locator(".product-card").first().waitFor();
  assert.equal(await page.locator(".product-card").count(), 35, "Pages catalog did not render all products.");
  const gmailCard = page.locator(".product-card").filter({ hasText: "Gmail пошта" }).first();
  assert.equal(await gmailCard.locator(".plan-chip").filter({ hasText: "$1.90" }).count(), 1);
  assert.equal(await gmailCard.locator(".plan-chip").filter({ hasText: "$1.70" }).count(), 1);

  await page.locator("#news").scrollIntoViewIfNeeded();
  const feedStatus = await page.locator(".news-feed-status").innerText();
  assert.match(feedStatus, /Остання автоматична перевірка/);
  assert.match(feedStatus, /Найновіший допис у каналі/);
  assert.ok(await page.locator(".news-expiry.is-expired").count(), "Expired Telegram promo was not marked as archived.");

  assert.equal(await page.locator('a[href="https://t.me/yts_nnn"]').count() > 0, true);
  assert.equal(await page.locator('a[href="https://t.me/arenda_cherepashka"]').count() > 0, true);
  assert.equal(await page.locator('a[href="https://t.me/cherepashka_vidguk"]').count() > 0, true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    true,
    "Mobile Pages layout overflows horizontally."
  );

  if (apiSmokeEnabled) {
    await page.getByPlaceholder("Наприклад, ChatGPT, Netflix, VPN...").fill("ChatGPT");
    await page.waitForTimeout(300);
    const chatGptCard = page.locator(".product-card").filter({ hasText: "ChatGPT Plus" }).first();
    await chatGptCard.getByRole("button", { name: "Замовити" }).click();
    await page.getByLabel("Ім'я").fill("Pages API QA");
    await page.getByLabel("Контакт").fill("@pages_api_qa");
    await page.getByLabel("Повідомлення").fill("Mocked Pages to API test");
    const neededBy = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    await page.getByLabel("Коли потрібна підписка").fill(neededBy);

    await page.getByRole("button", { name: /Надіслати/ }).click();
    await page.locator(".form-success").filter({ hasText: "заявка не збережена" }).waitFor();
    const telegramFallback = page.locator(".form-success a");
    assert.match(await telegramFallback.getAttribute("href"), /^https:\/\/t\.me\/yts_nnn\?text=/);
    assert.equal(mockedLeadPostCount, 1, "Offline API fallback did not attempt one lead request.");

    await page.getByRole("button", { name: /Надіслати/ }).click();
    await page.waitForFunction(() =>
      document.querySelector(".form-success")?.textContent?.includes("Заявку збережено в адмінці. Номер:")
    );
    assert.match(await page.locator(".form-success").innerText(), /Номер: [A-F0-9]{8}\./);
    assert.equal(mockedLeadPostCount, 2, "Retry did not reach the live API mock.");
    assert.equal(mockedLeadPayloads[1]?.neededBy, neededBy, "Requested date was omitted from the API lead payload.");
    assert.equal(mockedLeadPayloads[1]?.utmSource, "pages-qa", "UTM source was omitted from the API lead payload.");
    assert.equal(mockedLeadPayloads[1]?.utmCampaign, "pages-api", "UTM campaign was omitted from the API lead payload.");
    const savedLeadContactLink = page.locator(".form-success a");
    assert.equal(await savedLeadContactLink.count(), 1, "Saved lead did not offer a manager follow-up link.");
    assert.match(await savedLeadContactLink.getAttribute("href"), /^https:\/\/t\.me\/yts_nnn\?text=/);
    assert.match(await savedLeadContactLink.innerText(), /Написати менеджеру/);
  }

  const productResponse = await page.goto(`${baseUrl}p/grok-super-personal`, {
    waitUntil: "domcontentloaded"
  });
  assert.equal(productResponse?.status(), 200, "Static product deep link did not return HTTP 200.");
  await page.getByRole("heading", { name: /Grok Super/i }).first().waitFor();
  const productHtml = await (await fetch(`${baseUrl}p/grok-super-personal/`)).text();
  assert.match(productHtml, /<title>🏷 Grok Super \[особистий\] — Orenda Cherepashka<\/title>/);
  assert.match(productHtml, /rel="canonical" href="https:\/\/anton5267\.github\.io\/orenda-cherepashka\/p\/grok-super-personal\//);
  const productSchema = [...productHtml.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  )].map((match) => JSON.parse(match[1])).find((schema) => schema["@type"] === "Product");
  assert.equal(productSchema?.offers?.length, 2, "Grok product metadata should contain both price offers.");
  assert.equal(productSchema.offers[1].price, 2200, "Grok 3-month package metadata has the wrong total price.");
  assert.equal(productSchema.offers[1].priceCurrency, "UAH");
  assert.equal("availability" in productSchema.offers[1], false, "Product metadata claimed unverified stock.");

  const gmailHtml = await (await fetch(`${baseUrl}p/gmail-mailbox/`)).text();
  const gmailSchema = [...gmailHtml.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  )].map((match) => JSON.parse(match[1])).find((schema) => schema["@type"] === "Product");
  assert(gmailSchema?.offers?.every((offer) => offer.priceCurrency === "USD"));
  assert.equal((await fetch(`${baseUrl}legal/privacy/`)).status, 200, "Legal page deep link did not return HTTP 200.");
  assert.deepEqual(errors, [], "Pages reported client-side errors.");
  assert.deepEqual(contentSecurityErrors, [], "Pages reported a Content Security Policy violation.");

  console.log(JSON.stringify({
    ok: true,
    productCount: 35,
    staticNewsStatus: feedStatus,
    expiredPromotionsMarked: true,
    productSeo: "accurate currency, package price and canonical URL",
    robotsAndSitemap: "200",
    telegramLinks: "contact, news, reviews",
    pagesApiFlow: apiSmokeEnabled ? "offline fallback and successful retry" : undefined,
    contentSecurityPolicy: "no violations",
    productDeepLink: "ok",
    mobileOverflow: false
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
