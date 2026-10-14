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
  assert.deepEqual(errors, [], "Pages reported client-side errors.");

  console.log(JSON.stringify({
    ok: true,
    productCount: 35,
    staticNewsStatus: feedStatus,
    expiredPromotionsMarked: true,
    telegramLinks: "contact, news, reviews",
    productDeepLink: "ok",
    mobileOverflow: false
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
