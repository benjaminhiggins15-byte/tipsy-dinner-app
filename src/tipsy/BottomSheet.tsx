import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconX } from "@tabler/icons-react";

// Dishes & Menus v1.5 refactor — shared shell for every bottom sheet and
// toast this feature introduced (LogGroupingCookSheet, AddPartSheet,
// SaveToSheet, WhichCourseSheet, LogCookTypePicker, SaveToast, SavedToast,
// the Home/RecipeCard "incoming" toast). Each of those reimplemented the
// same portal/backdrop/app-column/animation/close mechanics independently;
// this file is the one place that logic now lives. Colors/fonts below are
// local copies of DishScreen.tsx's constants (not imported from there) to
// avoid a circular import — DishScreen.tsx imports BottomSheet/Toast from
// here. Same convention LogCookTypePicker.tsx already used pre-refactor.
const FOREST = "#233C00";
const BODY_BG = "#FAF7F2";
const MUTED_TEXT = "rgba(35,60,0,0.6)";
const FONT_SANS = "'Inter', sans-serif";
const FONT_SERIF_ITALIC = "'Fraunces', serif";
// Matches App.tsx's S.phone maxWidth. A portaled sheet/toast escapes
// ScreenStage's transformed layer (see BottomSheet's `portal` doc below),
// which also means it escapes the phone frame's own width constraint and
// must restate it here to stay lined up on wide screens.
const APP_MAX_WIDTH = 480;

// iOS Safari keeps `position: fixed` anchored to the LAYOUT viewport, not the
// visible area the keyboard leaves behind — a fixed-height ("100%") sheet
// gets dragged off-screen when the keyboard opens and the page scrolls the
// focused input into view. `window.visualViewport` reports the actually-
// visible box (shrinks with the keyboard; `offsetTop`/`offsetLeft` report how
// far that visible box has scrolled from the fixed layer's origin), so every
// BottomSheet instance re-sizes/re-positions itself off it live. Returns null
// (callers fall back to the old 100%/top:0 behavior) where unsupported.
//
// While the keyboard animates open/closed, iOS fires several `resize`/`scroll`
// events in quick succession with intermediate (not-yet-settled) values.
// Coalescing to at most one state update per animation frame cuts down on
// redundant re-renders during that burst. (A CSS transition on the consuming
// styles was tried as an extra smoothing step and made the wiggle worse —
// animating toward each intermediate value fought the next one arriving
// mid-transition — so the overlay snaps directly to each rAF-batched value
// instead.)
function useVisualViewportBox() {
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setBox({ top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height });
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return box;
}

// `html`/`body`/`#root` are permanently pinned at `overflow: hidden` (see
// styles.css) — the app shell never intentionally scrolls the page itself
// (it's a fixed-height column with its own internal `overflowY` regions), so
// there is nothing to lock/restore per sheet open/close. An earlier version
// of this file toggled a `position: fixed` lock on/off per sheet, but
// toggling body's own positioning while iOS was mid-way through panning the
// visual viewport for the keyboard made things worse (visible wiggle on
// focus, and the page landing offset after close) — removed entirely in
// favor of the permanent pin plus the explicit `resetPageScroll` below.
//
// iOS can still leave `window.scrollX`/`scrollY` nonzero as a side effect of
// its focus-scroll-into-view heuristic even though the page can't actually
// scroll (overflow: hidden) — that leftover offset is what showed up as the
// page landing shifted after the sheet closed. Since this app never
// legitimately scrolls the window, any nonzero scroll position is always
// that leftover residue, so it's always safe to zero it out.
function resetPageScroll() {
  requestAnimationFrame(() => window.scrollTo(0, 0));
}

// A <style> tag's rules are only live while that component instance is
// mounted, so BottomSheet/Toast each render this themselves rather than
// relying on some other, unrelated mounted component to have already
// defined these keyframes (CookFeed.tsx's pre-refactor SaveToSheet/SaveToast
// depended on that coincidence and silently lost their animation whenever
// nothing else nearby happened to provide it). Exported because Toast's
// un-portaled path (SavedToast, the incoming-cook-logged toast) doesn't
// render it internally — those callers must still mount it themselves, same
// as DishScreen.tsx/MenuScreen.tsx's old PlanKeyframes did pre-refactor.
export function SheetKeyframes() {
  return (
    <style>{`
      @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
    `}</style>
  );
}

// Draggable grab handle — pointer-tracks a downward drag past a 60px
// threshold and calls `onDismiss`. A separate component (not baked into
// BottomSheet's own layout) because its exact placement inside the header
// varies per sheet (it sits alongside title/subtitle, sometimes a search
// box too) — callers render it inline wherever the original markup did.
export function DragHandle({ onDismiss }: { onDismiss: () => void }) {
  const dragStartY = useRef<number | null>(null);
  return (
    <div
      onPointerDown={(e) => {
        dragStartY.current = e.clientY;
      }}
      onPointerMove={(e) => {
        if (dragStartY.current == null) return;
        if (e.clientY - dragStartY.current > 60) {
          dragStartY.current = null;
          onDismiss();
        }
      }}
      onPointerUp={() => {
        dragStartY.current = null;
      }}
      onPointerCancel={() => {
        dragStartY.current = null;
      }}
      style={{ width: 60, padding: "10px 0", margin: "-10px auto 8px", display: "flex", justifyContent: "center", cursor: "grab", touchAction: "none" }}
    >
      <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(35,60,0,0.15)" }} />
    </div>
  );
}

export function BottomSheet({
  onClose,
  children,
  portal = true,
  zIndex = 200,
  bottomInset = 0,
  sizing = "full",
  maxHeight,
  showClose = true,
  closeOnBackdrop = true,
}: {
  onClose: () => void;
  children: ReactNode;
  // AddPartSheet/SaveToSheet/WhichCourseSheet/LogGroupingCookSheet portal to
  // document.body: ScreenStage applies an inline `transform` to every screen
  // layer (even a no-op translateX(0) when idle), which per the CSS spec
  // makes that layer a containing block for `position: fixed` descendants —
  // nested inside that tree, "fixed" resolves against the transformed layer
  // instead of the viewport (the same trap CLAUDE.md's `paddingBottom: 64`
  // note documents, and the one that made the pre-refactor SaveToast
  // invisible behind the bottom tab bar until it was portaled). A portal
  // escapes that tree entirely. LogCookTypePicker deliberately stays
  // un-portaled (`portal={false}`) — unchanged from its pre-refactor shape.
  portal?: boolean;
  zIndex?: number;
  // Viewport-bottom clearance in px (e.g. 64 for nav-bar clearance); 0 means
  // the sheet covers the full viewport, including where the nav bar sits.
  bottomInset?: number;
  // "full": panel stretches to the full available height (minus bottomInset).
  // "auto": panel sizes to its content, optionally capped by `maxHeight`.
  sizing?: "full" | "auto";
  maxHeight?: string;
  showClose?: boolean;
  closeOnBackdrop?: boolean;
}) {
  const viewportBox = useVisualViewportBox();
  const overlayHeight = viewportBox ? viewportBox.height - bottomInset : undefined;

  // Clears leftover keyboard-pan scroll once the keyboard closes while the
  // sheet is still open (covers input blur indirectly — blurring closes the
  // keyboard, which is what shrinks/regrows this height) and once more on
  // close/unmount, since the keyboard may still be dismissing at that point.
  useEffect(() => {
    if (!viewportBox) return;
    if (viewportBox.height >= window.innerHeight) resetPageScroll();
  }, [viewportBox]);

  useEffect(() => {
    return () => resetPageScroll();
  }, []);

  const overlay = (
    <div
      onClick={closeOnBackdrop ? onClose : undefined}
      style={{
        position: "fixed",
        top: viewportBox ? viewportBox.top : 0,
        left: viewportBox ? viewportBox.left : 0,
        width: viewportBox ? viewportBox.width : undefined,
        right: viewportBox ? undefined : 0,
        height: overlayHeight,
        bottom: viewportBox ? undefined : bottomInset,
        zIndex,
        display: "flex",
        justifyContent: "center",
      }}
    >
      {/* Constrains the dim layer to the app column's width instead of
          dimming the full browser viewport, and stacks it under the sheet
          within that same column. */}
      <div style={{ position: "relative", width: "100%", maxWidth: APP_MAX_WIDTH, height: "100%", display: "flex", alignItems: "flex-end" }}>
        <div style={{ position: "absolute", inset: 0, background: "rgba(35, 60, 0, 0.08)", animation: "tipsy-fade 0.22s ease" }} />
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "relative",
            background: BODY_BG,
            borderRadius: "28px 28px 0 0",
            width: "100%",
            maxWidth: APP_MAX_WIDTH,
            ...(sizing === "full" ? { height: "100%" } : maxHeight ? { maxHeight: viewportBox ? `min(${maxHeight}, 100%)` : maxHeight } : {}),
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          {showClose && (
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                position: "absolute",
                top: 14,
                right: 16,
                width: 32,
                height: 32,
                minWidth: 32,
                borderRadius: "50%",
                background: "rgba(35,60,0,0.06)",
                border: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                zIndex: 1,
              }}
            >
              <IconX size={16} stroke={1.75} color={MUTED_TEXT} />
            </button>
          )}
          {children}
        </div>
      </div>
      <SheetKeyframes />
    </div>
  );

  return portal ? createPortal(overlay, document.body) : overlay;
}

type ToastProps = {
  show: boolean;
  message?: string | null;
  // If both are provided, the Toast itself owns the auto-dismiss timer
  // (clearing it on unmount/re-trigger same as every pre-refactor caller's
  // own setTimeout did). Omit either to leave dismissal fully caller-driven
  // (e.g. DishScreen's SavedToast, whose caller flips `show` off itself).
  onDismiss?: () => void;
  durationMs?: number;
  // SaveToast needs to portal (see BottomSheet's `portal` doc above).
  // SavedToast and the incoming-cook-logged toast stay un-portaled,
  // unchanged from their pre-refactor shape.
  portal?: boolean;
  // "top": absolute within the nearest positioned ancestor (SavedToast).
  // "bottom": fixed to the viewport (SaveToast when portaled; the
  // incoming-cook-logged toast when not).
  placement?: "top" | "bottom";
  offset?: number;
  zIndex?: number;
  background?: string;
  color?: string;
  borderRadius?: number;
  padding?: string;
  fontSize?: number;
  fontWeight?: number;
  uppercase?: boolean;
  letterSpacing?: string;
  maxWidth?: number;
  actionLabel?: string;
  onAction?: () => void;
};

export function Toast({
  show,
  message,
  onDismiss,
  durationMs,
  portal = true,
  placement = "bottom",
  offset,
  zIndex = 1000,
  background = FOREST,
  color = "#FAF7F2",
  borderRadius = 14,
  padding = "12px 16px",
  fontSize = 13,
  fontWeight,
  uppercase = false,
  letterSpacing,
  maxWidth,
  actionLabel,
  onAction,
}: ToastProps) {
  useEffect(() => {
    if (!show || !durationMs || !onDismiss) return;
    const t = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(t);
  }, [show, durationMs, onDismiss]);

  if (!show || !message) return null;

  const style: CSSProperties = {
    pointerEvents: portal ? "auto" : undefined,
    background,
    color,
    borderRadius,
    padding,
    fontFamily: FONT_SANS,
    fontSize,
    fontWeight,
    textTransform: uppercase ? "uppercase" : undefined,
    letterSpacing,
    textAlign: "center",
    maxWidth,
    animation: "tipsy-fade 0.2s ease",
  };

  const pill = (
    <div style={style}>
      {message}
      {actionLabel && (
        <>
          {" "}
          <span
            onClick={onAction}
            style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", textDecoration: "underline", cursor: "pointer" }}
          >
            {actionLabel}
          </span>
        </>
      )}
    </div>
  );

  if (portal) {
    // Full-viewport fixed layer, column-centered to the app width (so wide
    // screens still line the toast up with the app column, not the full
    // browser width), pill pinned near the bottom via paddingBottom.
    return createPortal(
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex, display: "flex", justifyContent: "center", pointerEvents: "none" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: APP_MAX_WIDTH,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "flex-end",
            paddingBottom: offset ?? 80,
          }}
        >
          {pill}
        </div>
        <SheetKeyframes />
      </div>,
      document.body
    );
  }

  return (
    <div
      style={{
        position: placement === "top" ? "absolute" : "fixed",
        [placement]: offset ?? (placement === "top" ? 12 : 80),
        left: "50%",
        transform: "translateX(-50%)",
        zIndex,
      }}
    >
      {pill}
    </div>
  );
}
