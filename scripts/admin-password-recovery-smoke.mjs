import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

const rootDir = process.cwd();
const port = 4187;
const origin = `http://127.0.0.1:${port}`;
const supabaseOrigin = "https://orenda-recovery-smoke.supabase.co";
const viteCli = resolve(rootDir, "node_modules/vite/bin/vite.js");
const server = spawn(
  process.execPath,
  [viteCli, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  {
    cwd: rootDir,
    env: {
      ...process.env,
      VITE_STATIC_SITE: "false",
      VITE_SUPABASE_URL: supabaseOrigin,
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_recovery_smoke"
    },
    stdio: "ignore",
    windowsHide: true
  }
);

let browser;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(origin);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await delay(250);
  }
  throw new Error("Vite did not start for the admin recovery smoke test.");
}

try {
  await waitForServer();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const requests = { recovery: [], passwordUpdates: [] };
  const supabaseCalls = [];
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  const user = {
    id: "3fc62a55-125d-4c5a-adf8-cc9ec541e293",
    aud: "authenticated",
    role: "authenticated",
    email: "admin@example.com",
    email_confirmed_at: "2026-01-01T00:00:00.000Z",
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z"
  };

  await context.route(`${supabaseOrigin}/**`, async (route) => {
    const request = route.request();
    const requestUrl = new URL(request.url());
    supabaseCalls.push(`${request.method()} ${requestUrl.pathname}`);
    const corsHeaders = {
      "access-control-allow-origin": origin,
      "access-control-allow-headers": "apikey, authorization, content-type, x-client-info",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "content-type": "application/json"
    };

    if (request.method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }

    if (requestUrl.pathname.endsWith("/auth/v1/recover") && request.method() === "POST") {
      requests.recovery.push({
        body: request.postDataJSON(),
        redirectTo: requestUrl.searchParams.get("redirect_to")
      });
      await route.fulfill({ status: 200, headers: corsHeaders, body: "{}" });
      return;
    }

    if (requestUrl.pathname.endsWith("/auth/v1/user") && request.method() === "GET") {
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(user) });
      return;
    }

    if (requestUrl.pathname.endsWith("/auth/v1/user") && request.method() === "PUT") {
      requests.passwordUpdates.push(request.postDataJSON());
      await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(user) });
      return;
    }

    if (requestUrl.pathname.endsWith("/auth/v1/logout")) {
      await route.fulfill({ status: 204, headers: corsHeaders, body: "" });
      return;
    }

    await route.fulfill({ status: 200, headers: corsHeaders, body: "{}" });
  });

  await page.goto(`${origin}/admin/reset-password`);
  await page.getByRole("heading", { name: "Відновлення доступу" }).waitFor();
  await page.locator("#recovery-email").fill("  ADMIN@example.com  ");
  await page.getByRole("button", { name: "Надіслати посилання" }).click();
  await page.getByText(/Якщо для цієї адреси є обліковий запис адміністратора/).waitFor();

  assert(requests.recovery.length === 1, "The recovery request was not sent exactly once.");
  assert(requests.recovery[0].body.email === "admin@example.com", "The recovery email was not normalized.");
  assert(
    requests.recovery[0].redirectTo === `${origin}/admin/reset-password`,
    "The recovery request did not use the exact allowlisted callback route."
  );

  const recoveryPage = await context.newPage();
  await recoveryPage.goto(
    `${origin}/admin/reset-password#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJleHAiOjQwMDAwMDAwMDAsInN1YiI6IjNmYzYyYTU1LTEyNWQtNGM1YS1hZGY4LWNjOWVjNTQxZTI5MyJ9.signature&refresh_token=smoke-refresh&expires_in=3600&token_type=bearer&type=recovery`
  );
  try {
    await recoveryPage.getByRole("heading", { name: "Новий пароль" }).waitFor({ timeout: 8000 });
  } catch (error) {
    console.error(JSON.stringify({
      recoveryPagePath: new URL(recoveryPage.url()).pathname,
      recoveryPageText: (await recoveryPage.locator("body").innerText()).slice(0, 1200),
      supabaseCalls,
      pageErrors
    }));
    throw error;
  }
  await recoveryPage.locator("#new-admin-password").fill("Local-SelfQA-Only-Password-2026!");
  await recoveryPage.locator("#confirm-admin-password").fill("Local-SelfQA-Only-Password-2025!");
  await recoveryPage.getByRole("button", { name: "Змінити пароль" }).click();
  await recoveryPage.getByText("Паролі не збігаються.").waitFor();
  assert(requests.passwordUpdates.length === 0, "A mismatched password was sent to Supabase.");

  await recoveryPage.locator("#confirm-admin-password").fill("Local-SelfQA-Only-Password-2026!");
  await recoveryPage.getByRole("button", { name: "Змінити пароль" }).click();
  await recoveryPage.getByRole("heading", { name: "Вхід в адмін-панель" }).waitFor();
  assert(requests.passwordUpdates.length === 1, "The valid password update was not sent exactly once.");
  assert(
    requests.passwordUpdates[0].password === "Local-SelfQA-Only-Password-2026!",
    "The intended password was not sent."
  );

  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 320, height: 720 });
  await mobilePage.goto(`${origin}/admin/reset-password`);
  await mobilePage.getByRole("heading", { name: "Відновлення доступу" }).waitFor();
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert(!overflow, "The recovery page has horizontal overflow at 320px.");

  const expiredLinkPage = await context.newPage();
  await expiredLinkPage.goto(`${origin}/admin/reset-password#error=access_denied&error_code=otp_expired`);
  await expiredLinkPage.getByText(/Посилання для відновлення недійсне або застаріло/).waitFor();

  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "generic recovery email response",
        "normalized address and exact callback",
        "recovery-session password form",
        "password policy and confirmation",
        "successful update and return to login",
        "expired recovery link handling",
        "320px mobile layout without horizontal overflow"
      ]
    })
  );
} finally {
  if (browser) await browser.close();
  server.kill();
  await Promise.race([once(server, "exit"), delay(1000)]);
}
