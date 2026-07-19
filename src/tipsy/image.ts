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

// Source-bitmap pixel-space rectangle selecting the region to keep. Optional —
// when omitted, the whole bitmap is used (unchanged pre-crop behavior).
export type CropRect = { sx: number; sy: number; sWidth: number; sHeight: number };

// Compresses a File into a JPEG Blob with its longest edge capped at
// MAX_EDGE (aspect ratio preserved, smaller images left at their native
// size) and re-encoded at JPEG_QUALITY. Targets roughly 200KB — some
// images will land above or below depending on content. When cropRect is
// given, the crop and the resize happen in the same single canvas draw (the
// 9-argument drawImage form) rather than as two passes.
export async function compressImageFile(file: File, cropRect?: CropRect): Promise<Blob> {
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

    // Defensive clamp — the crop UI should only ever produce a valid rect, but
    // compressImageFile doesn't trust that: an out-of-bounds or malformed rect
    // is clamped back onto the bitmap rather than trusted as-is, so a UI bug
    // can't corrupt storage with a garbage draw or a throw deep in canvas code.
    let sx = 0, sy = 0, sWidth = width, sHeight = height;
    if (cropRect) {
      sWidth = Math.min(Math.max(1, Math.round(cropRect.sWidth)), width);
      sHeight = Math.min(Math.max(1, Math.round(cropRect.sHeight)), height);
      sx = Math.min(Math.max(0, Math.round(cropRect.sx)), width - sWidth);
      sy = Math.min(Math.max(0, Math.round(cropRect.sy)), height - sHeight);
    }

    const longestEdge = Math.max(sWidth, sHeight);
    const scale = longestEdge > MAX_EDGE ? MAX_EDGE / longestEdge : 1; // never upscale
    const targetWidth = Math.round(sWidth * scale);
    const targetHeight = Math.round(sHeight * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new UnsupportedImageError("Couldn't process this photo. Please try a different one.");
    }
    ctx.drawImage(bitmap, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

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
