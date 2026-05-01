import { useState, useRef, useEffect, type CSSProperties } from "react";
import { getAllCategories, getRecipesForCategory, saveRecipe, type Recipe } from "./data";
import AddYourOwn from "./AddYourOwn";
import NewCategory from "./NewCategory";

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
    case "cook": return <Cook back={back} push={push} />;
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
    case "placeholder": return <Placeholder title={s.title} back={back} />;
  }
}

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const current = stack[stack.length - 1];
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
        />
      </div>
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
        {renderScreen(current, push, back, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe)}
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
        {renderScreen(from, push, back, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe)}
      </div>
      <div style={{ ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: toZ, pointerEvents: "none" }}>
        {renderScreen(to, push, back, replaceRecipe, finishEditCategory, finishDeleteCategory, finishDeleteRecipe, finishCreateCategoryForRecipe)}
      </div>
    </>
  );
}

/* ---------------- Home ---------------- */
function Home({ push }: { push: (s: Screen) => void }) {
  const buttons = [
    { label: "cook", sub: "your next dish", action: () => push({ name: "cook" }) },
    { label: "browse", sub: "your recipes", action: () => push({ name: "categories" }) },
    { label: "build", sub: "your menus", action: () => push({ name: "placeholder", title: "Build" }) },
    { label: "share", sub: "your palette", action: () => push({ name: "placeholder", title: "Share" }) },
  ];
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 32px 28px" }}>
        <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#185FA5", textTransform: "uppercase", marginBottom: 16 }}>
          welcome back
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 44, fontWeight: 400, color: "#042C53", letterSpacing: "-0.5px", lineHeight: 1.1, textAlign: "center" }}>
          Tipsy<br />Dinner
        </div>
        <div style={{ width: 32, height: 1, background: "#85B7EB", margin: "20px 0" }} />
        <div style={{ fontSize: 13, color: "#185FA5", letterSpacing: "0.02em" }}>
          What are we making tonight?
        </div>
      </div>
      <div style={{ padding: "0 24px 44px", display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {buttons.map((b) => (
          <button
            key={b.label}
            onClick={b.action}
            style={{
              padding: "20px 14px",
              background: "#E6F1FB",
              border: "0.5px solid #85B7EB",
              borderRadius: 16,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              gap: 6,
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: 11, letterSpacing: "0.14em", color: "#0C447C", textTransform: "uppercase", fontWeight: 500 }}>
              {b.label}
            </span>
            <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 12, color: "#042C53", fontWeight: 400, lineHeight: 1.3 }}>
              {b.sub}
            </span>
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
            Browse
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
function Cook({ back, push }: { back: () => void; push: (s: Screen) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "32px 24px 16px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}
          >
            <BackArrow />
          </button>
        </div>
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
          Add your own
        </button>
      </div>

      {/* Empty state */}
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
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#185FA5", lineHeight: 1.5, maxWidth: 240 }}>
          Tell me what you're in the mood for, what's in your fridge, or what the occasion is.
        </div>
      </div>

      {/* Input bar */}
      <div style={{ padding: "12px 16px 20px", flexShrink: 0 }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          background: "#E6F1FB",
          border: "0.5px solid #85B7EB",
          borderRadius: 999,
          padding: "6px 6px 6px 16px",
        }}>
          <input
            type="text"
            placeholder="What are we making tonight?"
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontFamily: "'DM Sans', sans-serif", fontSize: 13,
              color: "#042C53",
            }}
          />
          <button
            aria-label="Send"
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "#0C447C", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#E6F1FB", flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" />
              <path d="M13 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
