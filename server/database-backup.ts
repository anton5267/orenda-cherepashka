import { chmod, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createDatabaseBackup, databaseFilePath } from "./store.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const checkIntervalMs = 60 * 60 * 1000;
const retentionDays = 14;
const backupDirectory =
  process.env.DATABASE_BACKUP_DIR?.trim() ||
  resolve(dirname(databaseFilePath), "backups");

let backupInProgress = false;

function makeBackupName(date: Date) {
  const stamp = date.toISOString().replaceAll(":", "-");
  return `site-${stamp}.db`;
}

async function removeExpiredBackups(now: number) {
  const entries = await readdir(backupDirectory, { withFileTypes: true });
  const backups: Array<{ path: string; modifiedAt: number }> = [];

  for (const entry of entries) {
    if (!entry.isFile() || !/^site-\d{4}-\d\d-\d\dT.*\.db$/.test(entry.name)) {
      continue;
    }

    const path = join(backupDirectory, entry.name);
    const info = await stat(path);
    backups.push({ path, modifiedAt: info.mtimeMs });
  }

  backups.sort((left, right) => right.modifiedAt - left.modifiedAt);
  const cutoff = now - retentionDays * millisecondsPerDay;

  for (const [index, backup] of backups.entries()) {
    if (backup.modifiedAt < cutoff || index >= retentionDays) {
      await unlink(backup.path);
    }
  }
}

export async function runDatabaseBackupIfDue(now = new Date()) {
  if (backupInProgress) {
    return null;
  }

  backupInProgress = true;
  try {
    await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
    await chmod(backupDirectory, 0o700);
    const entries = await readdir(backupDirectory, { withFileTypes: true });
    const existingBackups = entries
      .filter((entry) => entry.isFile() && /^site-\d{4}-\d\d-\d\dT.*\.db$/.test(entry.name))
      .map((entry) => join(backupDirectory, entry.name));
    const latestBackup = await Promise.all(
      existingBackups.map(async (path) => ({ path, modifiedAt: (await stat(path)).mtimeMs }))
    ).then((backups) => backups.sort((left, right) => right.modifiedAt - left.modifiedAt)[0]);

    let currentBackupPath = latestBackup?.path ?? null;
    if (!latestBackup || now.getTime() - latestBackup.modifiedAt >= millisecondsPerDay) {
      currentBackupPath = join(backupDirectory, makeBackupName(now));
      try {
        await createDatabaseBackup(currentBackupPath);
        await chmod(currentBackupPath, 0o600);
        console.info(`SQLite backup created: ${currentBackupPath}`);
      } catch (error) {
        await unlink(currentBackupPath).catch(() => undefined);
        throw error;
      }
    }

    await removeExpiredBackups(now.getTime());
    return currentBackupPath;
  } finally {
    backupInProgress = false;
  }
}

export function startDatabaseBackupScheduler() {
  void runDatabaseBackupIfDue().catch((error) => {
    console.error("Initial SQLite backup failed", error);
  });

  const timer = setInterval(() => {
    void runDatabaseBackupIfDue().catch((error) => {
      console.error("Scheduled SQLite backup failed", error);
    });
  }, checkIntervalMs);
  timer.unref();
}
