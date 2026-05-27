import { useState, useEffect, type CSSProperties } from "react";
import { loadCustomCategories, getRecipesForCategory, addRecipeToMenuSection, getRecipesForMenuSection, type MenuSection } from "./data";

const C = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  cardBg: "rgba(35,60,0,0.06)",
  border: "rgba(35,60,0,0.1)",
  borderLight: "rgba(35,60,0,0.08)",
  button: "#233C00",
  buttonText: "#FAF7F2",
  white: "#FAF7F2",
};

const fontSans = "'Inter', sans-serif";

const DURATION = 300;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

type View = "categories" | { category: string; label: string };

type Props = {
  menuId: string;
  section: MenuSection;
  onClose: () => void;
};

export default function RecipePicker({ menuId, section, onClose }: Props) {
  const [view, setView] = useState<View>("categories");
  const [transition, setTransition] = useState<{ from: View; to: View; direction: "forward" | "back" } | null>(null);
  const [addedInSession, setAddedInSession] = useState<Set<string>>(new Set());
  const [existingRecipeIds, setExistingRecipeIds] = useState<string[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    const loadCategories = async () => {
      const cats = await loadCustomCategories();
      setCategories(cats);
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const loadExistingRecipes = async () => {
      const recipes = await getRecipesForMenuSection(menuId, section);
      setExistingRecipeIds(recipes.map(r => r.id));
    };
    loadExistingRecipes();
  }, [menuId, section]);

  const SECTION_LABELS: Record<MenuSection, string> = {
    apps: "Apps",
    mains: "Mains",
    sides: "Sides",
    desserts: "Desserts",
    drinks: "Drinks",
  };

  const handleCategoryTap = (catKey: string, catLabel: string) => {
    const toView = { category: catKey, label: catLabel };
    setTransition({ from: view, to: toView, direction: "forward" });
    setTimeout(() => {
      setView(toView);
      setTimeout(() => setTransition(null), DURATION);
    }, 0);
  };

  const handleRecipeTap = (recipeId: string) => {
    if (existingRecipeIds.includes(recipeId)) return; // Already in section, ignore

    addRecipeToMenuSection(menuId, section, recipeId);
    setAddedInSession(prev => new Set([...prev, recipeId]));
  };

  const handleBack = () => {
    if (view !== "categories") {
      setTransition({ from: view, to: "categories", direction: "back" });
      setTimeout(() => {
        setView("categories");
        setTimeout(() => setTransition(null), DURATION);
      }, 0);
    }
  };

  // Two-phase animation system
  const transKey = transition
    ? `${viewKey(transition.from)}->${viewKey(transition.to)}:${transition.direction}`
    : null;
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const animPhase: "start" | "end" =
    transKey && armedKey !== transKey ? "start" : "end";

  useEffect(() => {
    if (!transKey) {
      if (armedKey !== null) setArmedKey(null);
      return;
    }
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => {
        if (cancelled) return;
        setArmedKey(transKey);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(r1);
      if (r2) cancelAnimationFrame(r2);
    };
  }, [transKey, armedKey]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Header */}
      <div style={{
        background: C.white,
        borderBottom: `1px solid ${C.borderLight}`,
        padding: "0 16px",
        height: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexShrink: 0,
      }}>
        {view !== "categories" ? (
          <button
            onClick={handleBack}
            aria-label="Back"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: C.text,
              display: "flex",
              alignItems: "center",
              padding: 0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
        ) : (
          <div style={{ width: 12 }} />
        )}
        <div style={{
          fontFamily: fontSans,
          fontSize: 16,
          color: C.text,
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
        }}>
          Tipsy Dinner
        </div>
        <button
          onClick={onClose}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: fontSans,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: C.text,
            padding: 0,
          }}
        >
          Done
        </button>
      </div>

      {/* Eyebrow */}
      <div style={{
        background: C.white,
        borderBottom: `1px solid ${C.borderLight}`,
        padding: "10px 16px 12px",
        flexShrink: 0,
      }}>
        <div style={{
          fontFamily: fontSans,
          fontSize: 9,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: C.textMuted,
          marginBottom: 2,
        }}>
          Adding to {SECTION_LABELS[section]}
        </div>
        <div style={{
          fontFamily: fontSans,
          fontSize: 20,
          color: C.text,
          fontWeight: 400,
        }}>
          {view === "categories" ? "Choose a category" : view.label}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: C.bg }}>
        {!transition ? (
          <ViewContent
            view={view}
            categories={categories}
            existingRecipeIds={existingRecipeIds}
            addedInSession={addedInSession}
            onCategoryTap={handleCategoryTap}
            onRecipeTap={handleRecipeTap}
          />
        ) : (
          <>
            <ViewLayer
              view={transition.from}
              categories={categories}
              existingRecipeIds={existingRecipeIds}
              addedInSession={addedInSession}
              onCategoryTap={handleCategoryTap}
              onRecipeTap={handleRecipeTap}
              transform={getTransform(transition.direction, "from", animPhase)}
              transitionStyle={animPhase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`}
              zIndex={transition.direction === "forward" ? 1 : 2}
            />
            <ViewLayer
              view={transition.to}
              categories={categories}
              existingRecipeIds={existingRecipeIds}
              addedInSession={addedInSession}
              onCategoryTap={handleCategoryTap}
              onRecipeTap={handleRecipeTap}
              transform={getTransform(transition.direction, "to", animPhase)}
              transitionStyle={animPhase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`}
              zIndex={transition.direction === "forward" ? 2 : 1}
            />
          </>
        )}
      </div>
    </div>
  );
}

// Helper functions for transition system
function viewKey(v: View): string {
  return v === "categories" ? "categories" : `recipe-list:${v.category}`;
}

function getTransform(direction: "forward" | "back", layer: "from" | "to", phase: "start" | "end"): string {
  if (direction === "forward") {
    if (layer === "from") {
      return phase === "start" ? "translateX(0)" : "translateX(-25%)";
    } else {
      return phase === "start" ? "translateX(100%)" : "translateX(0)";
    }
  } else {
    if (layer === "from") {
      return phase === "start" ? "translateX(0)" : "translateX(100%)";
    } else {
      return phase === "start" ? "translateX(-25%)" : "translateX(0)";
    }
  }
}

function renderView(
  view: View,
  categories: any[],
  existingRecipeIds: string[],
  addedInSession: Set<string>,
  onCategoryTap: (key: string, label: string) => void,
  onRecipeTap: (id: string) => void
) {
  if (view === "categories") {
    return (
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 12,
      }}>
        {categories.map((cat) => (
          <button
            key={cat.key}
            onClick={() => onCategoryTap(cat.key, cat.label)}
            style={{
              background: cat.gradient,
              border: "none",
              borderRadius: 16,
              padding: 0,
              cursor: "pointer",
              position: "relative",
              overflow: "hidden",
              aspectRatio: "1",
            }}
          >
            <div style={{
              position: "absolute",
              inset: 0,
              background: "rgba(35, 60, 0, 0.2)",
            }} />
            <div style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "rgba(255, 255, 255, 0.95)",
              textShadow: "0 1px 3px rgba(0, 0, 0, 0.3)",
            }}>
              {cat.label}
            </div>
          </button>
        ))}
      </div>
    );
  } else {
    return (
      <RecipeList
        categoryKey={view.category}
        categoryLabel={view.label}
        existingRecipeIds={existingRecipeIds}
        addedInSession={addedInSession}
        onRecipeTap={onRecipeTap}
      />
    );
  }
}

function ViewContent({
  view,
  categories,
  existingRecipeIds,
  addedInSession,
  onCategoryTap,
  onRecipeTap,
}: {
  view: View;
  categories: any[];
  existingRecipeIds: string[];
  addedInSession: Set<string>;
  onCategoryTap: (key: string, label: string) => void;
  onRecipeTap: (id: string) => void;
}) {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      background: C.bg,
    }}>
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 16px",
      }}>
        {renderView(view, categories, existingRecipeIds, addedInSession, onCategoryTap, onRecipeTap)}
      </div>
    </div>
  );
}

function ViewLayer({
  view,
  categories,
  existingRecipeIds,
  addedInSession,
  onCategoryTap,
  onRecipeTap,
  transform,
  transitionStyle,
  zIndex,
}: {
  view: View;
  categories: any[];
  existingRecipeIds: string[];
  addedInSession: Set<string>;
  onCategoryTap: (key: string, label: string) => void;
  onRecipeTap: (id: string) => void;
  transform: string;
  transitionStyle: string;
  zIndex: number;
}) {
  return (
    <div style={{
      position: "absolute",
      inset: 0,
      display: "flex",
      flexDirection: "column",
      background: C.bg,
      transform,
      transition: transitionStyle,
      zIndex,
      pointerEvents: "none",
      willChange: "transform",
    }}>
      <div style={{
        flex: 1,
        overflowY: "auto",
        padding: "20px 16px",
      }}>
        {renderView(view, categories, existingRecipeIds, addedInSession, onCategoryTap, onRecipeTap)}
      </div>
    </div>
  );
}

function RecipeList({
  categoryKey,
  categoryLabel,
  existingRecipeIds,
  addedInSession,
  onRecipeTap,
}: {
  categoryKey: string;
  categoryLabel: string;
  existingRecipeIds: string[];
  addedInSession: Set<string>;
  onRecipeTap: (id: string) => void;
}) {
  const [recipes, setRecipes] = useState<any[]>([]);

  useEffect(() => {
    const loadRecipes = async () => {
      const data = await getRecipesForCategory(categoryKey, categoryLabel);
      setRecipes(data);
    };
    loadRecipes();
  }, [categoryKey, categoryLabel]);

  if (recipes.length === 0) {
    return (
      <div style={{
        textAlign: "center",
        padding: "40px 20px",
        fontFamily: fontSans,
        fontSize: 13,
        color: C.textMuted,
        fontStyle: "italic",
      }}>
        No recipes in this category yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {recipes.filter(recipe => recipe.savedId != null).map((recipe) => {
        const recipeId = recipe.savedId!;
        const isAlreadyAdded = existingRecipeIds.includes(recipeId);
        const justAdded = addedInSession.has(recipeId);
        const disabled = isAlreadyAdded && !justAdded;

        return (
          <button
            key={recipeId}
            onClick={() => !disabled && onRecipeTap(recipeId)}
            disabled={disabled}
            style={{
              background: C.white,
              border: `1px solid ${C.borderLight}`,
              borderRadius: 14,
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: disabled ? "not-allowed" : "pointer",
              opacity: disabled ? 0.4 : 1,
              textAlign: "left",
              position: "relative",
            }}
          >
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: fontSans,
                fontSize: 15,
                fontWeight: 500,
                color: C.text,
                marginBottom: 2,
              }}>
                {recipe.title || "Untitled"}
              </div>
              <div style={{
                fontFamily: fontSans,
                fontSize: 11,
                color: C.textMuted,
                lineHeight: 1.4,
              }}>
                {recipe.description || "No description"}
              </div>
            </div>
            {justAdded && (
              <div style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: C.button,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.buttonText} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}
