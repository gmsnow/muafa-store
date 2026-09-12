import { AppError } from "./api-response";

/** Max decoded image payload a client may send (5 MB). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";

export function extensionForMime(mime: string): string {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

/** Sniff the real format from magic bytes — never trust the declared MIME. */
export function sniffImageMime(buffer: Uint8Array): ImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 &&
    buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a
  ) return "image/png";
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) return "image/webp";
  return null;
}

/** Decode + validate a client-provided `data:image/...;base64,...` payload. */
export function decodeImageData(dataUrl: string, mime: string): Buffer {
  const normalized = mime === "image/jpg" ? "image/jpeg" : mime;
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl.trim());
  if (!match) throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  if (match[1] !== (normalized === "image/jpg" ? "jpeg" : normalized.replace("image/", ""))) {
    throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  }
  const buffer = Buffer.from(match[2], "base64");
  if (buffer.byteLength === 0) throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  if (buffer.byteLength > IMAGE_MAX_BYTES) throw new AppError("IMAGE_TOO_LARGE", "Image must be smaller than 5 MB");
  if (!sniffImageMime(new Uint8Array(buffer))) throw new AppError("INVALID_IMAGE_TYPE", "Image must be JPG, PNG or WEBP");
  return buffer;
}