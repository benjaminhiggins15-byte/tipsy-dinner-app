import { useEffect, useState, type ReactElement } from "react";
import { listMyPlans } from "./data";

const FONT_SANS = "'Inter', sans-serif";
const FONT_SERIF_ITALIC = "'Fraunces', serif";
const FOREST = "#233C00";
const CREAM = "#FEE7C0";
const CARD_BG = "rgba(35,60,0,0.05)";
const CARD_BORDER = "rgba(35,60,0,0.1)";
// Matches Home.tsx's own C.textLight token — Home doesn't export its color
// object, so this is restated rather than imported.
const MUTED_TEXT = "rgba(35,60,0,0.6)";

function RecipeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FOREST} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <line x1="8.5" y1="8" x2="15.5" y2="8" />
      <line x1="8.5" y1="12" x2="15.5" y2="12" />
      <line x1="8.5" y1="16" x2="13" y2="16" />
    </svg>
  );
}

function DishIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FOREST} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FOREST} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="7" x2="19" y2="7" />
      <line x1="5" y1="12" x2="19" y2="12" />
      <line x1="5" y1="17" x2="14" y2="17" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={CREAM} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="4,13 9,18 20,6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={FOREST} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9,5 16,12 9,19" />
    </svg>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  // Present only when opened from a recipe screen, where Recipe arrives
  // already selected for that specific recipe.
  preselectedRecipeTitle?: string;
  onPickRecipe: () => void;
  onPickDish: () => void;
  onPickMenu: () => void;
  onStartFromSaved: () => void;
};

export default function LogCookTypePicker({
  open,
  onClose,
  preselectedRecipeTitle,
  onPickRecipe,
  onPickDish,
  onPickMenu,
  onStartFromSaved,
}: Props) {
  const [hasPlans, setHasPlans] = useState(false);

  useEffect(() => {
    if (!open) return;
    let ignore = false;
    (async () => {
      const plans = await listMyPlans();
      if (ignore) return;
      setHasPlans(plans.length > 0);
    })();
    return () => {
      ignore = true;
    };
  }, [open]);

  if (!open) return null;

  const cards: {
    key: "recipe" | "dish" | "menu";
    icon: ReactElement;
    name: string;
    line: string;
    onClick: () => void;
    preselected: boolean;
  }[] = [
    {
      key: "recipe",
      icon: <RecipeIcon />,
      name: "Recipe",
      line: "One recipe, just as you made it.",
      onClick: onPickRecipe,
      preselected: !!preselectedRecipeTitle,
    },
    {
      key: "dish",
      icon: <DishIcon />,
      name: "Dish",
      line: "One plate: a few of your recipes, plus anything else.",
      onClick: onPickDish,
      preselected: false,
    },
    {
      key: "menu",
      icon: <MenuIcon />,
      name: "Menu",
      line: "A whole meal, course by course.",
      onClick: onPickMenu,
      preselected: false,
    },
  ];

  return (
    <>
      <style>{`
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 64, // nav-bar clearance — anchor to the real viewport, not the padded screen layer (see ScreenStage)
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
            background: "#FAF7F2",
            borderRadius: "28px 28px 0 0",
            width: "100%",
            maxHeight: "85vh",
            display: "flex",
            flexDirection: "column",
            animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          }}
        >
          <div style={{ overflowY: "auto", minHeight: 0, flex: "1 1 auto", padding: "16px 20px 24px" }}>
            {/* Handle */}
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(35,60,0,0.15)", margin: "0 auto 20px" }} />

            {/* Title */}
            <div
              style={{
                fontFamily: FONT_SANS,
                fontSize: 15,
                fontWeight: 700,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: FOREST,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              What did you make?
            </div>

            {cards.map((card) => (
              <button
                key={card.key}
                onClick={card.onClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: "100%",
                  textAlign: "left",
                  padding: 18,
                  borderRadius: 22,
                  background: CARD_BG,
                  border: card.preselected ? `2px solid ${FOREST}` : `1px solid ${CARD_BORDER}`,
                  marginBottom: 12,
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    minWidth: 44,
                    borderRadius: 14,
                    background: "rgba(35,60,0,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  {card.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 15, color: FOREST }}>
                      {card.name}
                    </span>
                    {card.preselected && preselectedRecipeTitle && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          padding: "3px 8px",
                          borderRadius: 999,
                          background: FOREST,
                          color: CREAM,
                          fontFamily: FONT_SANS,
                          fontSize: 10,
                          fontWeight: 600,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          maxWidth: "100%",
                        }}
                      >
                        <CheckIcon />
                        {preselectedRecipeTitle}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_SERIF_ITALIC,
                      fontStyle: "italic",
                      fontSize: 13,
                      color: MUTED_TEXT,
                      marginTop: 2,
                    }}
                  >
                    {card.line}
                  </div>
                </div>
              </button>
            ))}

            {hasPlans && (
              <button
                onClick={onStartFromSaved}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                  padding: "8px 0 4px",
                  fontFamily: FONT_SERIF_ITALIC,
                  fontStyle: "italic",
                  fontSize: 14,
                  color: FOREST,
                  textDecoration: "underline",
                }}
              >
                Start from a saved dish or menu
                <ChevronIcon />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
