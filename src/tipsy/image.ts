// Browser-side resize/compress for recipe hero photos. Canvas-based, no
// dependencies — downscales to a max edge, re-encodes as JPEG, and never
// upscales a source image that's already smaller than the target.

const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.8;
const HEIC_NAME_PATTERN = /\.(heic|heif)$/i;

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

// Compresses a File into a JPEG Blob with its longest edge capped at
// MAX_EDGE (aspect ratio preserved, smaller images left at their native
// size) and re-encoded at JPEG_QUALITY. Targets roughly 200KB — some
// images will land above or below depending on content.
export async function compressImageFile(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    const looksLikeHeic =
      file.type === "image/heic" || file.type === "image/heif" || HEIC_NAME_PATTERN.test(file.name);
    throw new UnsupportedImageError(
      looksLikeHeic
        ? "This photo is a HEIC file, which your browser can't process. Try a JPEG or PNG instead."
        : "Couldn't read this photo. Try a JPEG, PNG, or WEBP file instead."
    );
  }

  try {
    const { width, height } = bitmap;
    const longestEdge = Math.max(width, height);
    const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1; // never upscale
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new UnsupportedImageError("Couldn't process this photo. Please try a different one.");
    }
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) {
      throw new UnsupportedImageError("Couldn't process this photo. Please try a different one.");
    }
    return blob;
  } finally {
    bitmap.close();
  }
}
