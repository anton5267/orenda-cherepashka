import assert from "node:assert/strict";
import { copyFile, mkdtemp, readdir, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import Database from "better-sqlite3";

const temporaryRoot = await mkdtemp(join(tmpdir(), "orenda-backup-smoke-"));
const databasePath = join(temporaryRoot, "site.db");
const backupDirectory = join(temporaryRoot, "backups");
let closeDatabaseConnection = () => undefined;

try {
  process.env.DATABASE_PATH = databasePath;
  process.env.DATABASE_BACKUP_DIR = backupDirectory;

  const storeModule = await import("../server-dist/server/store.js");
  closeDatabaseConnection = storeModule.closeDatabaseConnection;
  const backupModule = await import("../server-dist/server/database-backup.js");
  const { runDatabaseBackupIfDue } = backupModule;
  const startedAt = new Date();
  const firstBackup = await runDatabaseBackupIfDue(startedAt);

  assert.ok(firstBackup, "Initial backup was not created.");
  assert.equal(basename(firstBackup), "site-" + startedAt.toISOString().replaceAll(":", "-") + ".db");

  const copiedDatabase = new Database(firstBackup, { readonly: true, fileMustExist: true });
  const productCount = copiedDatabase.prepare("SELECT COUNT(*) AS count FROM products").get().count;
  copiedDatabase.close();
  assert.ok(productCount > 0, "Backup does not contain the initialized catalog.");

  const sameDayBackup = await runDatabaseBackupIfDue(
    new Date(startedAt.getTime() + 60 * 60 * 1000)
  );
  assert.equal(sameDayBackup, firstBackup, "A second same-day backup was created.");

  const nextDayBackup = await runDatabaseBackupIfDue(
    new Date(startedAt.getTime() + 25 * 60 * 60 * 1000)
  );
  assert.notEqual(nextDayBackup, firstBackup, "The next daily backup was not created.");
  assert.equal(
    (await readdir(backupDirectory)).filter((file) => file.endsWith(".db")).length,
    2,
    "Daily backup rotation did not preserve the expected two snapshots."
  );

  const expiredBackupName = "site-2000-01-01T00-00-00.000Z.db";
  const expiredBackupPath = join(backupDirectory, expiredBackupName);
  await copyFile(firstBackup, expiredBackupPath);
  await utimes(expiredBackupPath, new Date(0), new Date(0));

  for (let index = 0; index < 15; index += 1) {
    const backupName = `site-2099-01-01T00-00-${String(index).padStart(2, "0")}.000Z.db`;
    await copyFile(firstBackup, join(backupDirectory, backupName));
  }

  await runDatabaseBackupIfDue(new Date());
  const remainingBackups = (await readdir(backupDirectory)).filter((file) => file.endsWith(".db"));
  assert.ok(!remainingBackups.includes(expiredBackupName), "An expired backup was not removed.");
  assert.equal(remainingBackups.length, 14, "Backup rotation did not cap retention at 14 copies.");

  console.log(JSON.stringify({ ok: true, productCount, retainedBackupCount: 14 }));
} finally {
  closeDatabaseConnection();
  const resolvedTemporaryRoot = resolve(temporaryRoot);
  assert.ok(
    resolvedTemporaryRoot.startsWith(resolve(tmpdir()) + sep) &&
      basename(resolvedTemporaryRoot).startsWith("orenda-backup-smoke-"),
    "Refusing to remove a path outside the dedicated test temporary directory."
  );
  await rm(resolvedTemporaryRoot, { recursive: true, force: true });
}
