import { useState, useRef, useEffect } from "react";
import { type RecipeStep, normalizeStep } from "./data";

// Build's "RECIPE PREVIEW" sheet. Extracted from App.tsx (Cook) so
// SharedRecipeView can reuse the exact same component for the logged-out
// in-app share view, instead of hand-matching its styles — this is the only
// place that preview's look-and-feel is defined; changes here apply to both
// callers automatically.
export default function ExpandedRecipeOverlay({
  open,
  bottomOffset,
  onSave,
  recipe,
  saveLabel = "Save",
  sharerName,
  onSignIn,
  photoUrl,
  onBack,
  onDismiss,
}: {
  open: boolean;
  bottomOffset: number;
  onSave: () => void;
  recipe: {
    title: string;
    description: string;
    ingredients: { name: string; qty: string }[];
    steps: RecipeStep[];
  };
  // Optional, additive props for the logged-out share-view caller — all
  // default to Build's original behavior exactly when omitted.
  saveLabel?: string;
  sharerName?: string;
  onSignIn?: () => void;
  photoUrl?: string | null;
  // Optional back control for callers that mount this as a full navigated
  // screen (e.g. Home's Discovered detail) rather than an overlay above a
  // mini-player — renders a back chevron in the header's left slot when
  // provided; omitted leaves the header exactly as it was for every other caller.
  onBack?: () => void;
  // Optional dismiss control, paired with onBack for Home's Discovered
  // detail (the only caller needing both) — renders a text button in the
  // header's right slot, otherwise left as an empty spacer.
  onDismiss?: () => void;
}) {
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const [contentVisible, setContentVisible] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      const t = setTimeout(() => setContentVisible(true), 350);
      return () => clearTimeout(t);
    } else if (mounted) {
      setContentVisible(false);
      setShown(false);
      const t = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(t);
    }
  }, [open, mounted]);

  if (!mounted) return null;

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: bottomOffset,
        top: 0,
        pointerEvents: shown ? "auto" : "none",
        zIndex: 50,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: shown ? "100%" : 0,
          background: "#FAF7F2",
          transition: "height 350ms cubic-bezier(0.22, 1, 0.36, 1)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
      <div style={{
        opacity: contentVisible ? 1 : 0,
        transition: "opacity 200ms ease",
        display: "flex", flexDirection: "column", height: "100%",
        background: "#FAF7F2",
      }}>
      {/* Sheet header */}
      <div style={{ padding: "20px 16px 12px", flexShrink: 0, display: "grid", gridTemplateColumns: "32px 1fr 32px", alignItems: "center", background: "#FAF7F2" }}>
        {onBack ? (
          <button
            onClick={onBack}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifySelf: "start" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        ) : (
          <span />
        )}
        <div style={{
          textAlign: "center",
          fontFamily: "Inter, sans-serif",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          color: "rgba(35,60,0,0.35)",
          fontWeight: 500,
        }}>
          RECIPE PREVIEW
        </div>
        {onDismiss ? (
          <button
            onClick={onDismiss}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              justifySelf: "end",
              fontFamily: "Inter, sans-serif",
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              fontWeight: 500,
              color: "rgba(35,60,0,0.4)",
            }}
          >
            Dismiss
          </button>
        ) : (
          <span />
        )}
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {/* Hero section - scrolls normally */}
        {photoUrl ? (
          <div style={{
            width: "100%",
            aspectRatio: "4 / 3",
            borderRadius: 30,
            overflow: "hidden",
            background: "rgba(35,60,0,0.06)",
          }}>
            <img
              src={photoUrl}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          </div>
        ) : (
          <div style={{ height: 120, background: "#FAF7F2" }} />
        )}
        <div style={{ padding: "16px 24px 14px" }}>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "rgba(35,60,0,0.35)",
            marginBottom: 6,
            fontWeight: 500,
          }}>
            Recipe
          </div>
          <div style={{
            fontFamily: "Inter, sans-serif",
            fontSize: 28,
            fontWeight: 700,
            color: "#233C00",
            lineHeight: 1.1,
            marginBottom: 8,
            textTransform: "uppercase",
          }}>
            {recipe.title}
          </div>
          {sharerName && (
            <div style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(35,60,0,0.5)",
              marginBottom: 12,
            }}>
              inspired by {sharerName}
            </div>
          )}
          <div style={{
            fontFamily: "Fraunces, serif",
            fontStyle: "italic",
            fontWeight: 300,
            fontSize: 15,
            color: "rgba(35,60,0,0.55)",
            lineHeight: 1.5,
          }}>
            {recipe.description}
          </div>
        </div>

        {/* Sticky Tabs - stick to top when scrolled */}
        <div style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#FAF7F2",
          borderBottom: "1px solid rgba(35,60,0,0.08)",
        }}>
          <div style={{
            display: "flex",
            gap: 28,
            padding: "20px 24px 0",
          }}>
            {(["ingredients", "steps"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    background: "transparent",
                    color: active ? "#233C00" : "rgba(35,60,0,0.3)",
                    border: "none",
                    borderBottom: active ? "1.5px solid #233C00" : "1.5px solid transparent",
                    cursor: "pointer",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 11,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 500,
                    padding: "0 0 12px 0",
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Both tabs rendered, only one visible */}
        <div style={{ display: tab === "ingredients" ? "block" : "none" }}>
          {recipe.ingredients.map((item, i) => (
            <div key={i} style={{
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 8,
              padding: "12px 24px",
              borderBottom: "1px dotted rgba(35,60,0,0.1)",
            }}>
              <span style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 15,
                fontWeight: 400,
                color: "#233C00",
                textAlign: "left",
                flex: 1,
                maxWidth: "58%",
              }}>{item.name}</span>
              <span style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
                color: "rgba(35,60,0,0.4)",
                textAlign: "right",
                flexShrink: 0,
                maxWidth: "40%",
              }}>{item.qty}</span>
            </div>
          ))}
        </div>
        <div style={{ display: tab === "steps" ? "block" : "none" }}>
          {recipe.steps.map((s, i) => (
            <div key={i} style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: "12px 24px",
              borderBottom: "1px dotted rgba(35,60,0,0.1)",
            }}>
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(35,60,0,0.06)",
                border: "1px solid rgba(35,60,0,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontFamily: "Inter, sans-serif",
                fontSize: 11,
                fontWeight: 500,
                color: "rgba(35,60,0,0.4)",
              }}>{i + 1}</div>
              <span style={{
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 400,
                color: "#233C00",
                lineHeight: 1.6,
                flex: 1,
              }}>
                {normalizeStep(s).title && (
                  <span style={{ fontWeight: 600 }}>
                    {normalizeStep(s).title}
                    {" — "}
                  </span>
                )}
                {normalizeStep(s).instruction}
              </span>
            </div>
          ))}
        </div>
        {/* Save button */}
        <button
          onClick={onSave}
          style={{
            display: "block",
            width: "calc(100% - 32px)",
            margin: "16px 16px",
            padding: "12px 0",
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
          {saveLabel}
        </button>
        {onSignIn && (
          <button
            onClick={onSignIn}
            style={{
              display: "block",
              width: "100%",
              background: "transparent",
              border: "none",
              padding: "0 16px 20px",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: "rgba(35,60,0,0.5)",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            Already have an account? Sign in
          </button>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
