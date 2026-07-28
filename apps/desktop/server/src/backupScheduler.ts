/**
 * Daily local JSON backups (restore-compatible with /api/backup + /api/restore).
 * Writes under %AppData%/Hello Darzi/data/backups — does not copy the live .db.
 */

import fs from "fs";
import path from "path";
import * as db from "./db";

const RETENTION = 7;
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // hourly calendar-day check

function backupsDir(): string {
  if (process.env.ELECTRON_USER_DATA) {
    return path.join(process.env.ELECTRON_USER_DATA, "data", "backups");
  }
  return path.join(process.cwd(), "data", "backups");
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

function markerPath(): string {
  return path.join(backupsDir(), ".last-auto-backup");
}

function shouldRunToday(): boolean {
  try {
    const last = fs.readFileSync(markerPath(), "utf8").trim();
    return last !== todayStamp();
  } catch {
    return true;
  }
}

function pruneOldBackups(dir: string): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const autos = entries
    .filter((e) => e.isFile() && e.name.startsWith("auto_") && e.name.endsWith(".json"))
    .map((e) => {
      const full = path.join(dir, e.name);
      let mtime = 0;
      try {
        mtime = fs.statSync(full).mtimeMs;
      } catch {
        mtime = 0;
      }
      return { full, mtime };
    })
    .sort((a, b) => b.mtime - a.mtime);

  for (const stale of autos.slice(RETENTION)) {
    try {
      fs.unlinkSync(stale.full);
    } catch {
      // ignore
    }
  }
}

/** Run once if not yet done today. Safe to call repeatedly. */
export function runDailyLocalBackup(): { ran: boolean; files: string[] } {
  if (!shouldRunToday()) {
    return { ran: false, files: [] };
  }

  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });

  const profiles = db.listAllProfiles().filter((p) => p.role === "Owner" || !p.role);
  // If no Owner role label, back up every profile that owns shop data.
  const targets = profiles.length > 0 ? profiles : db.listAllProfiles();
  const seen = new Set<string>();
  const files: string[] = [];
  const date = todayStamp();

  for (const profile of targets) {
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    try {
      const data = db.exportBackup(profile.id);
      const hasData =
        (data.customers?.length || 0) +
          (data.orders?.length || 0) +
          (data.measurements?.length || 0) >
        0 || (data.shops?.length || 0) > 0;
      // Always back up once a shop/profile exists so empty shops still get a snapshot.
      if (!hasData && !(data.profiles?.length || 0)) continue;

      const shortId = profile.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) || "shop";
      const filename = `auto_${shortId}_${date}.json`;
      const full = path.join(dir, filename);
      const envelope = {
        timestamp: new Date().toISOString(),
        version: "1.0",
        data,
      };
      fs.writeFileSync(full, JSON.stringify(envelope, null, 2), "utf8");
      files.push(full);
    } catch (err) {
      console.error("[auto-backup] failed for profile", profile.id, err);
    }
  }

  try {
    fs.writeFileSync(markerPath(), date, "utf8");
  } catch (err) {
    console.error("[auto-backup] could not write marker:", err);
  }

  pruneOldBackups(dir);
  if (files.length) {
    console.log(`[auto-backup] wrote ${files.length} backup(s) to ${dir}`);
  }
  return { ran: true, files };
}

export function getAutoBackupsDir(): string {
  const dir = backupsDir();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/** Start daily backup checks (immediate + hourly). Idempotent. */
export function startBackupScheduler(): void {
  if (intervalHandle) return;
  try {
    runDailyLocalBackup();
  } catch (err) {
    console.error("[auto-backup] initial run failed:", err);
  }
  intervalHandle = setInterval(() => {
    try {
      runDailyLocalBackup();
    } catch (err) {
      console.error("[auto-backup] scheduled run failed:", err);
    }
  }, CHECK_INTERVAL_MS);
  if (typeof intervalHandle === "object" && intervalHandle && "unref" in intervalHandle) {
    intervalHandle.unref();
  }
}
