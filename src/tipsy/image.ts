// Browser-side resize/compress for recipe hero photos. Canvas-based, no
// dependencies — downscales to a max edge, re-encodes as JPEG, and never
// upscales a source image that's already smaller than the target.

const MAX_EDGE = 1200;
const JPEG_QUALITY = 0.8;
const HEIC_NAME_PATTERN = /\.(heic|heif)$/i;

// --- "Enhance photo" tuning constants ---
// All of these are first guesses, meant to be tuned against real photos —
// expect them to change. Target is "good natural light," not an HDR/filter look.

// Auto-levels: fraction of pixels clipped as outliers at each end of the
// luminance histogram when finding the black/white point. 0.5% per end is
// conservative — a genuinely full-range photo should see ~no shift.
const AUTO_LEVELS_CLIP_FRACTION = 0.005;

// Auto-white-balance (grey-world): per-channel scale factor is capped at this
// fraction above/below 1.0. Without this cap, a photo dominated by one real
// color (tomato soup, a green salad) reads as a color cast and gets drained of
// its actual color. Do not remove.
const WHITE_BALANCE_MAX_SHIFT = 0.15;

// Contrast: fixed nudge applied around the 128 midpoint. +8% is meant to read
// as "a little crisper," not punchy.
const CONTRAST_AMOUNT = 0.08;

// Saturation: fixed lift, blending each pixel away from its own luminance.
// +10% is meant to read as "a little more alive," not saturated.
const SATURATION_AMOUNT = 0.1;

// Statistics (histogram + grey-world means) are measured on every Nth pixel
// rather than all of them — see enhancePhoto() for why. The correction itself
// is still applied to every pixel; only the measurement pass is subsampled.
const STATS_SAMPLE_STRIDE = 4;

export class UnsupportedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedImageError";
  }
}

// Fractional (0-1) rectangle selecting the region to keep, expressed relative
// to the source image's own width/height rather than absolute pixels. Optional —
// when omitted, the whole bitmap is used (unchanged pre-crop behavior). Fractional
// on purpose: the crop UI may compute this against a downscaled preview of the
// file (for decode speed) rather than the full-resolution original — a fraction
// is resolution-independent, so the same rect is correct whether applied to the
// preview or, as here, the true original bitmap this function decodes.
export type CropRect = { fx: number; fy: number; fWidth: number; fHeight: number };

function clamp8(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

// Deterministic "good natural light" pass: auto-levels, then grey-world
// auto-white-balance, then a mild fixed contrast + saturation nudge. Runs
// directly on the canvas that drawImage already painted — no second canvas,
// no second encode, just a getImageData/putImageData round-trip on the
// existing pixel buffer.
//
// The histogram and grey-world channel means are both measured in a single
// subsampled pass (every STATS_SAMPLE_STRIDE-th pixel) over the ORIGINAL pixel
// data — not re-measured between corrections. By the time compressImageFile
// calls this, the canvas is already downscaled to at most MAX_EDGE (1200) on
// its longest edge, so a full-resolution scan here is at most ~1.4MP — already
// cheap. Subsampling is a further, deliberate margin: global statistics like a
// histogram clip point or a channel mean don't need every pixel to be stable,
// so sampling 1-in-4 cuts the measurement pass to ~25% of the work while still
// drawing on hundreds of thousands of samples for a typical photo — far more
// than enough given the clip fraction is only 0.5%. The correction itself is
// NOT subsampled: every pixel in the buffer is rewritten, since a sparse
// correction would leave visible untouched pixels.
function enhancePhoto(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const pixelCount = width * height;

  // --- Measure: luminance histogram + per-channel sums, subsampled ---
  const histogram = new Uint32Array(256);
  let rSum = 0, gSum = 0, bSum = 0;
  let sampleCount = 0;
  for (let p = 0; p < pixelCount; p += STATS_SAMPLE_STRIDE) {
    const i = p * 4;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    histogram[clamp8(0.299 * r + 0.587 * g + 0.114 * b)]++;
    rSum += r;
    gSum += g;
    bSum += b;
    sampleCount++;
  }

  // Black/white point: walk the histogram in from each end until the clip
  // fraction of sampled pixels has been passed.
  const clipCount = Math.max(1, Math.round(sampleCount * AUTO_LEVELS_CLIP_FRACTION));
  let blackPoint = 0;
  let cumulative = 0;
  for (let v = 0; v < 256; v++) {
    cumulative += histogram[v];
    if (cumulative >= clipCount) {
      blackPoint = v;
      break;
    }
  }
  let whitePoint = 255;
  cumulative = 0;
  for (let v = 255; v >= 0; v--) {
    cumulative += histogram[v];
    if (cumulative >= clipCount) {
      whitePoint = v;
      break;
    }
  }
  // Degenerate/near-flat image guard — an inverted or zero range would blow up
  // the stretch below into a no-op-or-worse; fall back to leaving levels alone.
  if (whitePoint <= blackPoint) {
    blackPoint = 0;
    whitePoint = 255;
  }
  const levelsRange = whitePoint - blackPoint;

  // Grey-world means, clamped per channel to WHITE_BALANCE_MAX_SHIFT.
  const rMean = rSum / sampleCount;
  const gMean = gSum / sampleCount;
  const bMean = bSum / sampleCount;
  const grayMean = (rMean + gMean + bMean) / 3;
  const channelScale = (mean: number) => {
    if (mean <= 0) return 1;
    const raw = grayMean / mean;
    return Math.min(1 + WHITE_BALANCE_MAX_SHIFT, Math.max(1 - WHITE_BALANCE_MAX_SHIFT, raw));
  };
  const rScale = channelScale(rMean);
  const gScale = channelScale(gMean);
  const bScale = channelScale(bMean);

  // --- Apply: auto-levels -> white-balance -> contrast -> saturation, every pixel ---
  for (let i = 0; i < data.length; i += 4) {
    let r = data[i], g = data[i + 1], b = data[i + 2];

    r = ((r - blackPoint) / levelsRange) * 255;
    g = ((g - blackPoint) / levelsRange) * 255;
    b = ((b - blackPoint) / levelsRange) * 255;

    r *= rScale;
    g *= gScale;
    b *= bScale;

    r = (r - 128) * (1 + CONTRAST_AMOUNT) + 128;
    g = (g - 128) * (1 + CONTRAST_AMOUNT) + 128;
    b = (b - 128) * (1 + CONTRAST_AMOUNT) + 128;

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * (1 + SATURATION_AMOUNT);
    g = lum + (g - lum) * (1 + SATURATION_AMOUNT);
    b = lum + (b - lum) * (1 + SATURATION_AMOUNT);

    data[i] = clamp8(r);
    data[i + 1] = clamp8(g);
    data[i + 2] = clamp8(b);
    // alpha (data[i + 3]) untouched
  }

  ctx.putImageData(imageData, 0, 0);
}

// Compresses a File into a JPEG Blob with its longest edge capped at
// MAX_EDGE (aspect ratio preserved, smaller images left at their native
// size) and re-encoded at JPEG_QUALITY. Targets roughly 200KB — some
// images will land above or below depending on content. When cropRect is
// given, the crop and the resize happen in the same single canvas draw (the
// 9-argument drawImage form) rather than as two passes. `enhance` (default
// false — existing callers that omit it are unaffected) runs the
// deterministic auto-levels/white-balance/contrast/saturation pass above, in
// the same canvas, before the encode.
export async function compressImageFile(file: File, cropRect?: CropRect, enhance: boolean = false): Promise<Blob> {
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
    // Fractions are resolved against THIS bitmap's actual dimensions — the
    // full-resolution original, always, regardless of what resolution image the
    // crop UI computed the fraction from.
    let sx = 0, sy = 0, sWidth = width, sHeight = height;
    if (cropRect) {
      sWidth = Math.min(Math.max(1, Math.round(cropRect.fWidth * width)), width);
      sHeight = Math.min(Math.max(1, Math.round(cropRect.fHeight * height)), height);
      sx = Math.min(Math.max(0, Math.round(cropRect.fx * width)), width - sWidth);
      sy = Math.min(Math.max(0, Math.round(cropRect.fy * height)), height - sHeight);
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

    if (enhance) {
      enhancePhoto(ctx, targetWidth, targetHeight);
    }

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
