import { useEffect, useState } from "react";
import { IconBook, IconChevronRight, IconLayoutList } from "@tabler/icons-react";
import {
  getPlan,
  deleteGrouping,
  getMenusUsingDish,
  addRecipeToLibrary,
  getRecipePreview,
  getRecipeForLibraryNav,
  type PlanDetail as PlanDetailData,
  type PlanPart,
  type Recipe,
  type MenuUsage,
  type RecipePreview,
  type MenuSection,
} from "./data";
import { logEvent } from "../lib/events";
import ExpandedRecipeOverlay from "./ExpandedRecipeOverlay";
import { DishIcon } from "./LogCookTypePicker";
import { SaveToSheet } from "./CookFeed";
import LogGroupingCookSheet from "./LogGroupingCookSheet";
import {
  FONT_SANS,
  FONT_SERIF_ITALIC,
  FOREST,
  CARD_BG,
  CARD_BORDER,
  MUTED_TEXT,
  BODY_BG,
  ScreenTitleHeader,
  SavedToast,
} from "./DishScreen";

// Dishes & Menus v1.5 step 5b — the real Plan Detail screen, replacing the
// dev-only "placeholder" slot step 5a's list row (and the post-save "View"
// link) routed to. Read-only "as saved" view of a dish/menu, hand-matched to
// DishMenuPostDetailScreen's (CookFeed.tsx) read-only part-row rendering
// rather than importing it directly — same "sibling, not fused" convention
// that screen already follows relative to DishScreen/MenuScreen — but reads
// the LIVE PlanPart tree (getPlan) instead of a frozen grouping_snapshot,
// since this is the owner's own always-current plan, not a post.

const COURSES: { key: MenuSection; label: string }[] = [
  { key: "apps", label: "Apps" },
  { key: "mains", label: "Mains" },
  { key: "sides", label: "Sides" },
  { key: "desserts", label: "Desserts" },
  { key: "drinks", label: "Drinks" },
];

function formatCookedOn(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Minimal local Screen type — same convention as every other top-level
// screen file: only the push targets this screen actually uses.
type Screen =
  | { name: "dishScreen"; groupingId?: string }
  | { name: "menuScreen"; groupingId?: string }
  | { name: "recipe"; recipe: Recipe; categoryLabel: string; categoryKey: string }
  | { name: "newcategoryforplandetail"; groupingId: string; kind: "dish" | "menu"; recipeId: string };

type TappableRecipe = { id: string; title: string; inLibrary: boolean; inspiredByName: string | null };

export default function PlanDetail({
  groupingId,
  kind,
  newCategory,
  pendingRecipeId,
  toastMessage,
  back,
  push,
  onDeleted,
}: {
  groupingId: string;
  kind: "dish" | "menu";
  // Carried through the newcategoryforplandetail round trip (App.tsx) so the
  // SaveToSheet reopens pre-selected to the just-created category — same
  // pattern as CookPostDetailScreen's own newCategory prop.
  newCategory?: { key: string; label: string };
  // The recipe that was mid-promotion when the user tapped "+ New category"
  // — needed to resume handleAddToLibrary after the round trip, since the
  // preview overlay itself does not survive the remount.
  pendingRecipeId?: string;
  // Carried in from DishScreen/MenuScreen's onSaved (App.tsx) after a save or
  // a logged cook on the edit screen — this screen owns the "Saved"/"Cook
  // logged" toast, not the editor. Mirrors Home.tsx's own incomingToast
  // seed-and-auto-dismiss pattern.
  toastMessage?: string;
  back: () => void;
  push: (s: Screen) => void;
  onDeleted: (message: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [plan, setPlan] = useState<PlanDetailData | null>(null);
  const [menusUsingDish, setMenusUsingDish] = useState<MenuUsage[]>([]);
  const [expandedDishes, setExpandedDishes] = useState<Set<string>>(new Set());

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewRecipe, setPreviewRecipe] = useState<RecipePreview | null>(null);
  const [previewRecipeId, setPreviewRecipeId] = useState<string | null>(null);
  const [previewInspiredBy, setPreviewInspiredBy] = useState<string | null>(null);
  const [promotedIds, setPromotedIds] = useState<Set<string>>(new Set());
  const [promotingRecipeId, setPromotingRecipeId] = useState<string | null>(pendingRecipeId ?? null);
  const [trayOpen, setTrayOpen] = useState(!!newCategory);
  const [justAdded, setJustAdded] = useState(false);

  const [logCookOpen, setLogCookOpen] = useState(false);
  const [logCookToast, setLogCookToast] = useState<string | null>(null);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(false);

  const [incomingToast, setIncomingToast] = useState<string | null>(toastMessage ?? null);
  useEffect(() => {
    if (!toastMessage) return;
    setIncomingToast(toastMessage);
    const t = setTimeout(() => setIncomingToast(null), 1800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toastMessage]);

  useEffect(() => {
    let ignore = false;
    (async () => {
      try {
        const p = await getPlan(groupingId);
        if (ignore) return;
        if (!p) {
          setLoadError(`This ${kind} couldn't be found.`);
          setLoading(false);
          return;
        }
        setPlan(p);
        const initialExpanded = new Set<string>();
        p.parts.forEach((part) => {
          if (part.childDish) initialExpanded.add(part.id);
        });
        setExpandedDishes(initialExpanded);
        setLoading(false);
        if (p.kind === "dish") {
          const usage = await getMenusUsingDish(groupingId);
          if (!ignore) setMenusUsingDish(usage);
        }
      } catch {
        if (ignore) return;
        setLoadError(`Couldn't load this ${kind}.`);
        setLoading(false);
      }
    })();
    return () => {
      ignore = true;
    };
    // Screen instances are pushed fresh each time this screen is navigated to
    // (same convention as DishScreen/DishesMenusList) — intentionally run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-fetches after logging a new cook — the parts tree and menu-usage
  // warning can't change from logging a cook, so this is best-effort and
  // only refreshes plan.cooks in practice.
  async function refreshCooks() {
    try {
      const p = await getPlan(groupingId);
      if (p) setPlan(p);
    } catch {
      // best-effort refresh only — the sheet already confirmed the cook saved
    }
  }

  function toggleDish(partId: string) {
    setExpandedDishes((prev) => {
      const next = new Set(prev);
      if (next.has(partId)) next.delete(partId);
      else next.add(partId);
      return next;
    });
  }

  async function openRecipeTap(recipe: TappableRecipe) {
    if (recipe.inLibrary || promotedIds.has(recipe.id)) {
      const nav = await getRecipeForLibraryNav(recipe.id);
      if (nav) push({ name: "recipe", recipe: nav.recipe, categoryLabel: nav.categoryLabel, categoryKey: nav.categoryKey });
      return;
    }
    const preview = await getRecipePreview(recipe.id);
    if (!preview) return;
    setPreviewRecipe(preview);
    setPreviewRecipeId(recipe.id);
    setPreviewInspiredBy(recipe.inspiredByName);
    setPreviewOpen(true);
  }

  // SaveToSheet owns its own saving/error state and try/catch around this
  // call (see CookFeed.tsx's SaveToSheet) — this just does the RPC and
  // updates local state on success; a thrown error surfaces there as
  // "Try again", not here.
  async function handleAddToLibrary(categoryKey: string): Promise<void> {
    if (!promotingRecipeId) return;
    await addRecipeToLibrary(promotingRecipeId, categoryKey);
    const addedId = promotingRecipeId;
    setPromotedIds((prev) => {
      const next = new Set(prev);
      next.add(addedId);
      return next;
    });
    setPreviewOpen(false);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
    // recipe_saved — reuses the closest existing event type, same convention
    // as DishMenuPostDetailScreen's own grouping-save call (no
    // promote-to-library-specific event exists yet).
    logEvent("recipe_saved", { recipe_id: addedId, source: "plan_detail" });
  }

  function handleEdit() {
    push(kind === "dish" ? { name: "dishScreen", groupingId } : { name: "menuScreen", groupingId });
  }

  function handleCookLogged(message: string) {
    setLogCookOpen(false);
    setLogCookToast(message);
    setTimeout(() => setLogCookToast(null), 1800);
    refreshCooks();
  }

  async function handleDelete() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(false);
    const ok = await deleteGrouping(groupingId);
    if (!ok) {
      setDeleting(false);
      setDeleteError(true);
      return;
    }
    onDeleted(kind === "dish" ? "Dish deleted" : "Menu deleted");
  }

  function deleteBodyText(): string {
    if (kind === "menu" || menusUsingDish.length === 0) return "This can't be undone.";
    if (menusUsingDish.length === 1) {
      return `This dish is used in "${menusUsingDish[0].title || "Untitled menu"}". Deleting it will remove it from that menu too. This can't be undone.`;
    }
    return `This dish is used in ${menusUsingDish.length} menus. Deleting it will remove it from those menus too. This can't be undone.`;
  }

  const parts = plan?.parts ?? [];
  const coursesWithParts =
    kind === "menu"
      ? COURSES.map((c) => ({ ...c, items: parts.filter((p) => p.section === c.key) })).filter((c) => c.items.length > 0)
      : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BODY_BG, position: "relative" }}>
      <ScreenTitleHeader title={kind === "dish" ? "Dish Detail" : "Menu Detail"} onBack={back} />

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
      ) : loading || !plan ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT }}>Loading…</span>
        </div>
      ) : (
        <>
          <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 16px" }}>
            <div
              style={{
                fontFamily: FONT_SANS,
                fontSize: 24,
                fontWeight: 700,
                color: FOREST,
                lineHeight: 1.15,
                marginBottom: plan.inspiredByName ? 6 : 16,
              }}
            >
              {plan.title || (kind === "dish" ? "Untitled dish" : "Untitled menu")}
            </div>
            {plan.inspiredByName && (
              <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT, marginBottom: 16 }}>
                Inspired by {plan.inspiredByName}
              </div>
            )}

            {kind === "dish" ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
                  <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT }}>
                    Parts
                  </span>
                  <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>
                    {parts.length} {parts.length === 1 ? "part" : "parts"}
                  </span>
                </div>
                <div style={{ borderRadius: 22, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>
                  {parts.map((part, i) => (
                    <PlanPartRow
                      key={part.id}
                      part={part}
                      isLast={i === parts.length - 1}
                      isExpanded={expandedDishes.has(part.id)}
                      onToggleDish={() => toggleDish(part.id)}
                      onTapRecipe={openRecipeTap}
                      promotedIds={promotedIds}
                    />
                  ))}
                </div>
              </>
            ) : (
              coursesWithParts.map((c) => (
                <div key={c.key} style={{ marginBottom: 20 }}>
                  <div
                    style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 10 }}
                  >
                    {c.label}
                  </div>
                  <div style={{ borderRadius: 22, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>
                    {c.items.map((part, i) => (
                      <PlanPartRow
                        key={part.id}
                        part={part}
                        isLast={i === c.items.length - 1}
                        isExpanded={expandedDishes.has(part.id)}
                        onToggleDish={() => toggleDish(part.id)}
                        onTapRecipe={openRecipeTap}
                        promotedIds={promotedIds}
                      />
                    ))}
                  </div>
                </div>
              ))
            )}

            <div style={{ marginTop: 24 }}>
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 10 }}>
                Past cooks
              </div>
              {plan.cooks.length === 0 ? (
                <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>Not cooked yet.</div>
              ) : (
                <div style={{ borderRadius: 22, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>
                  {plan.cooks.map((cook, i) => (
                    <div
                      key={cook.postId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "14px 16px",
                        borderBottom: i === plan.cooks.length - 1 ? "none" : "1px solid rgba(35,60,0,0.08)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: 600, color: FOREST }}>{formatCookedOn(cook.cookedOn)}</span>
                        {cook.isPosted && (
                          <span
                            style={{
                              fontFamily: FONT_SANS,
                              fontSize: 9,
                              fontWeight: 600,
                              letterSpacing: "0.08em",
                              textTransform: "uppercase",
                              color: "#233C00",
                              background: "rgba(35,60,0,0.08)",
                              padding: "3px 6px",
                              borderRadius: 6,
                            }}
                          >
                            Posted
                          </span>
                        )}
                      </div>
                      {cook.score != null && (
                        <div style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 700, color: FOREST }}>
                          {cook.score.toFixed(1)}
                          <span style={{ color: MUTED_TEXT, fontWeight: 500 }}>/10</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setConfirmDeleteOpen(true)}
              style={{
                width: "100%",
                marginTop: 28,
                padding: "12px",
                background: "transparent",
                border: "none",
                color: "#B85C5C",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 500,
                textAlign: "center",
                cursor: "pointer",
              }}
            >
              Delete this {kind}
            </button>
          </div>

          <div style={{ flexShrink: 0, display: "flex", gap: 10, padding: "14px 20px 20px", borderTop: `1px solid ${CARD_BORDER}` }}>
            <button
              onClick={handleEdit}
              style={{
                flex: 1,
                padding: "15px 10px",
                borderRadius: 14,
                background: "transparent",
                border: `1.5px solid ${FOREST}`,
                color: FOREST,
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Edit
            </button>
            <button
              onClick={() => setLogCookOpen(true)}
              style={{
                flex: 2,
                padding: "15px 10px",
                borderRadius: 14,
                background: FOREST,
                border: "none",
                color: "#FAF7F2",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Log this cook
            </button>
          </div>
        </>
      )}

      <SavedToast show={justAdded} message="Added to your recipes" />
      <SavedToast show={!!logCookToast} message={logCookToast ?? undefined} />
      <SavedToast show={!!incomingToast} message={incomingToast ?? undefined} />

      {confirmDeleteOpen && (
        <div
          onClick={() => !deleting && setConfirmDeleteOpen(false)}
          style={{ position: "absolute", inset: 0, background: "rgba(35,60,0,0.25)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 90, padding: 24 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#FAF7F2", borderRadius: 16, padding: "24px 20px", width: "100%", maxWidth: 280, display: "flex", flexDirection: "column", gap: 8, border: "0.5px solid rgba(35,60,0,0.1)" }}
          >
            <div style={{ fontFamily: FONT_SANS, fontSize: 16, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: FOREST, textAlign: "center" }}>
              Delete this {kind}?
            </div>
            <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: FOREST, textAlign: "center", marginBottom: 12 }}>{deleteBodyText()}</div>
            {deleteError && (
              <div style={{ fontFamily: FONT_SANS, fontSize: 12, color: "#B85C5C", textAlign: "center", marginBottom: 4 }}>
                Couldn't delete this {kind}. Try again.
              </div>
            )}
            <button
              onClick={() => {
                setConfirmDeleteOpen(false);
                setDeleteError(false);
              }}
              disabled={deleting}
              style={{ width: "100%", padding: "12px", borderRadius: 10, background: "transparent", border: "0.5px solid rgba(35,60,0,0.1)", color: FOREST, fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, cursor: deleting ? "default" : "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              style={{ width: "100%", padding: "12px", borderRadius: 10, background: "#B85C5C", border: "none", color: "#FAF7F2", fontFamily: FONT_SANS, fontSize: 13, fontWeight: 500, cursor: deleting ? "default" : "pointer" }}
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}

      {logCookOpen && (
        <LogGroupingCookSheet
          groupingId={groupingId}
          planTitle={plan?.title || (kind === "dish" ? "Untitled dish" : "Untitled menu")}
          partCount={parts.length}
          onClose={() => setLogCookOpen(false)}
          onLogged={handleCookLogged}
        />
      )}

      <ExpandedRecipeOverlay
        open={previewOpen}
        bottomOffset={0}
        recipe={{
          title: previewRecipe?.title ?? "",
          description: previewRecipe?.description ?? "",
          ingredients: previewRecipe?.ingredients ?? [],
          steps: previewRecipe?.steps ?? [],
        }}
        cookTime={previewRecipe?.cookTime}
        serves={previewRecipe?.serves}
        sharerName={previewInspiredBy ?? undefined}
        saveLabel="Add to my recipes"
        onSave={() => {
          setPromotingRecipeId(previewRecipeId);
          setTrayOpen(true);
        }}
        onBack={() => setPreviewOpen(false)}
      />

      {trayOpen && (
        <SaveToSheet
          kind="recipe"
          onClose={() => setTrayOpen(false)}
          onSave={handleAddToLibrary}
          onNew={() => {
            setTrayOpen(false);
            push({ name: "newcategoryforplandetail", groupingId, kind, recipeId: promotingRecipeId! });
          }}
          initialSelectedCategory={newCategory || null}
        />
      )}
    </div>
  );
}

// One row of a dish/menu's parts list — visually matches MenuScreen's
// MenuPartRow / CookFeed's SnapshotPartRow (same icons/tags/nesting
// treatment) but reads the live PlanPart tree, and branches a recipe tap on
// recipe.inLibrary (+ this session's promotedIds) instead of always
// navigating straight into the recipe screen.
function PlanPartRow({
  part,
  isLast,
  isExpanded,
  onToggleDish,
  onTapRecipe,
  promotedIds,
}: {
  part: PlanPart;
  isLast: boolean;
  isExpanded: boolean;
  onToggleDish: () => void;
  onTapRecipe: (recipe: TappableRecipe) => void;
  promotedIds: Set<string>;
}) {
  const isRecipe = !!part.recipe;
  const isDish = !!part.childDish;
  const onTap = isRecipe ? () => onTapRecipe(part.recipe as TappableRecipe) : isDish ? onToggleDish : undefined;
  const recipeInLibrary = (r: TappableRecipe) => r.inLibrary || promotedIds.has(r.id);

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid rgba(35,60,0,0.08)" }}>
      <div
        onClick={onTap}
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 10px 14px 16px", cursor: onTap ? "pointer" : "default" }}
      >
        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", width: 24 }}>
          {isRecipe ? (
            <IconBook size={20} stroke={1.5} color={FOREST} />
          ) : isDish ? (
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
              fontWeight: isRecipe ? 700 : isDish ? 600 : 400,
              color: FOREST,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {isRecipe ? part.recipe!.title : isDish ? part.childDish!.title || "Untitled dish" : part.freeformText}
          </div>
          <div
            style={{ fontFamily: FONT_SANS, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED_TEXT, marginTop: 3 }}
          >
            {isRecipe
              ? recipeInLibrary(part.recipe as TappableRecipe)
                ? "Saved recipe"
                : "Not yet in your recipes"
              : isDish
              ? `Dish · ${part.childDish!.parts.length} ${part.childDish!.parts.length === 1 ? "part" : "parts"}`
              : "Other"}
          </div>
        </div>
        {(isRecipe || isDish) && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: isDish && isExpanded ? "rotate(90deg)" : "none",
              transition: "transform 0.15s ease",
            }}
          >
            <IconChevronRight size={18} stroke={1.75} color={MUTED_TEXT} />
          </div>
        )}
      </div>

      {isDish && isExpanded && (
        <div style={{ padding: "0 16px 14px 48px" }}>
          <div style={{ borderLeft: "1.5px solid rgba(35,60,0,0.12)", paddingLeft: 14 }}>
            {part.childDish!.parts.map((np) => {
              const npRecipe = !!np.recipe;
              return (
                <div
                  key={np.id}
                  onClick={npRecipe ? () => onTapRecipe(np.recipe as TappableRecipe) : undefined}
                  style={{ padding: "6px 0", cursor: npRecipe ? "pointer" : "default" }}
                >
                  <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: npRecipe ? 700 : 400, color: FOREST }}>
                    {npRecipe ? np.recipe!.title : np.freeformText}
                  </div>
                  <div style={{ fontFamily: FONT_SANS, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: MUTED_TEXT, marginTop: 2 }}>
                    {npRecipe ? (recipeInLibrary(np.recipe as TappableRecipe) ? "Saved recipe" : "Not yet in your recipes") : "Other"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
