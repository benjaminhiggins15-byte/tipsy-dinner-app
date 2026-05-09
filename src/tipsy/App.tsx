import { useState, useRef, useEffect, type CSSProperties } from "react";
import { getAllCategories, getRecipesForCategory, loadCustomCategories, saveRecipe, type Recipe } from "./data";
import AddYourOwn from "./AddYourOwn";
import NewCategory from "./NewCategory";
import Onboarding from "./Onboarding";
import Profile, { ProfileEdit, Avatar } from "./Profile";
import Anthropic from "@anthropic-ai/sdk";

type RecipeDraft = {
  title: string;
  description: string;
  ingredients: { name: string; qty: string }[];
  steps: string[];
};

type Screen =
  | { name: "home" }
  | { name: "categories" }
  | { name: "recipes"; categoryKey: string; categoryLabel: string }
  | { name: "recipe"; recipe: Recipe; categoryLabel: string }
  | { name: "cook" }
  | { name: "addown"; editRecipe?: Recipe; editCategoryLabel?: string; draft?: RecipeDraft & { trayOpen?: boolean } }
  | { name: "newcategory" }
  | { name: "newcategoryforrecipe"; draft: RecipeDraft }
  | { name: "editcategory"; categoryKey: string }
  | { name: "profile" }
  | { name: "profileedit"; fieldKey: "name" | "email" | "palate" | "inspiration" | "table" | "constraints" }
  | { name: "placeholder"; title: string };

const S: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#D8E8F2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px 12px",
  },
  phone: {
    width: 320,
    height: 640,
    background: "#EEF4F8",
    borderRadius: 32,
    border: "0.5px solid #B5D4F4",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    boxShadow: "0 20px 60px rgba(4,44,83,0.12)",
    position: "relative",
  },
};

const DURATION = 300;
const EASE = "cubic-bezier(0.4, 0, 0.2, 1)";

function screenKey(s: Screen): string {
  switch (s.name) {
    case "home": return "home";
    case "categories": return "categories";
    case "recipes": return `recipes:${s.categoryKey}`;
    case "recipe": return `recipe:${s.categoryLabel}:${s.recipe.title}`;
    case "cook": return "cook";
    case "addown": return s.editRecipe?.savedId ? `addown:edit:${s.editRecipe.savedId}` : "addown";
    case "newcategory": return "newcategory";
    case "newcategoryforrecipe": return "newcategoryforrecipe";
    case "editcategory": return `editcategory:${s.categoryKey}`;
    case "profile": return "profile";
    case "profileedit": return `profileedit:${s.fieldKey}`;
    case "placeholder": return `placeholder:${s.title}`;
  }
}

function renderScreen(
  s: Screen,
  push: (s: Screen) => void,
  back: () => void,
  replaceRecipe?: (r: Recipe, label: string) => void,
  finishEditCategory?: (newLabel: string) => void,
  finishDeleteCategory?: () => void,
  finishDeleteRecipe?: () => void,
  finishCreateCategoryForRecipe?: (catKey: string, catLabel: string, draft: RecipeDraft) => void,
  finishSaveRecipe?: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void,
) {
  switch (s.name) {
    case "home": return <Home push={push} />;
    case "categories": return <Categories push={push} back={back} />;
    case "recipes": return (
      <Recipes
        categoryKey={s.categoryKey}
        categoryLabel={s.categoryLabel}
        push={push}
        back={back}
      />
    );
    case "recipe": return (
      <RecipeCard
        recipe={s.recipe}
        categoryLabel={s.categoryLabel}
        back={back}
        push={push}
      />
    );
    case "cook": return (
      <Cook
        back={back}
        push={push}
        finishSaveRecipe={(r, k, l) => finishSaveRecipe?.(r, k, l)}
      />
    );
    case "addown": return (
      <AddYourOwn
        back={back}
        goCategories={() => push({ name: "categories" })}
        goRecipe={(recipe, categoryKey, categoryLabel) => finishSaveRecipe?.(recipe, categoryKey, categoryLabel)}
        editRecipe={s.editRecipe}
        editCategoryLabel={s.editCategoryLabel}
        onSaveEdit={(updated, label) => replaceRecipe?.(updated, label)}
        onDeleted={() => finishDeleteRecipe?.()}
        initialDraft={s.draft ? { ...s.draft, step: 4, trayOpen: s.draft.trayOpen } : undefined}
        onCreateCategoryForRecipe={(payload) => push({ name: "newcategoryforrecipe", draft: payload })}
      />
    );
    case "newcategory": return <NewCategory back={back} onSaved={back} />;
    case "newcategoryforrecipe": return (
      <NewCategory
        back={back}
        onSaved={(cat) => {
          if (cat) finishCreateCategoryForRecipe?.(cat.key, cat.label, s.draft);
        }}
      />
    );
    case "editcategory": return (
      <NewCategory
        back={back}
        onSaved={back}
        editKey={s.categoryKey}
        onEditSaved={(newLabel) => finishEditCategory?.(newLabel)}
        onDeleted={() => finishDeleteCategory?.()}
      />
    );
    case "profile": return <Profile back={back} openEdit={(k) => push({ name: "profileedit", fieldKey: k })} />;
    case "profileedit": return <ProfileEdit fieldKey={s.fieldKey} back={back} />;
    case "placeholder": return <Placeholder title={s.title} back={back} />;
  }
}

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const current = stack[stack.length - 1];
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      setShowOnboarding(localStorage.getItem("tipsyDinnerOnboardingComplete") !== "true");
    } catch {
      setShowOnboarding(false);
    }
  }, []);
  const [transition, setTransition] = useState<{
    from: Screen;
    to: Screen;
    direction: "forward" | "back";
  } | null>(null);

  const push = (s: Screen) => {
    if (transition) return;
    // Special-case: when leaving addown to create a new category for the
    // in-progress recipe, persist the draft + tray state on the addown screen
    // beneath so back navigation restores it.
    if (s.name === "newcategoryforrecipe" && current.name === "addown") {
      const updatedAddown: Screen = { ...current, draft: { ...s.draft, trayOpen: true } };
      setTransition({ from: current, to: s, direction: "forward" });
      setStack((st) => {
        const next = st.slice();
        next[next.length - 1] = updatedAddown;
        next.push(s);
        return next;
      });
      return;
    }
    // When leaving the Cook screen to create a new category for an
    // AI-generated recipe, just push — the Cook screen will be wiped from the
    // back stack on save anyway.
    setTransition({ from: current, to: s, direction: "forward" });
    setStack((st) => [...st, s]);
  };
  const back = () => {
    if (transition) return;
    if (stack.length <= 1) return;
    const prev = stack[stack.length - 2];
    setTransition({ from: current, to: prev, direction: "back" });
    setStack((st) => st.slice(0, -1));
  };
  // Pop the current addown screen AND replace the recipe screen below
  // with the updated recipe data, then animate back to it.
  const replaceRecipeAndBack = (updated: Recipe, categoryLabel: string) => {
    if (transition) return;
    if (stack.length < 2) return;
    const prevIdx = stack.length - 2;
    const prev = stack[prevIdx];
    if (prev.name !== "recipe") {
      back();
      return;
    }
    const newPrev: Screen = { name: "recipe", recipe: updated, categoryLabel };
    setTransition({ from: current, to: newPrev, direction: "back" });
    setStack((st) => {
      const next = st.slice(0, -1);
      next[next.length - 1] = newPrev;
      return next;
    });
  };

  // Pop the editcategory screen and replace the recipes screen below with the
  // new label, animating back to it.
  const finishEditCategory = (newLabel: string) => {
    if (transition) return;
    if (stack.length < 2) return;
    const prev = stack[stack.length - 2];
    if (prev.name !== "recipes") {
      back();
      return;
    }
    const newPrev: Screen = { name: "recipes", categoryKey: prev.categoryKey, categoryLabel: newLabel };
    setTransition({ from: current, to: newPrev, direction: "back" });
    setStack((st) => {
      const next = st.slice(0, -1);
      next[next.length - 1] = newPrev;
      return next;
    });
  };

  // Pop both the editcategory and the recipes screens, animating back to
  // categories (which sits below recipes in the stack).
  const finishDeleteCategory = () => {
    if (transition) return;
    // Find the nearest "categories" screen below current; fall back to back().
    const idx = (() => {
      for (let i = stack.length - 2; i >= 0; i--) {
        if (stack[i].name === "categories") return i;
      }
      return -1;
    })();
    if (idx === -1) {
      back();
      return;
    }
    const target = stack[idx];
    setTransition({ from: current, to: target, direction: "back" });
    setStack((st) => st.slice(0, idx + 1));
  };

  // Pop the addown (edit) screen and the recipe screen, animating back to
  // the recipes list (which sits below the recipe screen in the stack).
  const finishDeleteRecipe = () => {
    if (transition) return;
    const idx = (() => {
      for (let i = stack.length - 2; i >= 0; i--) {
        if (stack[i].name === "recipes") return i;
      }
      return -1;
    })();
    if (idx === -1) {
      back();
      return;
    }
    const target = stack[idx];
    setTransition({ from: current, to: target, direction: "back" });
    setStack((st) => st.slice(0, idx + 1));
  };

  // Save the in-progress recipe under the freshly created category and
  // navigate directly to the recipe card. Replace both the newcategoryforrecipe
  // screen and the addown screen beneath with: recipes list + recipe card.
  const finishCreateCategoryForRecipe = (catKey: string, catLabel: string, draft: RecipeDraft) => {
    if (transition) return;
    saveRecipe({
      id: Date.now(),
      title: draft.title,
      description: draft.description,
      category: catKey,
      ingredients: draft.ingredients,
      steps: draft.steps,
      createdAt: new Date().toISOString(),
    });
    const recipe: Recipe = {
      title: draft.title,
      description: draft.description,
      color: "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
      category: catLabel.toLowerCase(),
      ingredients: draft.ingredients,
      steps: draft.steps,
      categoryKey: catKey,
    };
    finishSaveRecipe(recipe, catKey, catLabel);
  };

  // After a recipe is saved (existing or new category), rebuild the back
  // stack to follow the Browse hierarchy: home → categories → recipes → recipe.
  // The Cook and Add Your Own screens are removed entirely.
  const finishSaveRecipe = (recipe: Recipe, categoryKey: string, categoryLabel: string) => {
    if (transition) return;
    const target: Screen = { name: "recipe", recipe, categoryLabel };
    const newStack: Screen[] = [
      { name: "home" },
      { name: "categories" },
      { name: "recipes", categoryKey, categoryLabel },
      target,
    ];
    setTransition({ from: current, to: target, direction: "forward" });
    setStack(newStack);
  };

  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), DURATION);
    return () => clearTimeout(t);
  }, [transition]);

  return (
    <div style={S.page}>
      <div style={S.phone}>
        {showOnboarding === null ? null : showOnboarding ? (
          <Onboarding onComplete={() => setShowOnboarding(false)} />
        ) : (
        <ScreenStage
          current={current}
          transition={transition}
          push={push}
          back={back}
          replaceRecipe={replaceRecipeAndBack}
          finishEditCategory={finishEditCategory}
          finishDeleteCategory={finishDeleteCategory}
          finishDeleteRecipe={finishDeleteRecipe}
          finishCreateCategoryForRecipe={finishCreateCategoryForRecipe}
          finishSaveRecipe={finishSaveRecipe}
        />
        )}
      </div>
      <button
        onClick={() => {
          try { localStorage.removeItem("tipsyDinnerOnboardingComplete"); } catch { /* noop */ }
          setStack([{ name: "home" }]);
          setShowOnboarding(true);
        }}
        style={{
          position: "fixed",
          bottom: 12,
          right: 12,
          zIndex: 9999,
          background: "rgba(12,68,124,0.85)",
          color: "#EEF4F8",
          border: "none",
          borderRadius: 100,
          padding: "6px 12px",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 10,
          fontWeight: 500,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          cursor: "pointer",
          opacity: 0.7,
        }}
      >
        Reset onboarding
      </button>
    </div>
  );
}

function ScreenStage({
  current,
  transition,
  push,
  back,
  replaceRecipe,
  finishEditCategory,
  finishDeleteCategory,
  finishDeleteRecipe,
  finishCreateCategoryForRecipe,
  finishSaveRecipe,
}: {
  current: Screen;
  transition: { from: Screen; to: Screen; direction: "forward" | "back" } | null;
  push: (s: Screen) => void;
  back: () => void;
  replaceRecipe: (r: Recipe, label: string) => void;
  finishEditCategory: (newLabel: string) => void;
  finishDeleteCategory: () => void;
  finishDeleteRecipe: () => void;
  finishCreateCategoryForRecipe: (catKey: string, catLabel: string, draft: RecipeDraft) => void;
  finishSaveRecipe: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void;
}) {
  // Trigger animation on mount of incoming layer.
  // Phase is derived from state: when a new transition starts, phase begins as
  // "start" (renders incoming offscreen with NO css transition). After the
  // browser paints that frame, we flip to "end" so the CSS transition runs.
  const transKey = transition
    ? `${screenKey(transition.from)}->${screenKey(transition.to)}:${transition.direction}`
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
    // Two RAFs to guarantee the browser paints the "start" frame first.
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

  const layerBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    height: "100%",
    display: "flex",
    flexDirection: "column",
    background: "#EEF4F8",
    willChange: "transform",
  };

  if (!transition) {
    return (
      <div style={{ ...layerBase, position: "relative", height: "100%" }}>
        {renderScreen(current, push, back, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe)}
      </div>
    );
  }

  // During transition: render two layers
  const { from, to, direction } = transition;

  // Forward: incoming (to) slides from right (100%) -> 0; outgoing (from) stays at 0 (or shifts slightly left)
  // Back: outgoing (from) slides 0 -> right (100%); incoming (to) sits underneath at 0
  let fromTransform = "translateX(0)";
  let toTransform = "translateX(0)";

  if (direction === "forward") {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(-25%)";
    toTransform = animPhase === "start" ? "translateX(100%)" : "translateX(0)";
  } else {
    fromTransform = animPhase === "start" ? "translateX(0)" : "translateX(100%)";
    toTransform = animPhase === "start" ? "translateX(-25%)" : "translateX(0)";
  }

  // No transition on the "start" frame — only after we've armed.
  const transitionStyle =
    animPhase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;

  // Stacking: forward -> incoming on top; back -> outgoing on top
  const fromZ = direction === "forward" ? 1 : 2;
  const toZ = direction === "forward" ? 2 : 1;

  // Outgoing layer should not capture clicks during animation
  return (
    <>
      <div style={{ ...layerBase, transform: fromTransform, transition: transitionStyle, zIndex: fromZ, pointerEvents: "none" }}>
        {renderScreen(from, push, back, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe)}
      </div>
      <div style={{ ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: toZ, pointerEvents: "none" }}>
        {renderScreen(to, push, back, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe, finishSaveRecipe)}
      </div>
    </>
  );
}

/* ---------------- Home ---------------- */
function Home({ push }: { push: (s: Screen) => void }) {
  const items = [
    { label: "craft", sub: "your next dish", action: () => push({ name: "cook" }) },
    { label: "explore", sub: "your recipes", action: () => push({ name: "categories" }) },
    { label: "curate", sub: "your menus", action: () => push({ name: "placeholder", title: "Curate" }) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 5 }}>
        <Avatar onClick={() => push({ name: "profile" })} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px 16px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#185FA5", textTransform: "uppercase", marginBottom: 16 }}>
          welcome back
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 400, color: "#042C53", letterSpacing: "-0.5px", lineHeight: 1.1, textAlign: "center" }}>
          Tipsy<br />Dinner
        </div>
        <div style={{ width: 32, height: 1, background: "#85B7EB", margin: "20px 0" }} />
        <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 16, fontWeight: 400, color: "#185FA5", textAlign: "center", lineHeight: 1.2 }}>
          what are we making tonight?
        </div>
      </div>
      <div style={{ padding: "0 24px 64px" }}>
        {items.map((b, i) => (
          <button
            key={b.label}
            onClick={b.action}
            style={{
              width: "100%",
              padding: "12px 0",
              background: "transparent",
              border: "none",
              borderTop: "0.5px solid #85B7EB",
              borderBottom: i === items.length - 1 ? "0.5px solid #85B7EB" : "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, letterSpacing: "0.12em", color: "#042C53", textTransform: "uppercase" }}>
                {b.label}
              </span>
              <span style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 13, color: "#185FA5", lineHeight: 1.2 }}>
                {b.sub}
              </span>
            </div>
            <span style={{ color: "#85B7EB", fontSize: 18, lineHeight: 1 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Categories ---------------- */
function Categories({ push, back }: { push: (s: Screen) => void; back: () => void }) {
  const cats = getAllCategories();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "32px 24px 16px", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button
              onClick={back}
              aria-label="Back"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}
            >
              <BackArrow />
            </button>
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400, color: "#042C53" }}>
            Explore
          </div>
        </div>
        <button
          onClick={() => push({ name: "newcategory" })}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "6px 12px",
            background: "#E6F1FB",
            border: "0.5px solid #85B7EB",
            borderRadius: 999,
            color: "#185FA5",
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            letterSpacing: "0.08em",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          New
        </button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        {cats.length === 0 ? (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "48px 16px",
          }}>
            <p style={{
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: "#185FA5", margin: 0, textAlign: "center",
            }}>
              Add your first category to get started.
            </p>
          </div>
        ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {cats.map((c) => (
            <div
              key={c.key}
              onClick={() => push({ name: "recipes", categoryKey: c.key, categoryLabel: c.label })}
              style={{
                position: "relative",
                borderRadius: 16,
                overflow: "hidden",
                aspectRatio: "1 / 1",
                cursor: "pointer",
                background: c.gradient,
              }}
            >
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(4,44,83,0.8) 0%, rgba(4,44,83,0.05) 55%)" }} />
              <p style={{ position: "absolute", bottom: 14, left: 14, fontFamily: "'Playfair Display', serif", fontSize: 17, color: "#fff", margin: 0 }}>
                {c.label}
              </p>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Recipes List ---------------- */
function Recipes({
  categoryKey,
  categoryLabel,
  push,
  back,
}: {
  categoryKey: string;
  categoryLabel: string;
  push: (s: Screen) => void;
  back: () => void;
}) {
  const recipes = getRecipesForCategory(categoryKey, categoryLabel);
  const isCustom = categoryKey.startsWith("custom-");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "32px 24px 14px", flexShrink: 0, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button
              onClick={back}
              aria-label="Back"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}
            >
              <BackArrow />
            </button>
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400, color: "#042C53" }}>
            {categoryLabel}
          </div>
        </div>
        {isCustom && (
          <button
            onClick={() => push({ name: "editcategory", categoryKey })}
            aria-label="Edit category"
            style={{
              width: 32, height: 32,
              background: "rgba(238,244,248,0.85)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", border: "none", color: "#042C53",
              marginTop: 4, flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 8 }}>
        {recipes.map((r, i) => (
          <div
            key={i}
            onClick={() => push({ name: "recipe", recipe: r, categoryLabel })}
            style={{
              background: "#E6F1FB",
              border: "0.5px solid #85B7EB",
              borderRadius: 12,
              display: "flex",
              overflow: "hidden",
              cursor: "pointer",
              height: 80,
              flexShrink: 0,
            }}
          >
            <div style={{ flex: 1, padding: "14px 12px", display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0 }}>
              <p style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#042C53", margin: "0 0 5px", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.title}
              </p>
              <p style={{
                fontSize: 11, color: "#185FA5", margin: 0, lineHeight: 1.45,
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
              } as CSSProperties}>
                {r.description}
              </p>
            </div>
            <div style={{ width: 80, flexShrink: 0, background: r.color }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Recipe Card ---------------- */
function RecipeCard({
  recipe,
  categoryLabel,
  back,
  push,
}: {
  recipe: Recipe;
  categoryLabel: string;
  back: () => void;
  push: (s: Screen) => void;
}) {
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  const editable = typeof recipe.savedId === "number";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{
        width: "100%", height: 200,
        background: "linear-gradient(160deg, #C8DFF0 0%, #A8C5DC 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, position: "relative",
      }}>
        <button
          onClick={back}
          aria-label="Back"
          style={{
            position: "absolute", top: 16, left: 16, width: 32, height: 32,
            background: "rgba(238,244,248,0.85)", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", border: "none", color: "#042C53",
          }}
        >
          <BackArrow />
        </button>
        {editable && (
          <button
            onClick={() => push({ name: "addown", editRecipe: recipe, editCategoryLabel: categoryLabel })}
            aria-label="Edit"
            style={{
              position: "absolute", top: 16, right: 16, width: 32, height: 32,
              background: "rgba(238,244,248,0.85)", borderRadius: "50%",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", border: "none", color: "#042C53",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        )}
        <p style={{ fontSize: 11, letterSpacing: "0.12em", color: "#185FA5", textTransform: "uppercase", opacity: 0.7, margin: 0 }}>
          photo coming soon
        </p>
      </div>

      <div style={{ padding: "20px 24px 16px", flexShrink: 0, borderBottom: "0.5px solid #85B7EB" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.14em", color: "#185FA5", textTransform: "uppercase", marginBottom: 6 }}>
          {recipe.category}
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 400, color: "#042C53", marginBottom: 8, lineHeight: 1.2 }}>
          {recipe.title}
        </div>
        <div style={{ fontSize: 13, color: "#185FA5", lineHeight: 1.5 }}>
          {recipe.description}
        </div>
        {recipe.yield && (
          <div style={{ fontSize: 11, letterSpacing: "0.08em", color: "#85B7EB", marginTop: 10 }}>
            {recipe.yield}
          </div>
        )}
      </div>

      <div style={{ display: "flex", borderBottom: "0.5px solid #85B7EB", flexShrink: 0 }}>
        <TabButton active={tab === "ingredients"} onClick={() => setTab("ingredients")}>Ingredients</TabButton>
        <TabButton active={tab === "steps"} onClick={() => setTab("steps")} withBorder>Steps</TabButton>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
        {tab === "ingredients" && ingredients.map((i, idx) => (
          <div key={idx} style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            borderBottom: idx === ingredients.length - 1 ? "none" : "0.5px solid #B5D4F4",
            paddingBottom: 10, marginBottom: idx === ingredients.length - 1 ? 0 : 12,
          }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 15, color: "#042C53" }}>{i.name}</span>
            <span style={{ fontSize: 12, color: "#185FA5", whiteSpace: "nowrap", marginLeft: 12 }}>{i.qty}</span>
          </div>
        ))}
        {tab === "ingredients" && ingredients.length === 0 && (
          <p style={{ fontSize: 13, color: "#185FA5" }}>No ingredients yet.</p>
        )}
        {tab === "steps" && steps.map((s, idx) => (
          <div key={idx} style={{
            display: "flex", gap: 14, alignItems: "flex-start",
            marginBottom: idx === steps.length - 1 ? 0 : 16,
          }}>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: "#85B7EB", flexShrink: 0, lineHeight: 1.4 }}>
              {idx + 1}
            </span>
            <p style={{ fontSize: 14, color: "#042C53", lineHeight: 1.6, margin: 0 }}>{s}</p>
          </div>
        ))}
        {tab === "steps" && steps.length === 0 && (
          <p style={{ fontSize: 13, color: "#185FA5" }}>No steps yet.</p>
        )}
      </div>
    </div>
  );
}

function TabButton({ active, onClick, withBorder, children }: { active: boolean; onClick: () => void; withBorder?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: 12, border: "none", cursor: "pointer",
        fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase",
        fontWeight: 500, fontFamily: "'DM Sans', sans-serif",
        background: active ? "#0C447C" : "#E6F1FB",
        color: active ? "#E6F1FB" : "#185FA5",
        borderLeft: withBorder ? "0.5px solid #85B7EB" : undefined,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- Placeholder ---------------- */
function Placeholder({ title, back }: { title: string; back: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "32px 24px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button onClick={back} aria-label="Back" style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}>
            <BackArrow />
          </button>
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400, color: "#042C53" }}>
          {title}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, flexDirection: "column", gap: 16 }}>
        <div style={{ width: 32, height: 1, background: "#85B7EB" }} />
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#042C53", textAlign: "center" }}>
          coming soon
        </div>
        <div style={{ fontSize: 12, color: "#185FA5", letterSpacing: "0.04em" }}>
          we're still simmering this one.
        </div>
      </div>
    </div>
  );
}

function BackArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

/* ---------------- Cook ---------------- */
function Cook({ back, push, finishSaveRecipe }: {
  back: () => void;
  push: (s: Screen) => void;
  finishSaveRecipe: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void;
}) {
  type Msg = { id: number; role: "user" | "ai"; text: string };

  const [trayOpen, setTrayOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [recipeRevealed, setRecipeRevealed] = useState(false);
  const [miniBarVisible, setMiniBarVisible] = useState(false);
  const [miniTitleVisible, setMiniTitleVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [generatingRecipe, setGeneratingRecipe] = useState(false);
  const [currentRecipe, setCurrentRecipe] = useState<{
    title: string;
    description: string;
    ingredients: { name: string; qty: string }[];
    steps: string[];
  } | null>(null);
  const [conversationHistory, setConversationHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const [bottomBarHeight, setBottomBarHeight] = useState(0);
  const idRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const measure = () => {
      if (bottomBarRef.current) setBottomBarHeight(bottomBarRef.current.offsetHeight);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [recipeRevealed]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, typing, miniBarVisible]);

  const sendMessage = async () => {
    if (!input.trim() || typing) return;

    const userText = input.trim();
    const userMsg: Msg = { id: ++idRef.current, role: "user", text: userText };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setTyping(true);
    setGeneratingRecipe(false);

    // Add user message to conversation history
    const updatedHistory = [...conversationHistory, { role: "user" as const, content: userText }];
    setConversationHistory(updatedHistory);

    // Load user profile from localStorage
    const palate = typeof window !== "undefined" ? localStorage.getItem("tipsyDinnerPalate") || "" : "";
    const inspiration = typeof window !== "undefined" ? localStorage.getItem("tipsyDinnerInspiration") || "" : "";
    const constraints = typeof window !== "undefined" ? localStorage.getItem("tipsyDinnerConstraints") || "" : "";

    try {
      console.log("Calling Anthropic API...");

      // Initialize Anthropic client
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("API key not found");
      }

      const anthropic = new Anthropic({
        apiKey,
        dangerouslyAllowBrowser: true,
      });

      // Build system prompt
      const systemPrompt = `You are the cooking brain inside Tipsy Dinner, a personal digital cookbook for an elevated home cook. You are not a general assistant. You only discuss food, cooking, technique, ingredients, menus, wine, drinks, and anything directly related to planning and executing a meal. If someone asks you something outside that scope, acknowledge it briefly and bring the conversation back to food.

Your job is to help the user cook better, eat better, and feel more confident in the kitchen. Think of yourself as a knowledgeable friend who happens to have serious culinary range — someone who reads Bon Appétit, has strong opinions about pasta water, and knows when to reach for anchovy and when to leave it out.

VOICE AND TONE

Be direct. Lead with the answer, not a preamble. Never use emojis. Never use markdown formatting in conversational prose — no asterisks, no bullet symbols, no headers with pound signs. Exception: when presenting multiple dish options, use a numbered list with the dish name in bold followed by a one-sentence description. Write steps in clean numbered prose.

Be warm but not effusive. Confident but not stiff. You have opinions — share them when they are useful, but do not lecture. If something is a better call, say so and briefly say why. If the user disagrees, engage honestly. You do not need to capitulate, but you do not need to dig in either. Acknowledge the feedback and adjust if it makes sense.

Do not remind the user that you know their preferences. Just let your answers reflect them. Never say things like "given your Mediterranean lean" or "since you mentioned you love anchovies." Simply cook that way.

HOW TO ANSWER

Read the energy of the prompt and match it. Keep all conversational responses short — three to four sentences maximum. Use a line break between distinct ideas. Never write walls of text.

If someone asks a direct question with a clear answer, give the answer. No hedging, no options, no "it depends." Just answer.

If someone asks for a specific recipe by name — "do you have a good caesar dressing recipe," "give me a ciabatta recipe" — always write one brief intro line first, something like "Classic caesar, here you go — recipe below." or "Good ciabatta starts with a poolish — recipe below." Then generate the recipe card immediately after. The intro line is required every single time and must end with "recipe below." Never generate a recipe card with no text above it. When the recipe card is being updated after a refinement, the intro line should end with "updated recipe below." instead.

If someone is clearly browsing — open-ended, no direction, exploratory — always open with one framing sentence before presenting options. Then present exactly three options using this format: bold dish name, one-sentence description, line break between each. End with a natural check-in that fits the tone — "any of these hitting?", "which direction feels right?", "want to go deeper on one?" — vary it, don't default to the same phrase every time. Before presenting specific dishes, establish cuisine or region first. If the user has not indicated a direction, ask one orienting question — "anything pulling you toward a particular cuisine?" — before suggesting dishes. You can ask up to three follow-up questions across the conversation, but move toward a confident suggestion — don't keep circling.

When asking multiple questions, put each question on its own line with a line break between them.

If someone names a specific dish or ingredient without much context, ask one smart question before building the recipe — something that would actually change the answer, like "what are you using it for?" or "cooking for two or a crowd?" Not a question for the sake of asking.

When the recipe card appears, always include a brief line above it — what you made and one thing worth knowing. Never let the card appear with no text above it.

On technique questions, ingredient swaps, or conversational tangents — answer them cleanly and conversationally. Do not touch the recipe card unless the user is explicitly iterating on the recipe itself.

Always default to the technically correct, elevated version of a recipe. Do not hedge toward safer or easier substitutions unless the user asks. Raw egg in caesar, real anchovies, proper technique — that is the default. Offer the easier swap as an option if relevant, never as the lead.

SITUATIONAL AWARENESS

This app is used in a wide range of situations — someone who has 20 minutes and needs a dinner idea, someone planning Christmas Eve for twenty people, someone who wants to know the temp for medium-rare ribeye. Adjust your depth and pace accordingly.

For quick practical questions: answer precisely and move on.

For recipe building: lead with a clear direction, build the full recipe when asked, and offer refinements naturally as the conversation continues.

For occasion and menu planning: go course by course. For each course, give a one-line theme and a short list of dish options with no descriptions — just names. Let the user narrow each course before moving to the next. Think about cohesion across the whole menu. Anticipate that this will be a longer back-and-forth and pace yourself accordingly — do not try to solve the whole menu in one response.

RECIPE CARD TRIGGERS

Generate a recipe card when the conversation has arrived at a clear, specific dish — either because the user explicitly asked for it, affirmed a direction, or the exchange has naturally concluded on one option with nothing left to resolve. Do not ask the user if they are ready for the recipe. Use judgment. If it is genuinely unclear what dish they have landed on, ask one short clarifying question rather than generating something that misses the mark.

Never generate or update the recipe card in response to a question, a tangent, or anything where the user is still exploring. Technique questions, wine questions, scaling questions, substitution questions — answer those conversationally and leave the card alone.

RECIPE FORMAT

When you've crafted a recipe and want to present it, use this EXACT format:

<recipe>
<title>Recipe Title Here</title>
<description>One-sentence description</description>
<ingredients>
<item><name>Ingredient name</name><qty>Amount</qty></item>
<item><name>Another ingredient</name><qty>Amount</qty></item>
</ingredients>
<steps>
<step>First step instructions</step>
<step>Second step instructions</step>
</steps>
</recipe>

WHAT YOU NEVER DO

Do not lead responses with praise. If a user asks whether their idea is good and it genuinely is, say so — but never open with a compliment unprompted.
Never use emojis.
Never use markdown formatting in conversational prose.
Never volunteer wine or drink pairings unless asked.
Never answer questions outside food and cooking.
Never say "great question," "absolutely," "of course," or anything in that family.
Never summarize what you are about to do before you do it.
Never be sycophantic when pushed back on — engage the pushback on its merits.

ON UNCERTAINTY

If you are not sure about something, say so briefly and offer your best read.

USER PROFILE

Palate: ${palate || "Not specified"}
Inspiration: ${inspiration || "Not specified"}
Constraints: ${constraints || "Not specified"}`;

      const stream = await anthropic.messages.stream({
        model: "claude-sonnet-4-5",
        max_tokens: 2048,
        system: systemPrompt,
        messages: updatedHistory,
      });

      // Create AI message immediately
      setTyping(false);
      const aiMessageId = ++idRef.current;
      setMessages((m) => [...m, { id: aiMessageId, role: "ai", text: "" }]);

      let fullText = "";

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          fullText += chunk.delta.text;

          // Detect if recipe generation has started
          if (!generatingRecipe && fullText.includes("<recipe>")) {
            setGeneratingRecipe(true);
          }

          // Strip recipe XML from display text
          let displayText = fullText;
          // First, remove any complete recipe blocks
          displayText = displayText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "");
          // Then, if there's an opening <recipe> tag without closing tag (incomplete block),
          // strip everything from <recipe> onwards to prevent partial XML from showing
          const recipeStartIndex = displayText.indexOf("<recipe>");
          if (recipeStartIndex !== -1) {
            displayText = displayText.substring(0, recipeStartIndex);
          }
          displayText = displayText.trim();

          setMessages((m) => m.map(msg =>
            msg.id === aiMessageId ? { ...msg, text: displayText } : msg
          ));
        }
      }

      console.log("Anthropic response received");

      if (!fullText) {
        throw new Error("Empty response from API");
      }

      // Parse for recipe XML
      const recipeMatch = fullText.match(/<recipe>([\s\S]*?)<\/recipe>/);
      let parsedRecipe = null;

      if (recipeMatch) {
        const recipeXml = recipeMatch[1];

        const titleMatch = recipeXml.match(/<title>(.*?)<\/title>/);
        const descMatch = recipeXml.match(/<description>(.*?)<\/description>/);
        const ingredientsMatch = recipeXml.match(/<ingredients>([\s\S]*?)<\/ingredients>/);
        const stepsMatch = recipeXml.match(/<steps>([\s\S]*?)<\/steps>/);

        const ingredients: { name: string; qty: string }[] = [];
        if (ingredientsMatch) {
          const itemMatches = [
            ...ingredientsMatch[1].matchAll(
              /<item>[\s\S]*?<name>(.*?)<\/name>[\s\S]*?<qty>(.*?)<\/qty>[\s\S]*?<\/item>/g
            ),
          ];
          for (const match of itemMatches) {
            ingredients.push({ name: match[1].trim(), qty: match[2].trim() });
          }
        }

        const steps: string[] = [];
        if (stepsMatch) {
          const stepMatches = [...stepsMatch[1].matchAll(/<step>(.*?)<\/step>/g)];
          for (const match of stepMatches) {
            steps.push(match[1].trim());
          }
        }

        if (titleMatch && descMatch && ingredients.length > 0 && steps.length > 0) {
          parsedRecipe = {
            title: titleMatch[1].trim(),
            description: descMatch[1].trim(),
            ingredients,
            steps,
          };
          console.log("Recipe parsed:", parsedRecipe.title);
        }
      }

      // Final update to ensure clean text without recipe XML
      const displayText = fullText.replace(/<recipe>[\s\S]*?<\/recipe>/g, "").trim();
      setMessages((m) => m.map(msg =>
        msg.id === aiMessageId ? { ...msg, text: displayText || "..." } : msg
      ));

      // Update conversation history
      setConversationHistory([...updatedHistory, { role: "assistant", content: fullText }]);

      // Handle recipe if present
      if (parsedRecipe) {
        setCurrentRecipe(parsedRecipe);
        setGeneratingRecipe(false);

        // Trigger mini player animation
        if (!recipeRevealed) {
          setRecipeRevealed(true);
          setTimeout(() => {
            setMiniBarVisible(true);
            setTimeout(() => setMiniTitleVisible(true), 200);
          }, 300);
        } else {
          // Recipe updated - already revealed, just update data
          setMiniBarVisible(true);
          setMiniTitleVisible(true);
        }
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setTyping(false);
      setGeneratingRecipe(false);
      setMessages((m) => [
        ...m,
        {
          id: ++idRef.current,
          role: "ai",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ]);
    }
  };

  const onPickCategory = (catKey: string, catLabel: string) => {
    if (!currentRecipe) return;

    const id = Date.now();
    saveRecipe({
      id,
      title: currentRecipe.title,
      description: currentRecipe.description,
      category: catKey,
      ingredients: currentRecipe.ingredients,
      steps: currentRecipe.steps,
      createdAt: new Date().toISOString(),
    });
    const recipe: Recipe = {
      title: currentRecipe.title,
      description: currentRecipe.description,
      color: "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
      category: catLabel.toLowerCase(),
      ingredients: currentRecipe.ingredients,
      steps: currentRecipe.steps,
      savedId: id,
      categoryKey: catKey,
    };
    setTrayOpen(false);
    finishSaveRecipe(recipe, catKey, catLabel);
  };

  const onPickNewCategory = () => {
    if (!currentRecipe) return;

    setTrayOpen(false);
    push({
      name: "newcategoryforrecipe",
      draft: {
        title: currentRecipe.title,
        description: currentRecipe.description,
        ingredients: currentRecipe.ingredients,
        steps: currentRecipe.steps,
      },
    });
  };

  const isEmpty = messages.length === 0;
  const placeholder = recipeRevealed ? "Make it even better..." : "What are we making tonight?";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", position: "relative" }}>
      {/* Header */}
      <div style={{ padding: "32px 24px 12px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        {expanded ? <span /> : (
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}
          >
            <BackArrow />
          </button>
        )}
        {isEmpty && (
          <button
            onClick={() => push({ name: "addown" })}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "6px 12px",
              background: "#E6F1FB",
              border: "0.5px solid #85B7EB",
              borderRadius: 999,
              color: "#185FA5",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 11,
              letterSpacing: "0.08em",
              cursor: "pointer",
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
            Write your own
          </button>
        )}
      </div>

      {/* Body */}
      {isEmpty ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px 32px", textAlign: "center", gap: 16 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%",
            background: "#E6F1FB", border: "0.5px solid #85B7EB",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#185FA5",
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14" />
              <path d="M5 12h14" />
            </svg>
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#042C53", fontWeight: 400 }}>
            What are we making?
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 13, color: "#185FA5", lineHeight: 1.5, maxWidth: 240 }}>
            Tell me what you're in the mood for, what's in your fridge, or what the occasion is.
          </div>
        </div>
      ) : (
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 16 }}>
          {messages.map((m) => (
            <ChatBubble key={m.id} role={m.role} text={m.text} />
          ))}
          {typing && <TypingBubble />}
          {generatingRecipe && <RecipeGeneratingIndicator />}
        </div>
      )}

      {/* Expanded recipe overlay — grows upward out of the mini player */}
      {currentRecipe && (
        <ExpandedRecipeOverlay
          open={expanded}
          bottomOffset={bottomBarHeight}
          onSave={() => setTrayOpen(true)}
          recipe={currentRecipe}
        />
      )}

      {/* Bottom bars (mini player + input) — never move, never hide */}
      <div ref={bottomBarRef} style={{ flexShrink: 0, position: "relative", zIndex: 60 }}>
        {recipeRevealed && currentRecipe && (
          <div
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "#E6F1FB",
              borderTop: "0.5px solid #85B7EB",
              padding: "8px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              opacity: miniBarVisible ? 1 : 0,
              transition: "opacity 600ms ease",
            }}
          >
            <div style={{ width: 32, height: 32, borderRadius: 6, background: "linear-gradient(135deg, #185FA5, #85B7EB)", flexShrink: 0 }} />
            <div style={{
              flex: 1, overflow: "hidden",
              opacity: miniTitleVisible ? 1 : 0,
              transition: "opacity 150ms ease",
            }}>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.1em", color: "#185FA5", opacity: 0.7 }}>
                In progress
              </div>
              <div style={{
                fontFamily: "'Playfair Display', serif", fontSize: 12, color: "#042C53",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>
                {currentRecipe.title}
              </div>
            </div>
            <div style={{ color: "#185FA5", fontSize: 14, flexShrink: 0 }}>{expanded ? "⌄" : "⌃"}</div>
          </div>
        )}

        <CookInputBar
          value={input}
          onChange={setInput}
          onSend={sendMessage}
          placeholder={placeholder}
          disabled={typing}
        />
      </div>

      {/* Bottom sheet: pick a category to save the AI recipe */}
      {trayOpen && (
        <SaveCategoryTray
          onClose={() => setTrayOpen(false)}
          onPick={onPickCategory}
          onNew={onPickNewCategory}
        />
      )}
    </div>
  );
}

function SaveCategoryTray({ onClose, onPick, onNew }: {
  onClose: () => void;
  onPick: (key: string, label: string) => void;
  onNew: () => void;
}) {
  const cats = loadCustomCategories();
  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute", inset: 0, background: "rgba(4, 44, 83, 0.38)",
        zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center",
        animation: "tipsy-fade 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: "20px 20px 0 0",
          padding: "16px 0 24px", width: "100%",
          animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div style={{ width: 32, height: 4, borderRadius: 2, background: "#C5DCF4", margin: "0 auto 14px" }} />
        <div style={{ padding: "0 18px 14px", borderBottom: "1px solid #C5DCF4" }}>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 17, color: "#042C53", marginBottom: 2 }}>Where does it live?</div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#5A7FA3" }}>Swipe to find the right category.</div>
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
              background: "#E6F1FB", border: "1px solid #85B7EB",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#185FA5", fontSize: 32, fontWeight: 300, lineHeight: 1,
              boxSizing: "border-box",
            }}>+</div>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, color: "#042C53", padding: "6px 4px 2px" }}>New category</div>
          </button>
          {cats.map((c) => (
            <button
              key={c.key}
              onClick={() => onPick(c.key, c.label)}
              style={{
                flexShrink: 0, width: 96, cursor: "pointer",
                borderRadius: 12, overflow: "hidden",
                border: "2px solid transparent", background: "none", padding: 0, textAlign: "left",
              }}
            >
              <div style={{
                width: 96, height: 70, position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.gradient,
              }}>
                <div style={{ position: "absolute", inset: 0, background: "rgba(4, 44, 83, 0.22)" }} />
                <div style={{
                  position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center",
                  fontFamily: "'DM Sans', sans-serif", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.95)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}>{c.label}</div>
              </div>
              <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 11, fontWeight: 500, color: "#042C53", padding: "6px 4px 2px" }}>{c.label}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChatBubble({ role, text }: { role: "user" | "ai"; text: string }) {
  const isUser = role === "user";

  // Simple markdown renderer for AI messages
  const renderMarkdown = (text: string) => {
    const lines = text.split('\n');
    const elements: JSX.Element[] = [];
    let key = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Check if it's a numbered list item (e.g., "1. ", "2. ", etc.)
      const numberedMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        const num = numberedMatch[1];
        const content = numberedMatch[2];
        elements.push(
          <div key={key++} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <span style={{ fontWeight: 500, flexShrink: 0 }}>{num}.</span>
            <span dangerouslySetInnerHTML={{ __html: content.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
          </div>
        );
        continue;
      }

      // Regular line with potential bold formatting
      if (line.trim()) {
        const html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        elements.push(
          <div key={key++} style={{ marginBottom: i < lines.length - 1 ? 8 : 0 }}>
            <span dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        );
      } else if (i < lines.length - 1) {
        // Empty line - add spacing
        elements.push(<div key={key++} style={{ height: 8 }} />);
      }
    }

    return <>{elements}</>;
  };

  if (isUser) {
    // User messages keep bubble styling
    return (
      <div
        style={{
          alignSelf: "flex-end",
          background: "#042C53",
          color: "#EEF4F8",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          padding: "10px 14px",
          borderRadius: "14px 14px 3px 14px",
          maxWidth: "78%",
          lineHeight: 1.5,
          animation: "tipsyChatIn 300ms ease",
        }}
      >
        {text}
        <style>{`@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>
      </div>
    );
  }

  // AI messages - no bubble, plain text with markdown
  return (
    <div
      style={{
        alignSelf: "flex-start",
        color: "#042C53",
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 13,
        maxWidth: "82%",
        lineHeight: 1.5,
        animation: "tipsyChatIn 300ms ease",
      }}
    >
      {renderMarkdown(text)}
      <style>{`@keyframes tipsyChatIn { from { opacity: 0; transform: translateY(4px);} to { opacity: 1; transform: translateY(0);} }`}</style>
    </div>
  );
}

function TypingBubble() {
  return (
    <div style={{
      alignSelf: "flex-start",
      background: "#D8E9F7",
      padding: "12px 14px",
      borderRadius: "14px 14px 14px 3px",
      display: "flex",
      gap: 4,
      alignItems: "center",
    }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 5, height: 5, borderRadius: "50%",
            background: "#185FA5",
            display: "inline-block",
            animation: `tipsyDot 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes tipsyDot { 0%,100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }`}</style>
    </div>
  );
}

function RecipeGeneratingIndicator() {
  return (
    <div style={{
      alignSelf: "flex-start",
      display: "flex",
      gap: 4,
      alignItems: "center",
      padding: "4px 0",
    }}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          style={{
            width: 4, height: 4, borderRadius: "50%",
            background: "#85B7EB",
            display: "inline-block",
            animation: `tipsyRecipeDot 1.4s ease-in-out ${i * 0.25}s infinite`,
          }}
        />
      ))}
      <style>{`@keyframes tipsyRecipeDot { 0%,100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 0.8; transform: scale(1.1); } }`}</style>
    </div>
  );
}

function CookInputBar({ value, onChange, onSend, placeholder, disabled }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to auto to get the correct scrollHeight
      textareaRef.current.style.height = "auto";
      // Set height based on scrollHeight, capped at ~5 lines (100px)
      const newHeight = Math.min(textareaRef.current.scrollHeight, 100);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [value]);

  return (
    <div style={{ padding: "10px 14px 16px", flexShrink: 0, background: "#EEF4F8", display: "flex", alignItems: "flex-end", gap: 8 }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        style={{
          flex: 1,
          background: "#fff",
          border: "0.5px solid #85B7EB",
          borderRadius: 16,
          padding: "9px 14px",
          outline: "none",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          color: "#042C53",
          resize: "none",
          overflowY: "auto",
          maxHeight: 100,
          lineHeight: 1.5,
        }}
      />
      <button
        onClick={onSend}
        disabled={disabled}
        aria-label="Send"
        style={{
          width: 32, height: 32, borderRadius: "50%",
          background: "#0C447C", border: "none",
          cursor: disabled ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", flexShrink: 0,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" />
          <path d="M13 5l7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}

function ExpandedRecipeOverlay({ open, bottomOffset, onSave, recipe }: {
  open: boolean;
  bottomOffset: number;
  onSave: () => void;
  recipe: {
    title: string;
    description: string;
    ingredients: { name: string; qty: string }[];
    steps: string[];
  };
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
          background: "#E6F1FB",
          transition: "height 350ms cubic-bezier(0.22, 1, 0.36, 1)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}
      >
      <div style={{
        opacity: contentVisible ? 1 : 0,
        transition: "opacity 200ms ease",
        display: "flex", flexDirection: "column", height: "100%",
        background: "#EEF4F8",
      }}>
      {/* Sheet header */}
      <div style={{ padding: "20px 16px 12px", flexShrink: 0, display: "grid", gridTemplateColumns: "32px 1fr 32px", alignItems: "center", background: "#EEF4F8" }}>
        <span />
        <div style={{
          textAlign: "center",
          fontFamily: "'DM Sans', sans-serif", fontSize: 10,
          textTransform: "uppercase", letterSpacing: "0.1em",
          color: "#185FA5", opacity: 0.7,
        }}>
          Recipe Preview
        </div>
        <span />
      </div>

      {/* Scrollable content */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
        {/* Hero section - scrolls normally */}
        <div style={{ height: 120, background: "linear-gradient(135deg, #042C53 0%, #185FA5 50%, #85B7EB 100%)" }} />
        <div style={{ padding: "16px 20px 14px" }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.14em", color: "#185FA5", marginBottom: 6 }}>
            Seafood
          </div>
          <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, color: "#042C53", lineHeight: 1.3, marginBottom: 8 }}>
            {recipe.title}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#185FA5", opacity: 0.8, lineHeight: 1.5 }}>
            {recipe.description}
          </div>
        </div>
        <div style={{ borderTop: "0.5px solid #85B7EB" }} />

        {/* Sticky Tabs - stick to top when scrolled */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 10, background: "#EEF4F8" }}>
          {(["ingredients", "steps"] as const).map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                onClick={() => setTab(t)}
                style={{
                  flex: 1,
                  padding: "11px 0",
                  background: active ? "#0C447C" : "#E6F1FB",
                  color: active ? "#EEF4F8" : "#185FA5",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                {t}
              </button>
            );
          })}
        </div>

        {tab === "ingredients" ? (
          <div>
            {recipe.ingredients.map((item, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 20px",
                borderBottom: "0.5px solid #85B7EB",
              }}>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#042C53" }}>{item.name}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#185FA5" }}>{item.qty}</span>
              </div>
            ))}
          </div>
        ) : (
          <div>
            {recipe.steps.map((s, i) => (
              <div key={i} style={{
                display: "flex", gap: 14, alignItems: "flex-start",
                padding: "12px 20px",
                borderBottom: "0.5px solid #85B7EB",
              }}>
                <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#85B7EB", lineHeight: 1, flexShrink: 0, minWidth: 18 }}>{i + 1}</span>
                <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#042C53", lineHeight: 1.6 }}>{s}</span>
              </div>
            ))}
          </div>
        )}
        {/* Save button */}
        <button
          onClick={onSave}
          style={{
            display: "block",
            width: "calc(100% - 32px)",
            margin: "12px 16px",
            padding: "12px 0",
            background: "#0C447C",
            color: "#EEF4F8",
            border: "none",
            borderRadius: 100,
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          Save
        </button>
      </div>
      </div>
      </div>
    </div>
  );
}
