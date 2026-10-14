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

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => errors.push(error.message));
  const baseUrl = `http://127.0.0.1:${address.port}/orenda-cherepashka/`;
  const response = await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
  assert.equal(response?.status(), 200, "GitHub Pages root did not return HTTP 200.");

  const homeHtml = await (await fetch(baseUrl)).text();
  assert.match(homeHtml, /name="robots" content="index,follow"/);
  assert.match(homeHtml, /rel="canonical" href="https:\/\/anton5267\.github\.io\/orenda-cherepashka\//);
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

  console.log(JSON.stringify({
    ok: true,
    productCount: 35,
    staticNewsStatus: feedStatus,
    expiredPromotionsMarked: true,
    productSeo: "accurate currency, package price and canonical URL",
    robotsAndSitemap: "200",
    telegramLinks: "contact, news, reviews",
    productDeepLink: "ok",
    mobileOverflow: false
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
