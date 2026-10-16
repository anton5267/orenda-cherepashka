import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backupPath = process.argv[2];
if (!backupPath) throw new Error("Usage: npm run supabase:verify-backup -- <application-backup.json> [report.json] [restore.sql]");
const backupBytes = await readFile(resolve(backupPath));
assert.ok(backupBytes.length < 50 * 1024 * 1024, "Backup exceeds the 50 MB verification limit.");
const backup = JSON.parse(backupBytes.toString("utf8").replace(/^\uFEFF/, ""));
assert.equal(backup.format, "orenda-application-backup-v1");
assert.equal(backup.project_ref, "suzmndaqwchayddrulzc", "This verifier only accepts the Orenda project.");
const tables = {
  site_settings: "singleton", site_content: "kind, id", lead_requests: "id",
  lead_rate_limits: "key_hash", telegram_webhook_events: "id", analytics_events: "id"
};
assert.deepEqual(Object.keys(backup.tables).sort(), Object.keys(tables).sort());
for (const name of Object.keys(tables)) assert.ok(Array.isArray(backup.tables[name]), `${name} must be an array.`);
assert.deepEqual(backup.restore_schema_migrations, ["20261015115335", "20261015134209"], "Review the restore schema for this backup version.");
const containerName = `orenda-restore-check-${randomUUID()}`;
const image = "postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24";

function command(args, { input, allowFailure = false, env } = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn("docker", args, { cwd: rootDir, windowsHide: true, env: env ?? process.env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.on("close", (code) => code === 0 || allowFailure
      ? resolveCommand({ code, stdout, stderr })
      : reject(new Error(`Docker ${args[0]} failed (${code}): ${stderr.slice(0, 2000)}`)));
    child.stdin.end(input);
  });
}
const sql = (query) => command(["exec", "-i", containerName, "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-tA"], { input: query });
const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([left], [right]) => left.localeCompare(right))) : item);
let created = false;
const restoreStatements = [
  "-- Application data only. Review before running against a NEW, EMPTY project after its schema migrations.",
  "-- Contains private application data; do not commit or upload this file.",
  "begin;"
];

try {
  await command(["run", "--detach", "--rm", "--network", "none", "--name", containerName,
    "--label", "com.orenda.purpose=backup-restore-verification", "--env", "POSTGRES_PASSWORD", image],
  { env: { ...process.env, POSTGRES_PASSWORD: randomUUID() } });
  created = true;
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const result = await command(["exec", containerName, "pg_isready", "-U", "postgres"], { allowFailure: true });
    if (result.code === 0) { ready = true; break; }
    await delay(250);
  }
  assert.ok(ready, "Disposable PostgreSQL instance did not start.");
  await sql("create role anon; create role authenticated; create role service_role;\n");
  for (const filename of ["20261015115335_orenda_core_schema.sql", "20261015134209_secure_auto_rls_function.sql"]) {
    await sql(await readFile(resolve(rootDir, "supabase/migrations", filename), "utf8"));
  }
  const truncate = `truncate ${Object.keys(tables).map((name) => `public.${name}`).join(", ")} restart identity;`;
  await sql(truncate);
  restoreStatements.push(truncate);
  for (const name of Object.keys(tables)) {
    const delimiter = `$backup_${randomUUID().replaceAll("-", "")}$`;
    const rows = JSON.stringify(backup.tables[name]);
    const overriding = name === "telegram_webhook_events" ? "overriding system value" : "";
    const insert = `insert into public.${name} ${overriding} select * from jsonb_populate_recordset(null::public.${name}, ${delimiter}${rows}${delimiter}::jsonb);`;
    await sql(insert);
    restoreStatements.push(insert);
  }
  await sql("select setval(pg_get_serial_sequence('public.telegram_webhook_events','id'), greatest(coalesce(max(id), 0), 1), count(*) > 0) from public.telegram_webhook_events;");
  restoreStatements.push("select setval(pg_get_serial_sequence('public.telegram_webhook_events','id'), greatest(coalesce(max(id), 0), 1), count(*) > 0) from public.telegram_webhook_events;", "commit;");
  const restoredCounts = {};
  for (const [name, order] of Object.entries(tables)) {
    const result = await sql(`select coalesce(jsonb_agg(to_jsonb(t) order by ${order}), '[]'::jsonb) from public.${name} t;`);
    const restored = JSON.parse(result.stdout.trim());
    const digest = (rows) => createHash("sha256").update(canonical(rows)).digest("hex");
    assert.equal(digest(restored), digest(backup.tables[name]), `${name} differs after restore.`);
    restoredCounts[name] = restored.length;
  }
  const access = await sql("select bool_and(c.relrowsecurity and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE')) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r';");
  assert.equal(access.stdout.trim(), "t", "Restored RLS/grants are incorrect.");
  const summary = await sql("select public.get_analytics_summary(30) is not null;");
  assert.equal(summary.stdout.trim(), "t", "Restored analytics function failed.");
  const imageId = (await command(["inspect", "--format", "{{.Image}}", containerName])).stdout.trim();
  const report = { ok: true, checkedAt: new Date().toISOString(), backupCreatedAt: backup.created_at,
    projectRef: backup.project_ref, backupSha256: createHash("sha256").update(backupBytes).digest("hex"),
    image, imageId, restoredCounts, rlsAndGrantsVerified: true, analyticsFunctionVerified: true,
    scope: "Six public application tables. Excludes Auth, Storage files, managed schemas, and secrets. Production was not modified." };
  if (process.argv[3]) await writeFile(resolve(process.argv[3]), `${JSON.stringify(report, null, 2)}\n`);
  if (process.argv[4]) await writeFile(resolve(process.argv[4]), `${restoreStatements.join("\n")}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (created) await command(["stop", "--time", "1", containerName], { allowFailure: true });
}
