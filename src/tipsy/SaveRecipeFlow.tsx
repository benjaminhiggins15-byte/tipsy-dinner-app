import { useState, useEffect, type CSSProperties } from "react";
import { loadCustomCategories } from "./data";

const C = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  textMedium: "rgba(35,60,0,0.7)",
  chipBg: "rgba(35,60,0,0.05)",
  chipBorder: "rgba(35,60,0,0.1)",
  chipSelected: "rgba(35,60,0,0.1)",
  chipBorderSelected: "rgba(35,60,0,0.35)",
  divider: "rgba(35,60,0,0.08)",
  ctaBg: "#233C00",
  ctaText: "#FAF7F2",
  handle: "rgba(35,60,0,0.15)",
};

const fontSerif = "'Fraunces', serif";
const fontSans = "'Inter', sans-serif";

type Props = {
  onClose: () => void;
  onPick: (key: string, label: string) => void;
  onNew: () => void;
  initialSelectedCategory?: { key: string; label: string } | null;
};

export default function SaveRecipeFlow({ onClose, onPick, onNew, initialSelectedCategory }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back" | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<{ key: string; label: string } | null>(initialSelectedCategory || null);
  const [allCats, setAllCats] = useState<any[]>([]);

  // Load categories on mount
  useEffect(() => {
    const loadCategories = async () => {
      const cats = await loadCustomCategories();
      setAllCats(cats);
    };
    loadCategories();
  }, []);

  // Reorder categories so the initially selected one appears first
  const cats = initialSelectedCategory
    ? [
        ...allCats.filter(c => c.key === initialSelectedCategory.key),
        ...allCats.filter(c => c.key !== initialSelectedCategory.key)
      ]
    : allCats;

  const handleCategorySelect = (key: string, label: string) => {
    setSelectedCategory({ key, label });
  };

  const handleSave = () => {
    if (!selectedCategory) return;
    onPick(selectedCategory.key, selectedCategory.label);
    setSlideDirection("forward");
    setTimeout(() => setStep(2), 0);
  };

  // Container style for slide animation
  const getStepStyle = (currentStep: number): CSSProperties => {
    if (step !== currentStep) {
      return { display: "none" };
    }

    const baseStyle: CSSProperties = {
      animation: slideDirection === "forward"
        ? "slide-in-left 300ms cubic-bezier(0.4, 0, 0.2, 1)"
        : slideDirection === "back"
        ? "slide-in-right 300ms cubic-bezier(0.4, 0, 0.2, 1)"
        : "none",
    };

    return baseStyle;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(35, 60, 0, 0.08)",
        zIndex: 80,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "tipsy-fade 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.bg,
          borderRadius: "24px 24px 0 0",
          padding: "16px 0 24px",
          width: "100%",
          maxHeight: "80vh",
          animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ width: 36, height: 4, borderRadius: 2, background: C.handle, margin: "0 auto 14px" }} />

        <div style={getStepStyle(1)}>
          {step === 1 && (
            <SaveStep1
              cats={cats}
              selectedCategory={selectedCategory}
              onSelectCategory={handleCategorySelect}
              onNew={onNew}
              onSave={handleSave}
            />
          )}
        </div>

        <div style={getStepStyle(2)}>
          {step === 2 && (
            <SaveStep2
              categoryLabel={selectedCategory?.label || ""}
              onDone={onClose}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slide-in-left { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slide-in-right { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

function SaveStep1({ cats, selectedCategory, onSelectCategory, onNew, onSave }: {
  cats: any[];
  selectedCategory: { key: string; label: string } | null;
  onSelectCategory: (key: string, label: string) => void;
  onNew: () => void;
  onSave: () => void;
}) {
  return (
    <>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.text }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.chipBorder }} />
      </div>

      <div style={{ padding: "0 18px 14px", borderBottom: `1px solid ${C.divider}` }}>
        <div style={{ fontFamily: fontSans, fontSize: 11, fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>Pick a category</div>
        <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 13, color: C.text }}>Swipe to find the right category.</div>
      </div>

      <div style={{ overflowX: "auto", padding: "14px 18px 4px", display: "flex", gap: 10, scrollbarWidth: "none" }}>
        <button
          onClick={onNew}
          style={{
            flexShrink: 0, width: 96, cursor: "pointer",
            background: "none", padding: 0, textAlign: "left", border: "none",
          }}
        >
          <div style={{
            width: 96, height: 70, borderRadius: 12,
            background: C.chipBg, border: `1px solid ${C.chipBorder}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.textLight, fontSize: 32, fontWeight: 300, lineHeight: 1,
            boxSizing: "border-box",
          }}>+</div>
          <div style={{ fontFamily: fontSans, fontSize: 11, fontWeight: 500, color: C.text, padding: "6px 4px 2px" }}>New category</div>
        </button>
        {cats.map((c) => {
          const isSelected = selectedCategory?.key === c.key;

          const cardStyle = isSelected
            ? {
                width: 96, height: 70, position: "relative" as const,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "rgba(35,60,0,0.1)",
              }
            : {
                width: 96, height: 70, position: "relative" as const,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.gradient,
              };

          return (
            <button
              key={c.key}
              onClick={() => onSelectCategory(c.key, c.label)}
              style={{
                flexShrink: 0, width: 96, cursor: "pointer",
                borderRadius: 12, overflow: "hidden",
                border: isSelected ? "1px solid rgba(35,60,0,0.35)" : "2px solid transparent",
                background: "none", padding: 0, textAlign: "left",
              }}
            >
              <div style={cardStyle}>
                {!isSelected && <div style={{ position: "absolute", inset: 0, background: "rgba(35, 60, 0, 0.15)" }} />}
                <div style={{
                  position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center",
                  fontFamily: fontSans, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: isSelected ? "#233C00" : "rgba(255,255,255,0.95)",
                  textShadow: isSelected ? "none" : "0 1px 3px rgba(0,0,0,0.3)",
                }}>{c.label}</div>
              </div>
              <div style={{ fontFamily: fontSans, fontSize: 11, fontWeight: 500, color: C.text, padding: "6px 4px 2px" }}>{c.label}</div>
            </button>
          );
        })}
      </div>

      {/* Save button */}
      <button
        onClick={selectedCategory ? onSave : undefined}
        style={{
          width: "calc(100% - 36px)",
          margin: "20px 18px 0",
          padding: "14px",
          background: "#233C00",
          border: "none",
          borderRadius: 14,
          color: "#FAF7F2",
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 500,
          textTransform: "none",
          letterSpacing: "0.02em",
          cursor: selectedCategory ? "pointer" : "not-allowed",
          opacity: selectedCategory ? 1 : 0.4,
          pointerEvents: selectedCategory ? "auto" : "none",
        }}
      >
        Save
      </button>
    </>
  );
}

function SaveStep2({ categoryLabel, onDone }: {
  categoryLabel: string;
  onDone: () => void;
}) {
  return (
    <div style={{ padding: "40px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/* Checkmark */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: C.chipBg,
        border: `2px solid ${C.chipBorder}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.text} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      {/* Success message */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: fontSerif,
          fontStyle: "italic",
          fontSize: 18,
          color: C.text,
          marginBottom: 6,
        }}>
          Saved to {categoryLabel}
        </div>
      </div>

      {/* Done button */}
      <button
        onClick={onDone}
        style={{
          padding: "14px 32px",
          background: C.ctaBg,
          color: C.ctaText,
          border: "none",
          borderRadius: 14,
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 500,
          textTransform: "lowercase",
          letterSpacing: "0.02em",
          cursor: "pointer",
          marginTop: 8,
        }}
      >
        done
      </button>
    </div>
  );
}
