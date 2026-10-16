import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const baseUrl = "http://127.0.0.1:4324";
const authOrigin = "https://auth-self-qa.supabase.co";
const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "--host", "127.0.0.1", "--port", "4324", "--strictPort"], {
  env: { ...process.env, VITE_SUPABASE_URL: authOrigin, VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_self_qa", VITE_STATIC_SITE: "false" },
  stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
server.stdout.on("data", (chunk) => { serverLog += chunk; });
server.stderr.on("data", (chunk) => { serverLog += chunk; });
let browser;

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Auth QA server exited: ${serverLog}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) { ready = true; break; }
    } catch {}
    await delay(250);
  }
  assert.ok(ready, `Auth QA server did not start: ${serverLog}`);
  browser = await chromium.launch();
  const user = { id: "00000000-0000-4000-8000-000000000001", email: "owner@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${jwtPart({ alg: "HS256", typ: "JWT" })}.${jwtPart({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;

  for (const callbackType of ["invite", "recovery"]) {
    const context = await browser.newContext();
    try {
      await context.route(`${authOrigin}/**`, async (route) => {
        assert.equal(new URL(route.request().url()).pathname, "/auth/v1/user", "Callback must only validate the synthetic session.");
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      });
      const page = await context.newPage();
      await page.goto(`${baseUrl}/#access_token=${token}&refresh_token=test-refresh-token&expires_in=3600&token_type=bearer&type=${callbackType}`);
      await page.getByRole("heading", { name: "Новий пароль", exact: true }).waitFor();
      assert.equal(new URL(page.url()).pathname, "/admin/reset-password");
      assert.ok(await page.locator("input#new-admin-password").isVisible());
    } finally { await context.close(); }
  }

  const context = await browser.newContext();
  try {
    let resetRequests = 0;
    await context.route(`${authOrigin}/**`, async (route) => {
      assert.equal(new URL(route.request().url()).pathname, "/auth/v1/recover");
      resetRequests++;
      await route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "over_email_send_rate_limit", msg: "Email rate limit exceeded" }) });
    });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/reset-password`);
    await page.getByLabel("Email адміністратора").fill("owner@example.com");
    await page.getByRole("button", { name: "Надіслати посилання", exact: true }).click();
    await page.getByRole("alert").getByText("Не вдалося надіслати запит", { exact: true }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByText("Перевір пошту", { exact: true }).count(), 0);
    assert.equal(resetRequests, 1);
  } finally { await context.close(); }

  console.log("Auth callback and recovery QA passed: invitation, recovery, and rejected email request; no real Auth users, emails, or leads created.");
} finally {
  await browser?.close();
  server.kill();
}
