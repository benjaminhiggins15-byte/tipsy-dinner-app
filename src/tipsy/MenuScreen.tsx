import { useEffect, useMemo, useState } from "react";
import { IconBook, IconChevronRight, IconLayoutList, IconX } from "@tabler/icons-react";
import {
  createGrouping,
  updateGrouping,
  getPlan,
  listMyPlans,
  type Recipe,
  type GroupingPartInput,
  type PlanPart,
  type PlanSummary,
  type MenuSection,
} from "./data";
import {
  AddPartSheet,
  NameField,
  SaveLogFooter,
  SavedToast,
  ScreenTitleHeader,
  FONT_SANS,
  FONT_SERIF_ITALIC,
  FOREST,
  CARD_BG,
  CARD_BORDER,
  MUTED_TEXT,
  BODY_BG,
} from "./DishScreen";
import { BottomSheet, SheetKeyframes } from "./BottomSheet";
import { DishIcon } from "./LogCookTypePicker";
import LogGroupingCookSheet from "./LogGroupingCookSheet";

// Dishes & Menus v1.5 step 3b — the real Menu screen, replacing the
// "placeholder" slot for kind="menu" (step 2b wired the handoff). Reuses
// DishScreen's exported pieces (constants, NameField, SaveLogFooter,
// SavedToast, ScreenTitleHeader, AddPartSheet) rather than
// re-implementing them.
type Screen = { name: "placeholder"; title: string; kind?: "dish" | "menu"; groupingId?: string };

const COURSES: { key: MenuSection; label: string }[] = [
  { key: "apps", label: "Apps" },
  { key: "mains", label: "Mains" },
  { key: "sides", label: "Sides" },
  { key: "desserts", label: "Desserts" },
  { key: "drinks", label: "Drinks" },
];

type MenuPart =
  | { uid: string; course: MenuSection; kind: "recipe"; recipeId: string; title: string }
  | { uid: string; course: MenuSection; kind: "freeform"; text: string }
  | { uid: string; course: MenuSection; kind: "dish"; dishId: string; title: string; partCount: number; nestedParts: PlanPart[] | null };

function toGroupingParts(parts: MenuPart[]): GroupingPartInput[] {
  return parts.map((p) =>
    p.kind === "recipe"
      ? { section: p.course, recipeId: p.recipeId }
      : p.kind === "dish"
      ? { section: p.course, childGroupingId: p.dishId }
      : { section: p.course, freeformText: p.text },
  );
}

export default function MenuScreen({
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
  // triggers the "Which course?" sheet on mount instead of being auto-added.
  seedRecipe?: Recipe;
  recipesByCategory: Record<string, Recipe[]>;
  ensureRecipesLoaded?: (categoryKey: string, categoryLabel: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(!!groupingId);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tracks the id this screen is currently editing — starts as the groupingId
  // prop, but a successful save on a fresh menu (SAVE stays on this screen)
  // flips it to the new id so the header and subsequent saves become "edit".
  const [activeGroupingId, setActiveGroupingId] = useState(groupingId);
  const [name, setName] = useState("");
  const [parts, setParts] = useState<MenuPart[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [addSheetCourse, setAddSheetCourse] = useState<MenuSection | null>(null);
  // Opened automatically on arrival with a seedRecipe and no groupingId —
  // closing without picking a course leaves `parts` untouched (empty menu).
  const [seedCoursePickerOpen, setSeedCoursePickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [allDishes, setAllDishes] = useState<PlanSummary[] | null>(null);
  const [logCookOpen, setLogCookOpen] = useState(false);
  const [logCookToast, setLogCookToast] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const plans = await listMyPlans();
        if (ignore) return;
        setAllDishes(plans.filter((p) => p.kind === "dish"));
      } catch {
        if (ignore) return;
        setAllDishes([]);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;
    if (groupingId) {
      (async () => {
        try {
          const plan = await getPlan(groupingId);
          if (ignore) return;
          if (!plan || plan.kind !== "menu") {
            setLoadError("This menu couldn't be found.");
            setLoading(false);
            return;
          }
          setName(plan.title ?? "");
          setParts(
            plan.parts.map((p): MenuPart => {
              const course = (p.section as MenuSection) ?? "mains";
              if (p.recipe) return { uid: p.id, course, kind: "recipe", recipeId: p.recipe.id, title: p.recipe.title };
              if (p.childDish) {
                return {
                  uid: p.id,
                  course,
                  kind: "dish",
                  dishId: p.childDish.id,
                  title: p.childDish.title ?? "Untitled dish",
                  partCount: p.childDish.parts.length,
                  nestedParts: p.childDish.parts,
                };
              }
              return { uid: p.id, course, kind: "freeform", text: p.freeformText ?? "" };
            }),
          );
          setLoading(false);
        } catch {
          if (ignore) return;
          setLoadError("Couldn't load this menu.");
          setLoading(false);
        }
      })();
    } else if (seedRecipe && seedRecipe.savedId != null) {
      setSeedCoursePickerOpen(true);
    }
    return () => {
      ignore = true;
    };
    // Screen instances are pushed once per navigation — intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Mirrors validateGroupingContents (data.ts): a menu needs at least one
  // recipe or dish part — freeform alone isn't enough.
  const canSave = !loading && name.trim().length > 0 && parts.some((p) => p.kind === "recipe" || p.kind === "dish");
  const addedRecipeIds = useMemo(
    () => new Set(parts.filter((p): p is Extract<MenuPart, { kind: "recipe" }> => p.kind === "recipe").map((p) => p.recipeId)),
    [parts],
  );
  const addedDishIds = useMemo(
    () => new Set(parts.filter((p): p is Extract<MenuPart, { kind: "dish" }> => p.kind === "dish").map((p) => p.dishId)),
    [parts],
  );

  function removePart(uid: string) {
    setParts((prev) => prev.filter((p) => p.uid !== uid));
    setExpanded((prev) => {
      if (!prev.has(uid)) return prev;
      const next = new Set(prev);
      next.delete(uid);
      return next;
    });
  }

  function toggleExpanded(uid: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }

  function addSeedToCourse(course: MenuSection) {
    if (!seedRecipe || seedRecipe.savedId == null) return;
    setParts((prev) => [
      ...prev,
      { uid: crypto.randomUUID(), course, kind: "recipe", recipeId: String(seedRecipe.savedId), title: seedRecipe.title },
    ]);
    setSeedCoursePickerOpen(false);
  }

  function addRecipePart(recipeId: string, title: string) {
    if (!addSheetCourse) return;
    const course = addSheetCourse;
    setParts((prev) => [...prev, { uid: crypto.randomUUID(), course, kind: "recipe", recipeId, title }]);
    setAddSheetCourse(null);
  }

  function addFreeformPart(text: string) {
    if (!addSheetCourse) return;
    const course = addSheetCourse;
    setParts((prev) => [...prev, { uid: crypto.randomUUID(), course, kind: "freeform", text }]);
    setAddSheetCourse(null);
  }

  function addDishPart(dish: PlanSummary) {
    if (!addSheetCourse) return;
    const course = addSheetCourse;
    const uid = crypto.randomUUID();
    setParts((prev) => [
      ...prev,
      { uid, course, kind: "dish", dishId: dish.id, title: dish.title ?? "Untitled dish", partCount: dish.partCount, nestedParts: null },
    ]);
    setAddSheetCourse(null);
    // Fetches the dish's own parts for the nested expand view — the sheet
    // itself only has PlanSummary's partCount, not the part list.
    (async () => {
      try {
        const plan = await getPlan(dish.id);
        if (!plan) return;
        setParts((prev) =>
          prev.map((p) => (p.uid === uid && p.kind === "dish" ? { ...p, nestedParts: plan.parts, partCount: plan.parts.length } : p)),
        );
      } catch {
        // Leave nestedParts null — expanded view keeps showing "Loading…".
        // Rare (dish was just validated to exist via the sheet's own list).
      }
    })();
  }

  // Returns the saved grouping's id on success, null on failure (saveError set).
  async function doSave(): Promise<string | null> {
    if (!canSave || saving) return null;
    setSaving(true);
    setSaveError(null);
    try {
      const trimmedName = name.trim();
      const groupingParts = toGroupingParts(parts);
      const id = activeGroupingId
        ? (await updateGrouping(activeGroupingId, trimmedName, groupingParts), activeGroupingId)
        : await createGrouping("menu", trimmedName, groupingParts);
      setSaving(false);
      return id;
    } catch (e) {
      setSaving(false);
      setSaveError(e instanceof Error ? e.message : "Couldn't save this menu.");
      return null;
    }
  }

  async function handleSaveClick() {
    const id = await doSave();
    if (!id) return;
    setActiveGroupingId(id);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  }

  async function handleLogCookClick() {
    const id = await doSave();
    if (!id) return;
    setActiveGroupingId(id);
    setLogCookOpen(true);
  }

  function handleCookLogged(message: string) {
    setLogCookOpen(false);
    setLogCookToast(message);
    setTimeout(() => setLogCookToast(null), 1800);
  }

  const visibleCourses = COURSES.filter((c) => parts.some((p) => p.course === c.key));
  const hiddenCourses = COURSES.filter((c) => !parts.some((p) => p.course === c.key));
  const addSheetCourseLabel = addSheetCourse ? COURSES.find((c) => c.key === addSheetCourse)?.label : undefined;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BODY_BG, position: "relative" }}>
      <ScreenTitleHeader title={activeGroupingId ? "Edit menu" : "New menu"} onBack={back} />

      {loadError ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
          <p style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT, textAlign: "center" }}>{loadError}</p>
          <button
            onClick={back}
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              fontFamily: FONT_SANS,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: FOREST,
            }}
          >
            Go back
          </button>
        </div>
      ) : loading ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT }}>Loading…</span>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px" }}>
            <NameField value={name} onChange={setName} placeholder="Name your menu" />

            {parts.length === 0 ? (
              <>
                <div
                  style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 10 }}
                >
                  Add a course
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  {COURSES.map((c) => (
                    <CourseChip key={c.key} label={c.label} onClick={() => setAddSheetCourse(c.key)} />
                  ))}
                </div>
                <div style={{ border: "1.5px dashed rgba(35,60,0,0.18)", borderRadius: 22, padding: "28px 20px", textAlign: "center" }}>
                  <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT }}>
                    A menu needs a name and at least one dish or recipe. Empty courses stay hidden.
                  </span>
                </div>
              </>
            ) : (
              <>
                {visibleCourses.map((c) => {
                  const courseParts = parts.filter((p) => p.course === c.key);
                  return (
                    <div key={c.key} style={{ marginBottom: 18 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <span
                          style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT }}
                        >
                          {c.label}
                        </span>
                        <button
                          onClick={() => setAddSheetCourse(c.key)}
                          style={{
                            background: "transparent",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            fontFamily: FONT_SANS,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: FOREST,
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      <div style={{ borderRadius: 22, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>
                        {courseParts.map((part, idx) => (
                          <MenuPartRow
                            key={part.uid}
                            part={part}
                            isLast={idx === courseParts.length - 1}
                            isExpanded={expanded.has(part.uid)}
                            onToggle={() => toggleExpanded(part.uid)}
                            onRemove={() => removePart(part.uid)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {hiddenCourses.length > 0 && (
                  <>
                    <div
                      style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 10 }}
                    >
                      Add another course
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {hiddenCourses.map((c) => (
                        <CourseChip key={c.key} label={c.label} onClick={() => setAddSheetCourse(c.key)} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {saveError && (
              <div style={{ marginTop: 14, fontFamily: FONT_SANS, fontSize: 13, color: "#B85C5C", textAlign: "center" }}>{saveError}</div>
            )}
          </div>

          <SaveLogFooter canSave={canSave} saving={saving} onSave={handleSaveClick} onLogCook={handleLogCookClick} />
        </>
      )}

      <SavedToast show={justSaved} />
      <SavedToast show={!!logCookToast} message={logCookToast ?? undefined} />

      {addSheetCourse && (
        <AddPartSheet
          onClose={() => setAddSheetCourse(null)}
          recipesByCategory={recipesByCategory}
          ensureRecipesLoaded={ensureRecipesLoaded}
          addedRecipeIds={addedRecipeIds}
          onAddRecipe={addRecipePart}
          onAddFreeform={addFreeformPart}
          dishes={allDishes ?? undefined}
          addedDishIds={addedDishIds}
          onAddDish={addDishPart}
          title={addSheetCourseLabel ? `Add to ${addSheetCourseLabel}` : undefined}
          subtitle="Your dishes, saved recipes or anything else"
        />
      )}

      {seedCoursePickerOpen && seedRecipe && (
        <WhichCourseSheet
          recipeTitle={seedRecipe.title}
          onClose={() => setSeedCoursePickerOpen(false)}
          onPick={addSeedToCourse}
        />
      )}

      {logCookOpen && activeGroupingId && (
        <LogGroupingCookSheet
          groupingId={activeGroupingId}
          planTitle={name}
          partCount={parts.length}
          onClose={() => setLogCookOpen(false)}
          onLogged={handleCookLogged}
        />
      )}

      <SheetKeyframes />
    </div>
  );
}

function CourseChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 16px",
        borderRadius: 999,
        background: "transparent",
        border: `1px solid ${FOREST}`,
        color: FOREST,
        fontFamily: FONT_SANS,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: "pointer",
      }}
    >
      + {label}
    </button>
  );
}

// Small bottom sheet shown on arrival from a recipe screen (seedRecipe, no
// groupingId) — same backdrop/portal/close chrome as AddPartSheet, but a
// short content-sized card (no scrolling list) since it's just five chips.
function WhichCourseSheet({
  recipeTitle,
  onClose,
  onPick,
}: {
  recipeTitle: string;
  onClose: () => void;
  onPick: (course: MenuSection) => void;
}) {
  return (
    <BottomSheet onClose={onClose} portal zIndex={200} bottomInset={0} sizing="auto" showClose closeOnBackdrop>
      <div style={{ padding: "22px 20px 28px" }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: FOREST, textAlign: "center" }}>
          Which course?
        </div>
        <div
          style={{
            fontFamily: FONT_SERIF_ITALIC,
            fontStyle: "italic",
            fontSize: 13,
            color: MUTED_TEXT,
            textAlign: "center",
            marginTop: 4,
            marginBottom: 20,
          }}
        >
          Where does {recipeTitle} go?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
          {COURSES.map((c) => (
            <CourseChip key={c.key} label={c.label} onClick={() => onPick(c.key)} />
          ))}
        </div>
      </div>
    </BottomSheet>
  );
}

function MenuPartRow({
  part,
  isLast,
  isExpanded,
  onToggle,
  onRemove,
}: {
  part: MenuPart;
  isLast: boolean;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const clickableRow = part.kind === "dish";
  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid rgba(35,60,0,0.08)" }}>
      <div
        onClick={clickableRow ? onToggle : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 10px 14px 16px",
          cursor: clickableRow ? "pointer" : "default",
        }}
      >
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 24 }}>
          {part.kind === "recipe" ? (
            <IconBook size={20} stroke={1.5} color={FOREST} />
          ) : part.kind === "dish" ? (
            <DishIcon />
          ) : (
            <IconLayoutList size={20} stroke={1.5} color={MUTED_TEXT} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONT_SANS,
              fontSize: 14,
              fontWeight: part.kind === "freeform" ? 400 : part.kind === "dish" ? 600 : 700,
              color: FOREST,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {part.kind === "freeform" ? part.text : part.title}
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
            {part.kind === "recipe" ? "Saved recipe" : part.kind === "dish" ? `Dish · ${part.partCount} ${part.partCount === 1 ? "part" : "parts"}` : "Other"}
          </div>
        </div>
        {part.kind === "dish" && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: isExpanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          >
            <IconChevronRight size={18} stroke={1.75} color={MUTED_TEXT} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
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

      {part.kind === "dish" && isExpanded && (
        <div style={{ padding: "0 16px 14px 48px" }}>
          <div style={{ borderLeft: "1.5px solid rgba(35,60,0,0.12)", paddingLeft: 14 }}>
            {part.nestedParts === null ? (
              <div style={{ padding: "6px 0", fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>Loading…</div>
            ) : part.nestedParts.length === 0 ? (
              <div style={{ padding: "6px 0", fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>No parts</div>
            ) : (
              part.nestedParts.map((np) => (
                <div key={np.id} style={{ padding: "6px 0" }}>
                  <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: np.recipe ? 700 : 400, color: FOREST }}>
                    {np.recipe ? np.recipe.title : np.freeformText}
                  </div>
                  <div
                    style={{
                      fontFamily: FONT_SANS,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: MUTED_TEXT,
                      marginTop: 2,
                    }}
                  >
                    {np.recipe ? "Saved recipe" : "Other"}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
