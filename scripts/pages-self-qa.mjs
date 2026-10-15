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
const externalFontRequests = [];
const initialModuleRequests = [];
const apiSmokeEnabled = process.env.PAGES_API_SMOKE === "true";
const responsiveViewports = [320, 375, 390, 768, 1024, 1440, 1920];
let mockedLeadPostCount = 0;
const mockedLeadPayloads = [];
let themeContrastAudit;

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
  page.on("request", (request) => {
    if (request.resourceType() === "script") {
      initialModuleRequests.push(request.url());
    }
    if (/fonts\.(?:googleapis|gstatic)\.com/i.test(request.url())) {
      externalFontRequests.push(request.url());
    }
  });
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
  const themeBootstrapPosition = homeHtml.indexOf('<script id="theme-bootstrap">');
  const themeStylesheetPosition = homeHtml.indexOf('rel="stylesheet"');
  const themeAppModulePosition = homeHtml.lastIndexOf('type="module"');
  assert(themeBootstrapPosition >= 0, "Pre-paint theme bootstrap is missing from the page.");
  assert(themeStylesheetPosition > themeBootstrapPosition,
    "Theme preference must be applied before the stylesheet can paint.");
  assert(themeAppModulePosition > themeBootstrapPosition,
    "Theme preference must be applied before the app module can render.");
  assert.match(homeHtml, /script-src[^\"]+'sha256-[A-Za-z0-9+/]+=*'/,
    "The pre-paint theme script is not authorized by the strict CSP.");
  assert.doesNotMatch(homeHtml, /orenda-cherepashka\.shop/);
  const robotsResponse = await fetch(`${baseUrl}robots.txt`);
  const robotsText = await robotsResponse.text();
  assert.equal(robotsResponse.status, 200, "GitHub Pages robots.txt did not return HTTP 200.");
  assert.match(robotsText, /Sitemap: https:\/\/anton5267\.github\.io\/orenda-cherepashka\/sitemap\.xml/);
  const sitemapResponse = await fetch(`${baseUrl}sitemap.xml`);
  const sitemapText = await sitemapResponse.text();
  assert.equal(sitemapResponse.status, 200, "GitHub Pages sitemap.xml did not return HTTP 200.");
  assert.equal((sitemapText.match(/<loc>/g) ?? []).length, 40, "Sitemap should contain home, four legal pages and 35 products.");

  const themeContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    colorScheme: "dark"
  });
  const themePage = await themeContext.newPage();
  themePage.on("pageerror", (error) => errors.push(error.message));
  themePage.on("console", (message) => {
    if (message.type() === "error" && /Content Security Policy|Refused to (?:connect|load|execute)/i.test(message.text())) {
      contentSecurityErrors.push(message.text());
    }
  });

  try {
    await themePage.route("**/assets/*.js", (route) => route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: "export {};"
    }));
    const earlyThemeResponse = await themePage.goto(baseUrl, { waitUntil: "domcontentloaded" });
    assert.equal(earlyThemeResponse?.status(), 200, "Dark system-theme page did not return HTTP 200.");
    assert.equal(await themePage.evaluate(() => document.documentElement.dataset.theme), "dark",
      "Dark system preference was not applied before React loaded.");
    assert.equal(await themePage.locator("#root").evaluate((element) => element.childElementCount), 0,
      "The pre-paint theme check unexpectedly loaded the React app.");

    await themePage.unroute("**/assets/*.js");
    await themePage.reload({ waitUntil: "domcontentloaded" });
    await themePage.locator(".product-card").first().waitFor();
    assert.equal(await themePage.evaluate(() => document.documentElement.dataset.theme), "dark",
      "The app did not retain the system dark theme after hydration.");

    const auditThemeContrast = async (expectedTheme) => {
      const contrast = await themePage.evaluate(() => {
        const luminance = (color) => {
          const unitRgb = color.startsWith("color(srgb ");
          const channels = color.match(/[\d.]+/g)?.slice(0, 3).map((channel) =>
            Number(channel) * (unitRgb ? 255 : 1)
          );
          if (!channels || channels.length !== 3) return 0;
          const linear = channels.map((channel) => {
            const normalized = channel / 255;
            return normalized <= 0.04045
              ? normalized / 12.92
              : ((normalized + 0.055) / 1.055) ** 2.4;
          });
          return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
        };
        const ratio = (foreground, background) => {
          const first = luminance(foreground);
          const second = luminance(background);
          return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
        };
        const rootStyle = getComputedStyle(document.documentElement);
        const tokenColor = (name) => {
          const probe = document.createElement("span");
          probe.style.color = `var(${name})`;
          document.body.append(probe);
          const color = getComputedStyle(probe).color;
          probe.remove();
          return color;
        };
        const surfaceProbe = document.createElement("span");
        surfaceProbe.style.backgroundColor = "var(--surface-strong)";
        document.body.append(surfaceProbe);
        const surface = getComputedStyle(surfaceProbe).backgroundColor;
        surfaceProbe.remove();

        const warning = document.createElement("div");
        warning.className = "warning-banner";
        document.body.append(warning);
        const warningStyle = getComputedStyle(warning);
        const warningForeground = warningStyle.color;
        const warningBackground = warningStyle.backgroundColor;
        const warningRatio = ratio(warningForeground, warningBackground);
        warning.remove();

        const hot = document.createElement("span");
        hot.className = "badge hot";
        document.body.append(hot);
        const hotStyle = getComputedStyle(hot);
        const hotForeground = hotStyle.color;
        const hotBackground = hotStyle.backgroundColor;
        const hotRatio = ratio(hotForeground, hotBackground);
        hot.remove();

        const button = getComputedStyle(document.querySelector(".primary-button"));
        const danger = document.createElement("button");
        danger.className = "danger-button";
        document.body.append(danger);
        const dangerStyle = getComputedStyle(danger);
        const dangerRatio = ratio(dangerStyle.color, dangerStyle.backgroundColor);
        danger.remove();

        return {
          ink: ratio(tokenColor("--ink"), surface),
          muted: ratio(tokenColor("--muted"), surface),
          brand: ratio(tokenColor("--brand-strong"), surface),
          accent: ratio(tokenColor("--accent-text"), surface),
          controlBoundary: ratio(tokenColor("--control-border"), surface),
          primaryButton: ratio(button.color, button.backgroundColor),
          dangerButton: dangerRatio,
          warning: warningRatio,
          warningColors: { foreground: warningForeground, background: warningBackground },
          hotBadge: hotRatio,
          hotColors: { foreground: hotForeground, background: hotBackground },
          colorScheme: rootStyle.colorScheme
        };
      });

      assert.equal(contrast.colorScheme, expectedTheme,
        `${expectedTheme} theme did not set the native browser color scheme.`);
      for (const role of ["ink", "muted", "brand", "accent", "primaryButton", "dangerButton", "warning", "hotBadge"]) {
        assert(contrast[role] >= 4.5,
          `${expectedTheme} ${role} contrast is ${contrast[role].toFixed(2)}:1; expected at least 4.5:1. ${JSON.stringify(contrast)}`);
      }
      assert(contrast.controlBoundary >= 3,
        `${expectedTheme} form-control border contrast is ${contrast.controlBoundary.toFixed(2)}:1; expected at least 3:1.`);
      return contrast;
    };

    const darkThemeContrast = await auditThemeContrast("dark");
    await themePage.emulateMedia({ colorScheme: "light" });
    await themePage.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await themePage.waitForTimeout(280);
    const lightThemeContrast = await auditThemeContrast("light");
    await themePage.emulateMedia({ colorScheme: "dark" });
    await themePage.waitForFunction(() => document.documentElement.dataset.theme === "dark");
    await themePage.waitForTimeout(280);

    await themePage.evaluate(() => localStorage.setItem("theme", "light"));
    await themePage.reload({ waitUntil: "domcontentloaded" });
    await themePage.locator(".product-card").first().waitFor();
    assert.equal(await themePage.evaluate(() => document.documentElement.dataset.theme), "light",
      "A saved light choice did not override the dark system preference.");
    await themePage.emulateMedia({ colorScheme: "light" });
    await themePage.waitForFunction(() => document.documentElement.dataset.theme === "light");
    await themePage.evaluate(() => localStorage.removeItem("theme"));
    await themePage.reload({ waitUntil: "domcontentloaded" });
    assert.equal(await themePage.evaluate(() => document.documentElement.dataset.theme), "light",
      "Removing the saved choice did not restore the system light theme.");

    themeContrastAudit = { light: lightThemeContrast, dark: darkThemeContrast };
  } finally {
    await themeContext.close();
  }

  await page.locator(".product-card").first().waitFor();
  assert.equal(await page.locator(".product-card").count(), 35, "Pages catalog did not render all products.");
  assert(
    initialModuleRequests.every((url) => !/\/(?:AdminPages|AdminLayout|AdminLoginPage|ProductPage|LegalPage)-[^/]+\.js(?:\?|$)/.test(url)),
    `The home page eagerly requested a route-only JavaScript chunk: ${initialModuleRequests.join(", ")}`
  );
  assert.equal(await page.locator(".product-card").first().getByText("Наявність уточнюйте").count(), 1);
  assert.equal(await page.locator("main").count(), 1, "Home page must expose one primary main landmark.");
  const unnamedControls = await page.evaluate(() => {
    const isExposed = (element) => {
      const style = getComputedStyle(element);
      return style.display !== "none" && style.visibility !== "hidden" &&
        element.getClientRects().length > 0 &&
        !element.closest('[aria-hidden="true"], [hidden], [inert]');
    };
    const accessibleName = (element) => {
      const labelledBy = element.getAttribute("aria-labelledby")
        ?.split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent?.trim() ?? "")
        .join(" ");
      const labels = [...(element.labels ?? [])].map((label) => label.textContent?.trim() ?? "").join(" ");
      const imageAlt = [...element.querySelectorAll("img[alt]")].map((image) => image.alt).join(" ");
      return element.getAttribute("aria-label") || labelledBy || labels ||
        element.getAttribute("title") || element.innerText || imageAlt || "";
    };
    return [...document.querySelectorAll(
      'a[href], button, input:not([type="hidden"]), select, textarea'
    )]
      .filter(isExposed)
      .filter((element) => !accessibleName(element).trim())
      .map((element) => `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`);
  });
  assert.deepEqual(unnamedControls, [], `Visible interactive controls need accessible names: ${unnamedControls.join(", ")}`);
  const logoImageAudit = await page.locator(".product-logo img").evaluateAll((images) =>
    images.map((image) => ({
      loading: image.getAttribute("loading"),
      decoding: image.getAttribute("decoding"),
      fetchPriority: image.getAttribute("fetchpriority")
    }))
  );
  assert(logoImageAudit.length > 0, "Catalog logos were not rendered as images.");
  assert(logoImageAudit.every((image) =>
    image.loading === "lazy" && image.decoding === "async" && image.fetchPriority === "low"
  ), "Catalog logos should load lazily, decode asynchronously and use low fetch priority.");
  await page.keyboard.press("Tab");
  const firstKeyboardFocus = await page.evaluate(() => ({
    className: (document.activeElement instanceof HTMLElement ? document.activeElement.className : ""),
    boxShadow: getComputedStyle(document.activeElement).boxShadow,
    outlineStyle: getComputedStyle(document.activeElement).outlineStyle
  }));
  assert.match(String(firstKeyboardFocus.className), /skip-link/, "Keyboard navigation should start with the skip-to-content link.");
  assert(
    firstKeyboardFocus.boxShadow !== "none" || firstKeyboardFocus.outlineStyle !== "none",
    "Keyboard focus must have a visible focus indicator."
  );
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  assert.deepEqual(externalFontRequests, [], "The page should not depend on third-party font downloads.");
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

  const mobileMenuToggle = page.getByRole("button", { name: "Відкрити меню" });
  assert.equal(await mobileMenuToggle.isVisible(), true, "Mobile menu toggle was not visible at 390px.");
  await mobileMenuToggle.click();
  const mobileMenu = page.getByRole("dialog", { name: "Навігація" });
  await mobileMenu.waitFor();
  assert.deepEqual(
    await mobileMenu.locator(".mobile-nav strong").allTextContents(),
    ["Каталог", "Питання", "Новини", "Відгуки"],
    "Mobile navigation labels or order were unexpected."
  );
  assert.equal(
    await mobileMenu.getByRole("link", { name: "Залишити заявку" }).getAttribute("href"),
    "#lead-form",
    "Mobile application CTA did not point to the lead form."
  );
  await page.keyboard.press("Escape");
  await mobileMenu.waitFor({ state: "detached" });
  assert.equal(
    await page.evaluate(() => document.activeElement?.classList.contains("menu-toggle")),
    true,
    "Closing the mobile menu did not return keyboard focus to its toggle."
  );

  await page.getByRole("button", { name: "Відкрити меню" }).click();
  await page.getByRole("dialog", { name: "Навігація" }).getByRole("link", { name: "Питання" }).click();
  await page.waitForURL(/#faq$/);
  await page.getByRole("button", { name: "Відкрити меню" }).click();
  assert.equal(
    await page.getByRole("dialog", { name: "Навігація" })
      .getByRole("link", { name: "Питання" }).getAttribute("aria-current"),
    "location",
    "The current mobile section was not marked as active."
  );
  await page.getByRole("dialog", { name: "Навігація" }).getByRole("button", { name: "Закрити меню" }).click();

  const touchContext = await browser.newContext({
    viewport: { width: 320, height: 568 },
    isMobile: true,
    hasTouch: true
  });
  const touchPage = await touchContext.newPage();
  touchPage.on("pageerror", (error) => errors.push(error.message));

  try {
    await installPagesApiMock(touchPage, new URL(baseUrl).origin);
    await touchPage.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await touchPage.locator(".product-card").first().waitFor();
    const lowPowerMobileStyles = await touchPage.evaluate(() => {
      const skeleton = document.createElement("div");
      skeleton.className = "loading-block";
      document.body.append(skeleton);
      const skeletonAnimation = getComputedStyle(skeleton).animationName;
      skeleton.remove();
      return {
        heroDecoration: getComputedStyle(document.querySelector(".hero-blur")).display,
        skeletonAnimation,
        revealTransition: getComputedStyle(document.querySelector(".reveal")).transitionDuration
      };
    });
    assert.equal(lowPowerMobileStyles.heroDecoration, "none",
      "Large blurred hero decorations should not be painted on narrow phones.");
    assert.equal(lowPowerMobileStyles.skeletonAnimation, "none",
      "Skeleton shimmer should be disabled on narrow phones.");
    assert(
      Number.parseFloat(lowPowerMobileStyles.revealTransition) <= 0.2,
      "Scroll reveals should stay short on narrow phones."
    );

    const mobileMenuToggle = touchPage.getByRole("button", { name: "Відкрити меню" });
    const menuToggleBox = await mobileMenuToggle.boundingBox();
    assert(menuToggleBox && menuToggleBox.width >= 44 && menuToggleBox.height >= 44,
      "Mobile menu toggle is smaller than a comfortable touch target.");
    await mobileMenuToggle.click();
    const touchMenu = touchPage.getByRole("dialog", { name: "Навігація" });
    const menuPanel = touchPage.locator(".mobile-menu-panel");
    await menuPanel.waitFor();
    const menuBackdropFilters = await touchPage.locator(".mobile-menu-backdrop, .mobile-menu-panel")
      .evaluateAll((elements) => elements.map((element) => getComputedStyle(element).backdropFilter));
    assert(menuBackdropFilters.every((filter) => filter === "none"),
      "The mobile navigation should not blur large areas behind its panels.");
    const menuGeometry = await menuPanel.evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      bottom: element.getBoundingClientRect().bottom,
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight
    }));
    assert(menuGeometry.top >= 0 && menuGeometry.bottom <= 568,
      "Mobile menu extends beyond the short phone viewport.");
    assert(menuGeometry.scrollHeight >= menuGeometry.clientHeight,
      "Mobile menu has an invalid scroll area.");
    const menuActionBox = await touchMenu.getByRole("link", { name: "Залишити заявку" }).boundingBox();
    assert(menuActionBox && menuActionBox.height >= 44,
      "Mobile menu primary action is smaller than a comfortable touch target.");
    await touchMenu.getByRole("button", { name: "Закрити меню" }).click();

    const searchInput = touchPage.getByPlaceholder("Наприклад, ChatGPT, Netflix, VPN...");
    assert.equal(await searchInput.getAttribute("type"), "search",
      "Catalog search does not use a mobile-friendly search input.");
    const searchFontSize = await searchInput.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    assert(searchFontSize >= 16, "Search text is small enough to trigger iOS input zoom.");
    await searchInput.focus();
    assert.equal(await touchPage.locator(".mobile-cta").evaluate((element) => getComputedStyle(element).display), "none",
      "Fixed customer actions cover the catalog input while the mobile keyboard is open.");
    await searchInput.fill("ChatGPT");
    await touchPage.waitForTimeout(350);
    assert(await touchPage.locator(".product-card").count() > 0,
      "Mobile search did not return matching products.");

    const filters = touchPage.locator(".filter-pill");
    const allFilter = filters.first();
    const categoryFilter = filters.nth(1);
    await categoryFilter.click();
    await touchPage.waitForFunction(() =>
      document.querySelectorAll(".filter-pill")[1]?.getAttribute("aria-pressed") === "true"
    );
    assert.equal(await categoryFilter.getAttribute("aria-pressed"), "true",
      "Selected category filter does not expose its pressed state.");
    assert.equal(await allFilter.getAttribute("aria-pressed"), "false",
      "The all-categories filter remained selected after choosing a category.");
    const selectedFilterBox = await categoryFilter.boundingBox();
    assert(selectedFilterBox && selectedFilterBox.height >= 44,
      `Catalog category filter is smaller than a comfortable touch target (${selectedFilterBox?.height ?? "not rendered"}px).`);

    const activeSearchChip = touchPage.locator(".catalog-filter-chip").filter({ hasText: "Пошук:" });
    const searchChipBox = await activeSearchChip.boundingBox();
    assert(searchChipBox && searchChipBox.height >= 44 && searchChipBox.width <= 320,
      "Active mobile filter chip is too small or wider than the viewport.");
    await searchInput.fill("x".repeat(120));
    await touchPage.waitForTimeout(350);
    assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true,
      "A long mobile search query causes horizontal overflow.");
    await touchPage.getByRole("button", { name: /Показати весь каталог/ }).click();

    await touchPage.setViewportSize({ width: 320, height: 568 });
    const firstCard = touchPage.locator(".product-card").first();
    const detailsButton = firstCard.getByRole("button", { name: "Детальніше" });
    await detailsButton.click();
    const modalPanel = touchPage.locator(".modal-panel");
    await modalPanel.waitFor();
    await touchPage.waitForFunction(() => document.activeElement?.classList.contains("modal-close"));
    const modalGeometry = await modalPanel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight
      };
    });
    assert(modalGeometry.left >= 0 && modalGeometry.right <= 320 && modalGeometry.top >= 0 && modalGeometry.bottom <= 568,
      "Product modal is clipped by a small phone viewport.");
    assert(modalGeometry.scrollHeight > modalGeometry.clientHeight,
      "Long product details cannot be scrolled inside the mobile modal.");
    const modalCloseBox = await modalPanel.getByRole("button", { name: "Закрити", exact: true }).boundingBox();
    assert(modalCloseBox && modalCloseBox.width >= 44 && modalCloseBox.height >= 44,
      "Mobile modal close button is too small for touch.");
    const firstPlan = modalPanel.locator(".modal-plan-option").first();
    const planBox = await firstPlan.boundingBox();
    assert(planBox && planBox.height >= 44 && planBox.width <= 320,
      "Mobile modal tariff option is too small or too wide.");
    await modalPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    assert(await modalPanel.evaluate((element) => element.scrollTop > 0),
      "Product modal content does not scroll independently on mobile.");
    await touchPage.keyboard.press("Shift+Tab");
    assert.equal(await modalPanel.evaluate((element) => element.contains(document.activeElement)), true,
      "Keyboard focus escaped the modal.");
    await touchPage.keyboard.press("Escape");
    await modalPanel.waitFor({ state: "detached" });
    await touchPage.waitForFunction(() => document.activeElement?.textContent?.includes("Детальніше"));

    await touchPage.locator("#lead-form").scrollIntoViewIfNeeded();
    await touchPage.setViewportSize({ width: 320, height: 430 });
    await touchPage.getByRole("button", { name: /Надіслати заявку/ }).click();
    const invalidName = touchPage.getByLabel("Ім'я");
    await touchPage.waitForFunction(() => document.activeElement?.id === "lead-name");
    await touchPage.waitForFunction(() => {
      const field = document.querySelector("#lead-name");
      if (!field) return false;
      const rect = field.getBoundingClientRect();
      return rect.top >= 0 && rect.bottom <= window.innerHeight;
    });
    const invalidNameBox = await invalidName.boundingBox();
    assert(invalidNameBox && invalidNameBox.y >= 0 && invalidNameBox.y + invalidNameBox.height <= 430,
      "Submitting an invalid mobile form does not scroll the first error into view.");
    assert.equal(await touchPage.locator(".mobile-cta").evaluate((element) => getComputedStyle(element).display), "none",
      "Fixed actions cover the active form field while the phone keyboard is open.");
    assert.equal(await touchPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true,
      "Mobile form interactions cause horizontal overflow at 320px.");
  } finally {
    await touchContext.close();
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  assert.equal(await page.locator(".desktop-nav").isVisible(), true, "Desktop navigation was hidden at 1440px.");
  assert.equal(await page.locator(".menu-toggle").isVisible(), false, "Mobile toggle remained visible at 1440px.");
  assert.equal(await page.getByRole("link", { name: "Залишити заявку" }).getAttribute("href"), "#lead-form");
  await page.getByRole("link", { name: "Залишити заявку" }).click();
  await page.waitForURL(/#lead-form$/);
  assert.equal(
    await page.getByRole("link", { name: "Залишити заявку" }).getAttribute("aria-current"),
    "location",
    "The application action was not marked active at the lead form."
  );
  await page.locator(".desktop-nav").getByRole("link", { name: "Новини" }).click();
  await page.waitForURL(/#news$/);
  assert.equal(
    await page.locator(".desktop-nav").getByRole("link", { name: "Новини" }).getAttribute("aria-current"),
    "location",
    "The current desktop section was not marked as active."
  );

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
  const productSchemas = [...productHtml.matchAll(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g
  )].map((match) => JSON.parse(match[1]));
  const productSchema = productSchemas.find((schema) => schema["@type"] === "Product");
  const breadcrumbSchema = productSchemas.find((schema) => schema["@type"] === "BreadcrumbList");
  assert.equal(breadcrumbSchema?.itemListElement?.length, 3, "Product page omitted breadcrumb JSON-LD.");
  assert.match(productHtml, /<meta property="og:type" content="product" \/>/);
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

  const responsiveAudit = [];
  const responsivePages = [
    ["home", "", ".product-card"],
    ["product", "p/grok-super-personal/", ".product-detail-page"],
    ["privacy", "legal/privacy/", ".legal-page-card"],
    ["terms", "legal/terms/", ".legal-page-card"],
    ["refund", "legal/refund/", ".legal-page-card"],
    ["contacts", "legal/contacts/", ".legal-page-card"]
  ];

  for (const [pageName, path, readySelector] of responsivePages) {
    const responsiveResponse = await page.goto(`${baseUrl}${path}`, {
      waitUntil: "domcontentloaded"
    });
    assert.equal(responsiveResponse?.status(), 200, `${pageName} page did not return HTTP 200.`);
    await page.locator(readySelector).first().waitFor();

    for (const width of responsiveViewports) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await page.evaluate(() => {
        const textClips = [...document.querySelectorAll("body *")]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const hasLineClamp = Number(style.webkitLineClamp) > 0;
            if (
              rect.width === 0 ||
              rect.height === 0 ||
              element.children.length > 0 ||
              !element.textContent?.trim() ||
              hasLineClamp
            ) {
              return false;
            }

            const clipsHorizontally =
              ["hidden", "clip"].includes(style.overflowX) &&
              element.scrollWidth > element.clientWidth + 2;
            const clipsVertically =
              ["hidden", "clip"].includes(style.overflowY) &&
              element.scrollHeight > element.clientHeight + 2;
            return clipsHorizontally || clipsVertically;
          })
          .map((element) => element.textContent.trim().slice(0, 60));

        const controlsOutsideViewport = [...document.querySelectorAll(
          "a, button, input, select, textarea"
        )]
          .filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return style.display !== "none" && rect.width > 0 &&
              (rect.left < -1 || rect.right > window.innerWidth + 1);
          })
          .map((element) => element.textContent.trim().slice(0, 50) || element.tagName);

        const overlappingGroups = [];
        for (const selector of [
          ".header-row",
          ".catalog-toolbar",
          ".product-detail-actions",
          ".product-detail-plan",
          ".reviews-spotlight"
        ]) {
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

        const grid = document.querySelector(".products-grid");
        return {
          viewport: window.innerWidth,
          documentWidth: document.documentElement.scrollWidth,
          textClips,
          controlsOutsideViewport,
          overlappingGroups,
          productColumns: grid ? getComputedStyle(grid).gridTemplateColumns.split(" ").length : null
        };
      });

      assert(
        layout.documentWidth <= width + 1,
        `${pageName} page overflows horizontally at ${width}px: ${layout.documentWidth}px.`
      );
      assert.deepEqual(layout.textClips, [], `${pageName} page clips text at ${width}px.`);
      assert.deepEqual(
        layout.controlsOutsideViewport,
        [],
        `${pageName} page pushes controls off-screen at ${width}px.`
      );
      assert.deepEqual(
        layout.overlappingGroups,
        [],
        `${pageName} page has overlapping layout items at ${width}px.`
      );

      if (pageName === "home") {
        const expectedColumns = width <= 640 ? 1 : width <= 980 ? 2 : width < 1600 ? 3 : 4;
        assert.equal(
          layout.productColumns,
          expectedColumns,
          `Catalog should use ${expectedColumns} columns at ${width}px.`
        );
        assert.equal(
          await page.locator(".menu-toggle").isVisible(),
          width <= 1080,
          `Mobile/tablet navigation toggle had the wrong visibility at ${width}px.`
        );
        assert.equal(
          await page.locator(".desktop-nav").isVisible(),
          width > 1080,
          `Desktop navigation had the wrong visibility at ${width}px.`
        );
      }

      responsiveAudit.push({ page: pageName, width, productColumns: layout.productColumns });
    }
  }

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
    themeContrast: themeContrastAudit,
    systemTheme: "pre-paint, follows OS changes, respects saved choice",
    pagesApiFlow: apiSmokeEnabled ? "offline fallback and successful retry" : undefined,
    contentSecurityPolicy: "no violations",
    productDeepLink: "ok",
    mobileOverflow: false,
    responsiveAudit
  }, null, 2));
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
