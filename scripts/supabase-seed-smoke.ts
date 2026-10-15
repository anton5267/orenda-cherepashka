import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { seedSiteSettings } from "../shared/seedData";

const migrationPath = resolve("supabase/migrations/20261015115335_orenda_core_schema.sql");
const migration = readFileSync(migrationPath, "utf8");
const match = migration.match(/values\s*\(\s*true,\s*'(\{[\s\S]*?\})'::jsonb/is);
assert(match, "Supabase migration must seed the default site settings row.");
const migrationSettings = JSON.parse(match[1].replaceAll("''", "'")) as typeof seedSiteSettings;

assert.deepEqual(
  migrationSettings,
  seedSiteSettings,
  "The migration defaults must exactly match the content importer to keep a fresh-project import safe."
);

console.log("Supabase migration settings match the canonical site defaults.");
