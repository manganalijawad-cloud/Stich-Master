/**
 * Supabase Storage helpers for shop images / uploaded files.
 * Local SQLite keeps data URLs for offline use; cloud stores the binary.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  STORAGE_BUCKET,
  STORAGE_SETTING_KEYS,
  STORAGE_VALUE_PREFIX,
} from "./tables";

function parseDataUrl(dataUrl: string): { mime: string; bytes: Buffer; ext: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bytes = Buffer.from(m[2], "base64");
  const ext =
    mime === "image/png" ? "png"
    : mime === "image/webp" ? "webp"
    : mime === "image/gif" ? "gif"
    : mime === "image/svg+xml" ? "svg"
    : "jpg";
  return { mime, bytes, ext };
}

export function isStorageRef(value: string): boolean {
  return typeof value === "string" && value.startsWith(STORAGE_VALUE_PREFIX);
}

export function storagePathFromRef(value: string): string {
  return value.slice(STORAGE_VALUE_PREFIX.length);
}

export function toStorageRef(path: string): string {
  return `${STORAGE_VALUE_PREFIX}${path}`;
}

/** Upload a data-URL setting to Storage; return a storage ref for the cloud row. */
export async function uploadSettingAsset(
  client: SupabaseClient,
  userId: string,
  settingKey: string,
  dataUrl: string
): Promise<string | null> {
  if (!STORAGE_SETTING_KEYS.has(settingKey)) return null;
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return null;

  const path = `${userId}/${settingKey}.${parsed.ext}`;
  const { error } = await client.storage.from(STORAGE_BUCKET).upload(path, parsed.bytes, {
    contentType: parsed.mime,
    upsert: true,
  });
  if (error) {
    throw new Error(`Storage upload failed for ${settingKey}: ${error.message}`);
  }
  return toStorageRef(path);
}

/** Download a storage ref back to a data URL for local offline use. */
export async function downloadSettingAsset(
  client: SupabaseClient,
  storageRef: string
): Promise<string | null> {
  if (!isStorageRef(storageRef)) return null;
  const path = storagePathFromRef(storageRef);
  const { data, error } = await client.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) {
    throw new Error(`Storage download failed: ${error?.message || "empty"}`);
  }
  const buf = Buffer.from(await data.arrayBuffer());
  const mime = data.type || "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Prepare a shop_settings value for the cloud row:
 * data URLs for known image keys → storage ref; otherwise leave as-is.
 */
export async function prepareSettingValueForCloud(
  client: SupabaseClient,
  userId: string,
  key: string,
  value: string
): Promise<string> {
  if (STORAGE_SETTING_KEYS.has(key) && value.startsWith("data:")) {
    const ref = await uploadSettingAsset(client, userId, key, value);
    if (ref) return ref;
  }
  return value;
}

/**
 * Prepare a cloud shop_settings value for local SQLite:
 * storage refs → data URL; otherwise leave as-is.
 */
export async function prepareSettingValueForLocal(
  client: SupabaseClient,
  value: string
): Promise<string> {
  if (isStorageRef(value)) {
    const dataUrl = await downloadSettingAsset(client, value);
    if (dataUrl) return dataUrl;
  }
  return value;
}
