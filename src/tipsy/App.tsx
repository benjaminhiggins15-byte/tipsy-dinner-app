import { useState, type CSSProperties } from "react";
import { categories, getRecipesForCategory, type Recipe } from "./data";

type Screen =
  | { name: "home" }
  | { name: "categories" }
  | { name: "recipes"; categoryKey: string; categoryLabel: string }
  | { name: "recipe"; recipe: Recipe; categoryLabel: string }
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
  },
};

export default function App() {
  const [stack, setStack] = useState<Screen[]>([{ name: "home" }]);
  const current = stack[stack.length - 1];

  const push = (s: Screen) => setStack((st) => [...st, s]);
  const back = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));

  return (
    <div style={S.page}>
      <div style={S.phone}>
        {current.name === "home" && <Home push={push} />}
        {current.name === "categories" && <Categories push={push} />}
        {current.name === "recipes" && (
          <Recipes
            categoryKey={current.categoryKey}
            categoryLabel={current.categoryLabel}
            push={push}
            back={back}
          />
        )}
        {current.name === "recipe" && (
          <RecipeCard recipe={current.recipe} back={back} />
        )}
        {current.name === "placeholder" && (
          <Placeholder title={current.title} back={back} />
        )}
      </div>
    </div>
  );
}

/* ---------------- Home ---------------- */
function Home({ push }: { push: (s: Screen) => void }) {
  const buttons = [
    { label: "cook", sub: "your next dish", action: () => push({ name: "placeholder", title: "Cook" }) },
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
function Categories({ push }: { push: (s: Screen) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "32px 24px 16px", flexShrink: 0 }}>
        <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#185FA5", textTransform: "uppercase", marginBottom: 6 }}>
          your library
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400, color: "#042C53" }}>
          Browse
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {categories.map((c) => (
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
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "32px 24px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", color: "#185FA5", display: "flex", alignItems: "center" }}
          >
            <BackArrow />
          </button>
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#185FA5", textTransform: "uppercase" }}>
            your library
          </div>
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 400, color: "#042C53" }}>
          {categoryLabel}
        </div>
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
function RecipeCard({ recipe, back }: { recipe: Recipe; back: () => void }) {
  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];

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
          <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#185FA5", textTransform: "uppercase" }}>
            tipsy dinner
          </div>
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
