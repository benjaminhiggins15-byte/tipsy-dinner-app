import { useEffect, useMemo, useRef, useState } from "react";
import { IconBook, IconCheck, IconLayoutList, IconPencil, IconPlus, IconSearch, IconX } from "@tabler/icons-react";
import { createGrouping, updateGrouping, getPlan, type Recipe, type GroupingPartInput } from "./data";

// Dishes & Menus v1.5 step 3a — the real Dish screen, replacing the
// "placeholder" slot for kind="dish" (step 2a/2b wired the handoff; the
// placeholder itself stays in place for the still-unbuilt dish Log Cook
// sheet, step 3c, and for menus).
type Screen = { name: "placeholder"; title: string; kind?: "dish" | "menu"; groupingId?: string };

const FONT_SANS = "'Inter', sans-serif";
const FONT_SERIF_ITALIC = "'Fraunces', serif";
const FOREST = "#233C00";
const CARD_BG = "rgba(35,60,0,0.05)";
const CARD_BORDER = "rgba(35,60,0,0.1)";
const MUTED_TEXT = "rgba(35,60,0,0.6)";
const BODY_BG = "#FAF7F2";

type DishPart =
  | { uid: string; kind: "recipe"; recipeId: string; title: string }
  | { uid: string; kind: "freeform"; text: string };

function toGroupingParts(parts: DishPart[]): GroupingPartInput[] {
  return parts.map((p) =>
    p.kind === "recipe"
      ? { section: "component", recipeId: p.recipeId }
      : { section: "also", freeformText: p.text },
  );
}

export default function DishScreen({
  back,
  push,
  groupingId,
  seedRecipe,
  recipesByCategory,
  ensureRecipesLoaded,
}: {
  back: () => void;
  push: (s: Screen) => void;
  groupingId?: string;
  // Present only when opened fresh from a recipe screen (no groupingId) —
  // pre-added as the dish's first component.
  seedRecipe?: Recipe;
  recipesByCategory: Record<string, Recipe[]>;
  ensureRecipesLoaded?: (categoryKey: string, categoryLabel: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(!!groupingId);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameFocused, setNameFocused] = useState(false);
  const [parts, setParts] = useState<DishPart[]>([]);
  const [addSheetOpen, setAddSheetOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (groupingId) {
      (async () => {
        try {
          const plan = await getPlan(groupingId);
          if (ignore) return;
          if (!plan || plan.kind !== "dish") {
            setLoadError("This dish couldn't be found.");
            setLoading(false);
            return;
          }
          setName(plan.title ?? "");
          setParts(
            plan.parts.map((p) =>
              p.recipe
                ? { uid: p.id, kind: "recipe" as const, recipeId: p.recipe.id, title: p.recipe.title }
                : { uid: p.id, kind: "freeform" as const, text: p.freeformText ?? "" },
            ),
          );
          setLoading(false);
        } catch {
          if (ignore) return;
          setLoadError("Couldn't load this dish.");
          setLoading(false);
        }
      })();
    } else if (seedRecipe && seedRecipe.savedId != null) {
      setParts([{ uid: crypto.randomUUID(), kind: "recipe", recipeId: String(seedRecipe.savedId), title: seedRecipe.title }]);
    }
    return () => {
      ignore = true;
    };
    // Screen instances are pushed once per navigation — intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSave = !loading && name.trim().length > 0 && parts.some((p) => p.kind === "recipe");
  const addedRecipeIds = useMemo(
    () => new Set(parts.filter((p): p is Extract<DishPart, { kind: "recipe" }> => p.kind === "recipe").map((p) => p.recipeId)),
    [parts],
  );

  function removePart(uid: string) {
    setParts((prev) => prev.filter((p) => p.uid !== uid));
  }

  function addRecipePart(recipeId: string, title: string) {
    setParts((prev) => [...prev, { uid: crypto.randomUUID(), kind: "recipe", recipeId, title }]);
    setAddSheetOpen(false);
  }

  function addFreeformPart(text: string) {
    setParts((prev) => [...prev, { uid: crypto.randomUUID(), kind: "freeform", text }]);
    setAddSheetOpen(false);
  }

  // Returns the saved grouping's id on success, null on failure (saveError set).
  async function doSave(): Promise<string | null> {
    if (!canSave || saving) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const trimmedName = name.trim();
      const groupingParts = toGroupingParts(parts);
      const id = groupingId
        ? (await updateGrouping(groupingId, trimmedName, groupingParts), groupingId)
        : await createGrouping("dish", trimmedName, groupingParts);
      setSaving(false);
      return id;
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : "Couldn't save this dish.");
      return null;
    }
  }

  async function handleSaveClick() {
    const id = await doSave();
    if (!id) return;
    setJustSaved(true);
    setTimeout(() => back(), 650);
  }

  async function handleLogCookClick() {
    const id = await doSave();
    if (!id) return;
    push({ name: "placeholder", title: "Log this cook (preview)", kind: "dish", groupingId: id });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BODY_BG, position: "relative" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED_TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: FOREST,
            }}
          >
            {groupingId ? "Edit dish" : "New dish"}
          </div>
        </div>
      </div>

      {loadError ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <p style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT, textAlign: "center" }}>{loadError}</p>
        </div>
      ) : (
        <>
          {/* Body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px" }}>
            {/* Name field */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "14px 16px",
                borderRadius: 16,
                background: CARD_BG,
                border: nameFocused || !name ? `1.5px solid ${FOREST}` : `1px solid ${CARD_BORDER}`,
                marginBottom: 24,
              }}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onFocus={() => setNameFocused(true)}
                onBlur={() => setNameFocused(false)}
                placeholder="Name your dish"
                className="dish-name-input"
                disabled={loading}
                style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontFamily: FONT_SANS, fontSize: 16, fontWeight: 600, color: FOREST }}
              />
              <IconPencil size={18} stroke={1.5} color={MUTED_TEXT} />
            </div>
            <style>{`.dish-name-input::placeholder { font-family: ${FONT_SERIF_ITALIC}; font-style: italic; font-weight: 400; color: rgba(35,60,0,0.35); }`}</style>

            {/* Parts header */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT }}>
                Parts
              </span>
              <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>
                {parts.length} {parts.length === 1 ? "part" : "parts"}
              </span>
            </div>

            {/* Parts list */}
            {loading ? (
              <div style={{ padding: "28px 0", textAlign: "center" }}>
                <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT }}>Loading…</span>
              </div>
            ) : parts.length === 0 ? (
              <div style={{ border: "1.5px dashed rgba(35,60,0,0.18)", borderRadius: 22, padding: "28px 20px", textAlign: "center" }}>
                <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT }}>
                  A dish needs a name and at least one of your recipes.
                </span>
              </div>
            ) : (
              <div style={{ borderRadius: 22, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>
                {parts.map((part, idx) => (
                  <div
                    key={part.uid}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 10px 14px 16px",
                      borderBottom: idx === parts.length - 1 ? "none" : "1px solid rgba(35,60,0,0.08)",
                    }}
                  >
                    <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 24 }}>
                      {part.kind === "recipe" ? (
                        <IconBook size={20} stroke={1.5} color={FOREST} />
                      ) : (
                        <IconLayoutList size={20} stroke={1.5} color={MUTED_TEXT} />
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: FONT_SANS,
                          fontSize: 14,
                          fontWeight: part.kind === "recipe" ? 700 : 400,
                          color: FOREST,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                      >
                        {part.kind === "recipe" ? part.title : part.text}
                      </div>
                      <div
                        style={{
                          fontFamily: FONT_SANS,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: MUTED_TEXT,
                          marginTop: 3,
                        }}
                      >
                        {part.kind === "recipe" ? "Saved recipe" : "Other"}
                      </div>
                    </div>
                    <button
                      onClick={() => removePart(part.uid)}
                      aria-label="Remove part"
                      style={{
                        width: 44,
                        height: 44,
                        minWidth: 44,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <IconX size={18} stroke={1.75} color={MUTED_TEXT} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add a part */}
            {!loading && (
              <button
                onClick={() => setAddSheetOpen(true)}
                style={{
                  width: "100%",
                  marginTop: 14,
                  padding: "14px",
                  borderRadius: 16,
                  background: "transparent",
                  border: `1.5px solid ${FOREST}`,
                  color: FOREST,
                  fontFamily: FONT_SANS,
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                + Add a part
              </button>
            )}

            {saveError && (
              <div style={{ marginTop: 14, fontFamily: FONT_SANS, fontSize: 13, color: "#B85C5C", textAlign: "center" }}>{saveError}</div>
            )}
          </div>

          {/* Footer */}
          <div style={{ flexShrink: 0, display: "flex", gap: 10, padding: "14px 20px 20px", borderTop: `1px solid ${CARD_BORDER}` }}>
            <button
              onClick={handleSaveClick}
              disabled={!canSave || saving}
              style={{
                flex: 1,
                padding: "15px 10px",
                borderRadius: 14,
                background: "transparent",
                border: canSave ? `1.5px solid ${FOREST}` : "1.5px solid rgba(35,60,0,0.18)",
                color: canSave ? FOREST : "rgba(35,60,0,0.35)",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: canSave && !saving ? "pointer" : "not-allowed",
              }}
            >
              Save
            </button>
            <button
              onClick={handleLogCookClick}
              disabled={!canSave || saving}
              style={{
                flex: 2,
                padding: "15px 10px",
                borderRadius: 14,
                background: canSave ? FOREST : "rgba(35,60,0,0.2)",
                border: "none",
                color: "#FAF7F2",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: canSave && !saving ? "pointer" : "not-allowed",
              }}
            >
              Log this cook
            </button>
          </div>
        </>
      )}

      {justSaved && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: "50%",
            transform: "translateX(-50%)",
            background: FOREST,
            color: "#FAF7F2",
            padding: "8px 16px",
            borderRadius: 999,
            fontFamily: FONT_SANS,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            zIndex: 95,
            animation: "tipsy-fade 0.2s ease",
          }}
        >
          Saved
        </div>
      )}

      {addSheetOpen && (
        <AddPartSheet
          onClose={() => setAddSheetOpen(false)}
          recipesByCategory={recipesByCategory}
          ensureRecipesLoaded={ensureRecipesLoaded}
          addedRecipeIds={addedRecipeIds}
          onAddRecipe={addRecipePart}
          onAddFreeform={addFreeformPart}
        />
      )}

      <style>{`
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}

function AddPartSheet({
  onClose,
  recipesByCategory,
  ensureRecipesLoaded,
  addedRecipeIds,
  onAddRecipe,
  onAddFreeform,
}: {
  onClose: () => void;
  recipesByCategory: Record<string, Recipe[]>;
  ensureRecipesLoaded?: (categoryKey: string, categoryLabel: string) => Promise<void>;
  addedRecipeIds: Set<string>;
  onAddRecipe: (recipeId: string, title: string) => void;
  onAddFreeform: (text: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const allRecipes = recipesByCategory["__all__"];

  useEffect(() => {
    if (!allRecipes) ensureRecipesLoaded?.("__all__", "All Recipes");
  }, [allRecipes, ensureRecipesLoaded]);

  const trimmed = query.trim();
  const candidateRecipes = useMemo(() => {
    const list = (allRecipes ?? []).filter((r) => r.savedId != null);
    if (!trimmed) {
      return [...list].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "")).slice(0, 8);
    }
    const q = trimmed.toLowerCase();
    return list.filter((r) => r.title.toLowerCase().includes(q));
  }, [allRecipes, trimmed]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        top: 96,
        left: 0,
        right: 0,
        bottom: 64, // nav-bar clearance
        background: "rgba(35, 60, 0, 0.08)",
        zIndex: 90,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "tipsy-fade 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: BODY_BG,
          borderRadius: "28px 28px 0 0",
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <div style={{ flexShrink: 0, padding: "14px 20px 0" }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(35,60,0,0.15)", margin: "0 auto 18px" }} />
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: FOREST,
              textAlign: "center",
            }}
          >
            Add a part
          </div>
          <div
            style={{
              fontFamily: FONT_SERIF_ITALIC,
              fontStyle: "italic",
              fontSize: 13,
              color: MUTED_TEXT,
              textAlign: "center",
              marginTop: 4,
              marginBottom: 16,
            }}
          >
            Saved recipes or freeform items
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderRadius: 16,
              background: CARD_BG,
              border: focused ? `1.5px solid ${FOREST}` : `1px solid ${CARD_BORDER}`,
            }}
          >
            <IconSearch size={18} stroke={1.5} color={MUTED_TEXT} />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="Search your recipes, or name something else"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none", fontFamily: FONT_SANS, fontSize: 15, color: FOREST }}
            />
            {query && (
              <button
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", flexShrink: 0 }}
              >
                <IconX size={16} stroke={1.75} color={MUTED_TEXT} />
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>
          <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 6 }}>
            Saved recipes
          </div>

          {trimmed && candidateRecipes.length === 0 ? (
            <div style={{ padding: "10px 0 16px" }}>
              <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>No matching recipes</span>
            </div>
          ) : (
            candidateRecipes.map((r) => {
              const id = String(r.savedId);
              const added = addedRecipeIds.has(id);
              return (
                <div
                  key={id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 2px",
                    borderBottom: "1px solid rgba(35,60,0,0.06)",
                  }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: FONT_SANS,
                        fontWeight: 700,
                        fontSize: 14,
                        color: FOREST,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {r.title}
                    </div>
                    <div
                      style={{
                        fontFamily: FONT_SANS,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.06em",
                        textTransform: "uppercase",
                        color: MUTED_TEXT,
                        marginTop: 3,
                      }}
                    >
                      Saved recipe
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (!added) onAddRecipe(id, r.title);
                    }}
                    disabled={added}
                    aria-label={added ? `${r.title} already added` : `Add ${r.title}`}
                    style={{
                      width: 32,
                      height: 32,
                      minWidth: 32,
                      borderRadius: "50%",
                      background: added ? "rgba(35,60,0,0.08)" : "transparent",
                      border: added ? "none" : `1.5px solid ${FOREST}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: added ? "default" : "pointer",
                      flexShrink: 0,
                    }}
                  >
                    {added ? <IconCheck size={16} stroke={2} color={MUTED_TEXT} /> : <IconPlus size={16} stroke={2} color={FOREST} />}
                  </button>
                </div>
              );
            })
          )}

          <button
            onClick={() => {
              if (trimmed) onAddFreeform(trimmed);
            }}
            disabled={!trimmed}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              width: "100%",
              textAlign: "left",
              padding: "14px 16px",
              borderRadius: 16,
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              marginTop: 16,
              cursor: trimmed ? "pointer" : "not-allowed",
              opacity: trimmed ? 1 : 0.5,
            }}
          >
            <div
              style={{
                width: 32,
                height: 32,
                minWidth: 32,
                borderRadius: "50%",
                background: FOREST,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <IconPlus size={16} stroke={2} color="#FAF7F2" />
            </div>
            <span style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 14, color: FOREST }}>Add other elements</span>
          </button>
        </div>
      </div>
    </div>
  );
}
