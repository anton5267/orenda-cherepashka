import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import Database from "better-sqlite3";
import { pathToFileURL } from "node:url";

const temporaryRoot = await mkdtemp(resolve(tmpdir(), "orenda-catalog-migration-"));
const databasePath = resolve(temporaryRoot, "site.db");
const storeUrl = pathToFileURL(resolve("server-dist/server/store.js")).href;

function openStore() {
  const child = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", `const store = await import(${JSON.stringify(storeUrl)}); console.log(JSON.stringify(store.listProducts(true)));`],
    {
      encoding: "utf8",
      env: { ...process.env, DATABASE_PATH: databasePath }
    }
  );
  assert.equal(child.status, 0, child.stderr || "Store initialization failed.");
  return JSON.parse(child.stdout.trim());
}

try {
  openStore();
  const db = new Database(databasePath);
  db.prepare("DELETE FROM app_migrations WHERE id = ?").run("catalog-prices-v1");
  db.prepare("UPDATE products SET name = ?, is_active = 0 WHERE id = ?")
    .run("Old custom title", "grok-super");
  db.prepare("UPDATE pricing_options SET price = ?, label = ?, is_active = 0 WHERE id = ?")
    .run(9999, "Old price", "grok-super-plan-2");
  db.prepare(
    `INSERT INTO pricing_options (id, product_id, label, price, currency, compare_at, sort_order, is_active)
     VALUES ('legacy-custom-plan', 'grok-super', 'Legacy custom plan', 77, 'UAH', NULL, 9, 1)`
  ).run();
  db.prepare(
    `INSERT INTO products (
       id, name, slug, category_id, summary, details_json, logo,
       is_hot, is_active, sort_order, updated_at
     ) VALUES ('admin-custom-product', 'Admin custom product', 'admin-custom-product',
       'cat-ai', 'Kept across migrations', '[]', '', 0, 1, 999, CURRENT_TIMESTAMP)`
  ).run();
  db.close();

  const products = openStore();
  const grok = products.find((product) => product.id === "grok-super");
  assert.ok(grok, "Canonical Grok product was lost.");
  assert.equal(grok.name, "🏷 Grok Super [особистий]");
  assert.equal(grok.isActive, false, "Migration should preserve an admin's product availability choice.");
  assert.deepEqual(
    grok.pricingOptions.filter((plan) => plan.isActive).map((plan) => [plan.label, plan.price]),
    [["1 міс · за місяць", 800], ["3 міс · за пакет", 2200]]
  );
  assert.ok(grok.pricingOptions.some((plan) => plan.id === "legacy-custom-plan" && !plan.isActive));
  assert.ok(products.some((product) => product.id === "admin-custom-product"));
  console.log("Catalog migration smoke test passed: canonical prices repaired, admin products retained.");
} finally {
  const resolvedRoot = resolve(temporaryRoot);
  if (basename(resolvedRoot).startsWith("orenda-catalog-migration-")) {
    await rm(resolvedRoot, { recursive: true, force: true });
  }
}
