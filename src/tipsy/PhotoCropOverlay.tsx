import { useState, useRef, useEffect } from "react";
import { type CropRect } from "./image";

// Extracted from App.tsx (pure move, no behavior change) — shared full-screen
// pan/zoom crop step used by the recipe hero photo flow and the Cook History
// "Log a cook" photo flow, both still in App.tsx, plus LogGroupingCookSheet's
// dish/menu cook-photo flow.

// Longest edge for the crop overlay's PREVIEW image only — not the final output.
// Decoding the raw multi-megapixel source directly into the preview <img> was
// what made the overlay take seconds to appear; requesting a resize at decode
// time lets the browser use a cheaper scaled-decode path instead of decoding
// every source pixel just to shrink it. Matches
// image.ts's own MAX_EDGE so preview sharpness at rest matches the final output;
// some softening is possible at the crop UI's 3x max zoom, an accepted tradeoff
// since the actual saved photo is always re-decoded from the untouched original.
const CROP_PREVIEW_MAX_EDGE = 1200;

// Full-screen pan/zoom crop step shown on every photo upload (first upload and
// replace), before the file reaches compressImageFile. `offset` is the image's
// top-left in frame-local px; `minZoom` is the "image fully covers frame" floor
// (zoom can't go below it, so the frame is never under-covered); `zoomMultiplier`
// (>=1) scales up from there. `naturalSize` is the PREVIEW image's dimensions, not
// the source file's — cropRect is derived once, at Confirm, by inverting that same
// offset/scale math into a fraction (0-1) of the preview's own size, which
// compressImageFile then resolves against the true original's pixel dimensions.
export function PhotoCropOverlay({ file, onCancel, onConfirm }: {
  file: File | null;
  onCancel: () => void;
  onConfirm: (cropRect: CropRect) => void;
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [zoomMultiplier, setZoomMultiplier] = useState(1);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!file) {
      setImgUrl(null);
      setNaturalSize(null);
      setOffset({ x: 0, y: 0 });
      setZoomMultiplier(1);
      initializedRef.current = false;
      return;
    }
    initializedRef.current = false;
    let cancelled = false;
    let blobUrl: string | null = null;
    (async () => {
      // Decode a resized preview only — the original `file` is untouched and is
      // what compressImageFile decodes again, at full resolution, at Confirm.
      // resizeWidth alone (not resizeHeight too) is deliberate: passing both is
      // ambiguous about aspect-ratio preservation across engines, and a distorted
      // preview would mean the user crops against a shape that doesn't match the
      // real photo. Single-dimension resize is spec-guaranteed to preserve it.
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, { resizeWidth: CROP_PREVIEW_MAX_EDGE });
      } catch {
        return;
      }
      if (cancelled) {
        bitmap.close();
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
      if (cancelled || !blob) return;
      blobUrl = URL.createObjectURL(blob);
      setImgUrl(blobUrl);
    })();
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [file]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setFrameSize({ w: width, h: height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [imgUrl]);

  // Center the image in the frame once, the first time both its natural size and
  // the frame's rendered size are known for this file — not on every resize, so a
  // later layout tick can't silently recenter a photo the user has already panned.
  useEffect(() => {
    if (initializedRef.current || !naturalSize || !frameSize) return;
    const mz = Math.max(frameSize.w / naturalSize.w, frameSize.h / naturalSize.h);
    setOffset({
      x: (frameSize.w - naturalSize.w * mz) / 2,
      y: (frameSize.h - naturalSize.h * mz) / 2,
    });
    setZoomMultiplier(1);
    initializedRef.current = true;
  }, [naturalSize, frameSize]);

  if (!file || !imgUrl) return null;

  const minZoom = naturalSize && frameSize
    ? Math.max(frameSize.w / naturalSize.w, frameSize.h / naturalSize.h)
    : 1;
  const displayScale = minZoom * zoomMultiplier;
  const dispW = naturalSize ? naturalSize.w * displayScale : 0;
  const dispH = naturalSize ? naturalSize.h * displayScale : 0;

  function clampOffset(x: number, y: number, dw: number, dh: number) {
    if (!frameSize) return { x, y };
    const minX = frameSize.w - dw;
    const minY = frameSize.h - dh;
    return {
      x: Math.min(0, Math.max(minX, x)),
      y: Math.min(0, Math.max(minY, y)),
    };
  }

  function handlePointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setOffset(clampOffset(dragRef.current.startOffsetX + dx, dragRef.current.startOffsetY + dy, dispW, dispH));
  }

  function handlePointerUp() {
    dragRef.current = null;
  }

  function handleZoomChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextZoom = Math.min(3, Math.max(1, parseFloat(e.target.value) || 1));
    if (!naturalSize || !frameSize) {
      setZoomMultiplier(nextZoom);
      return;
    }
    // Keep the point under the frame's center fixed in image-space while rescaling,
    // so dragging the slider zooms "in place" instead of drifting off-center.
    const nextDisplayScale = minZoom * nextZoom;
    const centerImgX = (frameSize.w / 2 - offset.x) / displayScale;
    const centerImgY = (frameSize.h / 2 - offset.y) / displayScale;
    const nextDispW = naturalSize.w * nextDisplayScale;
    const nextDispH = naturalSize.h * nextDisplayScale;
    setZoomMultiplier(nextZoom);
    setOffset(clampOffset(
      frameSize.w / 2 - centerImgX * nextDisplayScale,
      frameSize.h / 2 - centerImgY * nextDisplayScale,
      nextDispW,
      nextDispH
    ));
  }

  function handleConfirm() {
    if (!naturalSize || !frameSize) return;
    // naturalSize is the PREVIEW's dimensions, not the source file's — dividing
    // by it here (rather than by the original's pixel size, which this component
    // never knows) produces a fraction of the image's own extent, so it resolves
    // correctly against the full-resolution original in compressImageFile.
    onConfirm({
      fx: (-offset.x / displayScale) / naturalSize.w,
      fy: (-offset.y / displayScale) / naturalSize.h,
      fWidth: (frameSize.w / displayScale) / naturalSize.w,
      fHeight: (frameSize.h / displayScale) / naturalSize.h,
    });
  }

  return (
    <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 64, background: "#FAF7F2", zIndex: 60, display: "flex", flexDirection: "column" }}>
      <style>{`
        .td-zoom-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 4px; border-radius: 2px; background: rgba(35,60,0,0.15); outline: none; }
        .td-zoom-slider::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 20px; height: 20px; border-radius: 50%; background: #233C00; cursor: pointer; }
        .td-zoom-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: #233C00; border: none; cursor: pointer; }
      `}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 20px 12px", flexShrink: 0 }}>
        <button
          onClick={onCancel}
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", fontFamily: "Inter, sans-serif", fontSize: 14, fontWeight: 500, color: "#233C00" }}
        >
          Cancel
        </button>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(35,60,0,0.4)", fontWeight: 500 }}>
          Position photo
        </div>
        <span style={{ width: 52 }} />
      </div>

      {/* Crop frame — fixed 4:3, drag to reposition */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px", minHeight: 0 }}>
        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{
            width: "100%",
            maxWidth: 432,
            aspectRatio: "4 / 3",
            borderRadius: 30,
            overflow: "hidden",
            border: "1px solid rgba(35,60,0,0.15)",
            position: "relative",
            touchAction: "none",
            cursor: "grab",
          }}
        >
          <img
            src={imgUrl}
            alt=""
            draggable={false}
            decoding="async"
            onLoad={(e) => {
              const el = e.currentTarget;
              setNaturalSize({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            style={{
              position: "absolute",
              left: offset.x,
              top: offset.y,
              width: dispW || undefined,
              height: dispH || undefined,
              maxWidth: "none",
              userSelect: "none",
              pointerEvents: "none",
            }}
          />
        </div>
      </div>

      {/* Zoom slider */}
      <div style={{ padding: "12px 24px 24px", flexShrink: 0 }}>
        <input
          className="td-zoom-slider"
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoomMultiplier}
          onChange={handleZoomChange}
        />
      </div>

      {/* Confirm CTA */}
      <button
        onClick={handleConfirm}
        style={{
          display: "block",
          width: "calc(100% - 48px)",
          margin: "0 24px 24px",
          padding: "14px 0",
          background: "#233C00",
          color: "#FAF7F2",
          border: "none",
          borderRadius: 100,
          fontFamily: "Inter, sans-serif",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: "pointer",
          fontWeight: 500,
        }}
      >
        Use Photo
      </button>
    </div>
  );
}
