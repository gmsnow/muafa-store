/**
 * Client-side image preparation for transaction note attachments.
 * Validates type/size and compresses large photos (canvas → ≤1920px)
 * BEFORE they travel to the server as a data URL.
 */

export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1920;

export class ImageError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ImageError";
    this.code = code;
  }
}

export interface PreparedImage {
  dataUrl: string;
  mime: string;
  name: string;
  size: number; // original file size in bytes
}

function loadSource(file: File): Promise<CanvasImageSource> {
  return new Promise((resolve, reject) => {
    if (typeof createImageBitmap === "function") {
      createImageBitmap(file, { imageOrientation: "from-image" })
        .then(resolve)
        .catch(() => loadViaImage(file, resolve, reject));
    } else {
      loadViaImage(file, resolve, reject);
    }
  });
}

function loadViaImage(file: File, resolve: (v: CanvasImageSource) => void, reject: (e: Error) => void) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    resolve(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error("Could not read image"));
  };
  img.src = url;
}

function scaledDim(w: number, h: number): { width: number; height: number } {
  if (w <= MAX_IMAGE_DIMENSION && h <= MAX_IMAGE_DIMENSION) return { width: w, height: h };
  const scale = MAX_IMAGE_DIMENSION / Math.max(w, h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

function mimeOfDataUrl(dataUrl: string): string {
  const end = dataUrl.indexOf(";");
  return dataUrl.slice("data:".length, end > 0 ? end : undefined);
}

export async function prepareImage(file: File): Promise<PreparedImage> {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new ImageError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageError("IMAGE_TOO_LARGE", "Image must be smaller than 5 MB");
  }

  const source = await loadSource(file);
  const { width, height } = scaledDim(
    (source as HTMLImageElement).naturalWidth ?? (source as ImageBitmap).width,
    (source as HTMLImageElement).naturalHeight ?? (source as ImageBitmap).height,
  );

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageError("INVALID_IMAGE_TYPE", "Could not process image");

  // JPEG has no alpha — flatten onto white to avoid black backgrounds.
  if (file.type === "image/jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(source, 0, 0, width, height);

  const format = file.type === "image/png" ? "image/webp" : "image/jpeg";
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL(format, 0.85);
  } catch {
    dataUrl = canvas.toDataURL("image/jpeg", 0.85);
  }

  return { dataUrl, mime: mimeOfDataUrl(dataUrl), name: file.name, size: file.size };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}