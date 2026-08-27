import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppError } from "@/shared/core/api-response";

/**
 * Server-side Supabase Storage access.
 *
 * The service-role key never touches the browser. The bucket stays PRIVATE;
 * stored object paths are saved in the database and images are streamed to
 * authorized users through an authenticated proxy route. Uploads/deletes go
 * through server actions guarded by the app's RBAC (customers.credit).
 */

export const TXN_IMAGE_BUCKET = "transaction-images";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new AppError("STORAGE_NOT_CONFIGURED", "Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  if (!client) {
    client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return client;
}

/** Lazily create the storage bucket if it does not exist yet. Private only. */
export async function ensureBucket(bucket: string = TXN_IMAGE_BUCKET): Promise<void> {
  const storage = getClient().storage;
  const { data: buckets } = await storage.listBuckets();
  if (buckets?.some((b) => b.id === bucket)) return;
  const { error } = await storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: String(5 * 1024 * 1024),
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
  });
  if (error) throw new AppError("UPLOAD_FAILED", `Could not create storage bucket: ${error.message}`);
}

export async function uploadObject(
  bucket: string,
  path: string,
  data: Uint8Array | ArrayBuffer,
  contentType: string,
): Promise<{ path: string }> {
  await ensureBucket(bucket);
  const { data: uploaded, error } = await getClient().storage.from(bucket).upload(path, data, {
    contentType,
    upsert: false,
    cacheControl: "3600",
  });
  if (error) throw new AppError("UPLOAD_FAILED", `Storage upload failed: ${error.message}`);
  return { path: uploaded?.path ?? path };
}

export async function removeObjects(bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await getClient().storage.from(bucket).remove(paths);
  if (error) throw new AppError("UPLOAD_FAILED", `Storage delete failed: ${error.message}`);
}

export async function downloadObject(bucket: string, path: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const { data, error } = await getClient().storage.from(bucket).download(path);
  if (error || !data) throw new AppError("NOT_FOUND", "Image not found");
  return { data: await data.arrayBuffer(), contentType: data.type || "application/octet-stream" };
}