import { useState, useEffect } from "react";
import { IconRefresh, IconBook, IconLayoutList, IconChevronRight } from "@tabler/icons-react";
import {
  getCookFeed,
  getCookPost,
  saveFeedRecipe,
  addRecipeToMenuSection,
  COOK_FEED_PAGE_SIZE,
  type CookFeedPost,
  type CookPostDetail,
  type GroupingPartSnapshot,
  type RecipeSendSnapshot,
  type Recipe,
  type MenuSection,
} from "./data";
import { logEvent } from "../lib/events";
import ExpandedRecipeOverlay from "./ExpandedRecipeOverlay";
import SaveRecipeFlow from "./SaveRecipeFlow";
import { Avatar } from "./Profile";
import { DishIcon } from "./LogCookTypePicker";
import { FONT_SANS, FONT_SERIF_ITALIC, FOREST, CARD_BG, CARD_BORDER, MUTED_TEXT, BODY_BG } from "./DishScreen";

// Cook Feed — Step 2b (the screen itself). Reads ONLY through get_cook_feed/
// get_cook_post (see CLAUDE.md's Cooking Feed — Step 2a entry); this file
// never touches cook_posts/cook_events/recipes directly. Sibling of
// RecipeCard/Cook History's card styling (hand-matched, not shared) — see
// CLAUDE.md's "sibling, not fused" convention. The tap-through detail view
// DOES reuse ExpandedRecipeOverlay directly, same as Home's
// DiscoveredDetailView, since that's the better-fit precedent here (no
// hand-matched recipe-reader markup to maintain twice).

const C = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.4)",
  textFaint: "rgba(35,60,0,0.35)",
  border: "rgba(35,60,0,0.08)",
  cardBg: "rgba(35,60,0,0.03)",
};

const fontSans = "Inter, sans-serif";
const fontSerif = "Fraunces, serif";

// Cache/pagination state lifted to App-level (mirrors recipesByCategory/
// ensureRecipesLoaded) so the ScreenStage remount-on-transition pattern
// (see CLAUDE.md's Architecture / SSR section) never causes a double-fetch
// or an empty-state flash when this screen is the outgoing "from" layer
// during a navigation transition.
export type CookFeedState = {
  posts: CookFeedPost[];
  loaded: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  error: boolean;
  ensureLoaded: () => Promise<void>;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
};

// Only screens this file ever pushes — kept narrow and structurally
// compatible with the real App-level Screen union, same convention as
// MenuInterior's own local Screen type.
type Screen =
  | { name: "cookPostDetail"; postId: string; newCategory?: { key: string; label: string } }
  | { name: "newcategoryforcookpost"; postId: string }
  | { name: "dishMenuPostDetail"; postId: string }
  | { name: "placeholder"; title: string; kind?: "dish" | "menu"; recipeId?: string; groupingId?: string; postId?: string };

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

function formatRelativeTime(isoString: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(isoString).getTime());
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(days / 365)}y`;
}

function Headline({ post }: { post: CookFeedPost }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
      <span style={{
        fontFamily: fontSans, fontSize: 14, fontWeight: 400, color: C.text, lineHeight: 1.35,
        display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
      }}>
        <span style={{ fontWeight: 600 }}>{post.poster_display_name}</span> cooked{" "}
        <span style={{ fontWeight: 600 }}>{post.grouping_title}</span>
      </span>
      <span style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 11, fontWeight: 400, color: C.textFaint, flexShrink: 0, whiteSpace: "nowrap" }}>
        {formatRelativeTime(post.created_at)}
      </span>
    </div>
  );
}

const TYPE_LABEL: Record<CookFeedPost["grouping_kind"], string> = {
  recipe: "RECIPE",
  dish: "DISH",
  menu: "MENU",
};

// Quoted so it reads unambiguously as the poster's own words, never
// confusable with the recipe's own (frozen, AI/author-written) description
// rendered right above it in CookFeedCard — the two are otherwise the same
// italic Fraunces "personal voice" styling used for notes everywhere else in
// the app (e.g. Cook History's own note render in App.tsx). Spacing/divider
// that separates it from the description is the card's job, not this
// component's — kept margin-free so callers control that.
function NoteLine({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontWeight: 300, fontSize: 14, color: "rgba(35,60,0,0.6)", lineHeight: 1.5 }}>
      “{text}”
    </div>
  );
}

// Single layout for every post (compact/thumbnail layout dropped per founder
// direction — image-forward, Strava-like, resembling the top half of
// RecipeCard/ExpandedRecipeOverlay's own header: title line, optional large
// photo, italic description, optional inspired-by credit). photo_source no
// longer branches the layout — a cook-sourced and a recipe-sourced photo now
// render identically, large; only "no photo at all" renders no photo block.
//
// No inspired-by credit is rendered: CookFeedPost has no such field, because
// the frozen grouping_snapshot it's extracted from never carried one for the
// recipe-kind case either.
function CookFeedCard({ post, onTap }: { post: CookFeedPost; onTap: () => void }) {
  const hasNote = !!(post.note && post.note.trim().length > 0);
  const hasPhoto = !!post.photo_url;

  // Recipe posts keep today's frozen description; dish/menu posts have no
  // single description, so the body text is instead a parts preview joined
  // with " · ", with "+ N more" appended when parts_remaining > 0 — the
  // server (get_cook_feed, parts_preview/parts_remaining columns) already
  // applies the dish-vs-menu label/count rules, this just renders them.
  const bodyText =
    post.grouping_kind === "recipe"
      ? post.grouping_description
      : post.parts_preview && post.parts_preview.length > 0
        ? post.parts_preview.join(" · ") + (post.parts_remaining ? ` + ${post.parts_remaining} more` : "")
        : null;
  const hasBodyText = !!(bodyText && bodyText.trim().length > 0);

  return (
    <button
      onClick={onTap}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: 14,
        padding: 14,
        cursor: "pointer",
      }}
    >
      <div style={{
        fontFamily: fontSans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.08em",
        textTransform: "uppercase", color: C.textMuted, marginBottom: 6,
      }}>
        {TYPE_LABEL[post.grouping_kind]}
      </div>

      <Headline post={post} />

      {post.photo_url && (
        <div style={{
          width: "100%",
          aspectRatio: "4 / 3",
          borderRadius: 20,
          overflow: "hidden",
          background: "rgba(35,60,0,0.06)",
          marginTop: 12,
        }}>
          <img src={post.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </div>
      )}

      {hasBodyText && (
        <div style={{
          fontFamily: fontSerif,
          fontStyle: "italic",
          fontWeight: 300,
          fontSize: 15,
          color: "rgba(35,60,0,0.55)",
          lineHeight: 1.5,
          marginTop: 12,
          display: "-webkit-box",
          WebkitLineClamp: hasPhoto ? 2 : 3,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
        }}>
          {bodyText}
        </div>
      )}

      {hasNote && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px dotted ${C.border}` }}>
          <NoteLine text={post.note as string} />
        </div>
      )}
    </button>
  );
}

export function CookFeedScreen({
  state,
  back,
  push,
  isTabRoot,
}: {
  state: CookFeedState;
  back: () => void;
  push: (s: Screen) => void;
  isTabRoot: boolean;
}) {
  useEffect(() => {
    if (!state.loaded) {
      state.ensureLoaded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.loaded]);

  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    await state.refresh();
    setRefreshing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Header — mirrors AllRecipes/Categories header styling */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {!isTabRoot && (
            <button
              onClick={back}
              aria-label="Back"
              style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          )}
          <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: C.text }}>
            Cook Feed
          </div>
        </div>
        <button
          onClick={handleRefresh}
          aria-label="Refresh feed"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <IconRefresh size={18} stroke={1.5} color="rgba(35,60,0,0.5)" style={{ animation: refreshing ? "spin 800ms linear infinite" : undefined }} />
        </button>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 24px" }}>
        {state.error && state.posts.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 14, color: C.textMuted, marginBottom: 14 }}>
              Couldn't load the feed — check your connection and try again.
            </div>
            <button
              onClick={handleRefresh}
              style={{
                background: "transparent",
                border: `1px solid rgba(35,60,0,0.25)`,
                borderRadius: 16,
                padding: "8px 16px",
                fontFamily: fontSans,
                fontSize: 12,
                fontWeight: 500,
                color: C.text,
                cursor: "pointer",
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!state.error && state.loaded && state.posts.length === 0 && (
          <div style={{
            fontFamily: fontSerif,
            fontStyle: "italic",
            fontSize: 14,
            color: C.textMuted,
            textAlign: "center",
            padding: "60px 20px",
            lineHeight: 1.6,
          }}>
            No cooks posted yet — log a cook and post it publicly to start the feed.
          </div>
        )}

        {!state.loaded && !state.error && state.posts.length === 0 && (
          <div style={{ fontFamily: fontSans, fontSize: 13, color: C.textMuted, textAlign: "center", padding: "60px 20px" }}>
            Loading…
          </div>
        )}

        {state.posts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {state.posts.map((post) => (
              <CookFeedCard
                key={post.post_id}
                post={post}
                onTap={() => {
                  if (post.grouping_kind === "recipe") {
                    push({ name: "cookPostDetail", postId: post.post_id });
                  } else {
                    push({ name: "dishMenuPostDetail", postId: post.post_id });
                  }
                }}
              />
            ))}
          </div>
        )}

        {state.posts.length > 0 && state.hasMore && (
          <div style={{ textAlign: "center", marginTop: 16 }}>
            <button
              onClick={() => state.loadMore()}
              disabled={state.loadingMore}
              style={{
                background: "transparent",
                border: `1px solid rgba(35,60,0,0.25)`,
                borderRadius: 16,
                padding: "8px 18px",
                fontFamily: fontSans,
                fontSize: 12,
                fontWeight: 500,
                color: C.text,
                cursor: state.loadingMore ? "default" : "pointer",
                opacity: state.loadingMore ? 0.6 : 1,
              }}
            >
              {state.loadingMore ? "Loading…" : "Load more"}
            </button>
          </div>
        )}

        {state.posts.length > 0 && !state.hasMore && (
          <div style={{ fontFamily: fontSans, fontSize: 11, color: C.textFaint, textAlign: "center", marginTop: 20 }}>
            You're all caught up.
          </div>
        )}
      </div>
    </div>
  );
}

export function CookPostDetailScreen({
  postId,
  newCategory,
  currentUserId,
  back,
  push,
  finishSaveRecipe,
  clearRecipeCache,
}: {
  postId: string;
  newCategory?: { key: string; label: string };
  // Null is a valid, expected state (not yet resolved) — treated the same as
  // "not the poster" so the Save button never shows before identity is known.
  currentUserId: string | null;
  back: () => void;
  push: (s: Screen) => void;
  finishSaveRecipe: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void;
  clearRecipeCache: (categoryKey: string) => void;
}) {
  const [detail, setDetail] = useState<CookPostDetail | null | undefined>(undefined);
  // Mirrors DiscoveredDetailView's pattern exactly (Home.tsx) — trayOpen
  // starts true when re-entering with a freshly created category.
  const [trayOpen, setTrayOpen] = useState(!!newCategory);
  const [saving, setSaving] = useState(false);
  // Set when saveFeedRecipe's call chain throws — surfaces a retryable error
  // instead of leaving the Save button silently stuck (saveRecipe has no
  // try/catch anywhere upstream of here, so this is the only place it can be
  // caught). Cleared on every new save attempt.
  const [saveError, setSaveError] = useState(false);
  // Local-only, per-mount — a disabled "Saved" state is enough to block a
  // double-tap/repeat-tap from creating duplicate recipe copies (see
  // saveFeedRecipe's duplicate-save note in data.ts: nothing server-side
  // blocks a repeat save, so this is the only guard). Deliberately NOT
  // persisted — re-entering this screen (e.g. back then forward again) always
  // starts fresh, independent of save_grouping_from_post's own save history
  // for this post.
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const result = await getCookPost(postId);
      if (!ignore) setDetail(result);
    })();
    return () => {
      ignore = true;
    };
  }, [postId]);

  if (detail === undefined) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: fontSans, fontSize: 13, color: C.textMuted }}>Loading…</div>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
        <div style={{ padding: "20px 16px 12px" }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 14, color: C.textMuted, textAlign: "center" }}>
            This post isn't available anymore.
          </div>
        </div>
      </div>
    );
  }

  // Recipe-kind (n=1) scope only for this cutover step — grouping_snapshot's
  // parts can in principle hold a dish/menu shape with no single recipe, but
  // there's no UI for that yet (see CLAUDE.md's Cooking Feed v1.5 entry), so
  // this screen still only ever expects parts[0].recipe to be set.
  const snapshot = detail.grouping_snapshot.parts[0]?.recipe;
  if (!snapshot) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 14, color: C.textMuted, textAlign: "center", padding: 24 }}>
          This post isn't available yet.
        </div>
      </div>
    );
  }
  const recipe = {
    title: snapshot.title,
    description: snapshot.description,
    ingredients: snapshot.ingredients.map((ing) => ({ name: ing.name, qty: ing.quantity })),
    steps: snapshot.steps,
  };

  // Founder decision: saving your own post is hidden entirely, not just
  // disabled. currentUserId === null (identity not yet resolved) also hides
  // it — fail toward not-shown rather than briefly flashing a Save button a
  // poster could tap on their own post.
  const isOwnPost = currentUserId === null || currentUserId === detail.poster_id;

  const handlePickCategory = async (
    catKey: string,
    catLabel: string,
    menuInfo?: { menuId: string; section: MenuSection }
  ) => {
    setTrayOpen(false);
    setSaving(true);
    setSaveError(false);

    try {
      const result = await saveFeedRecipe(postId, detail.photo_url, catKey);

      if (menuInfo) {
        await addRecipeToMenuSection(menuInfo.menuId, menuInfo.section, result.recipeId);
      }

      setSaved(true);

      const savedRecipe: Recipe = {
        title: snapshot.title,
        description: snapshot.description,
        color: "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
        category: catLabel.toLowerCase(),
        ingredients: recipe.ingredients,
        steps: snapshot.steps,
        savedId: result.recipeId,
        categoryKey: catKey,
        // Only set when the photo copy succeeded — a photoless post or a
        // failed copy both leave this undefined, same convention as the
        // received/discovered save flows.
        photo_url: result.photoCopied ? result.photoUrl : undefined,
        photo_version: result.photoCopied ? result.photoVersion : undefined,
      };

      clearRecipeCache(catKey);
      // recipe_saved — cook feed post saved to the library
      logEvent("recipe_saved", { recipe_id: result.recipeId, source: "cook_feed" });
      finishSaveRecipe(savedRecipe, catKey, catLabel);
    } catch (error) {
      console.error("Couldn't save this cook feed recipe:", error);
      setSaving(false);
      setSaveError(true);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, position: "relative" }}>
      <ExpandedRecipeOverlay
        open={true}
        bottomOffset={0}
        recipe={recipe}
        sharerName={detail.poster_display_name}
        sharerLabel="cooked by"
        photoUrl={detail.photo_url ?? undefined}
        onBack={back}
        onSave={isOwnPost ? undefined : saved ? () => {} : saving ? undefined : () => setTrayOpen(true)}
        saveLabel={saved ? "Saved" : "Save"}
        saveDisabled={saved}
      />

      {trayOpen && (
        <SaveRecipeFlow
          onClose={() => setTrayOpen(false)}
          onPick={handlePickCategory}
          onNew={() => {
            setTrayOpen(false);
            push({ name: "newcategoryforcookpost", postId });
          }}
          initialSelectedCategory={newCategory || null}
        />
      )}

      {saveError && (
        <div
          style={{
            position: "fixed",
            left: 16,
            right: 16,
            bottom: 24,
            zIndex: 60,
            background: "#c0392b",
            color: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            fontFamily: fontSans,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Couldn't save this recipe — please try again.
        </div>
      )}
    </div>
  );
}

// One row of a dish/menu post's parts list — visually matches MenuScreen's
// MenuPartRow (same icons/tags/nesting treatment) but reads a frozen
// GroupingPartSnapshot instead of the editable MenuPart the editor screens
// use, since this is a read-only "as posted" view, not an edit surface.
function SnapshotPartRow({
  part,
  isLast,
  isExpanded,
  onToggleDish,
  onTapRecipe,
}: {
  part: GroupingPartSnapshot;
  isLast: boolean;
  isExpanded: boolean;
  onToggleDish: () => void;
  onTapRecipe: (recipe: RecipeSendSnapshot) => void;
}) {
  const isRecipe = !!part.recipe;
  const isDish = !!part.dish;
  const onTap = isRecipe ? () => onTapRecipe(part.recipe as RecipeSendSnapshot) : isDish ? onToggleDish : undefined;

  return (
    <div style={{ borderBottom: isLast ? "none" : "1px solid rgba(35,60,0,0.08)" }}>
      <div
        onClick={onTap}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "14px 10px 14px 16px",
          cursor: onTap ? "pointer" : "default",
        }}
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
            {isRecipe ? part.recipe!.title : isDish ? part.dish!.title : part.freeform_text}
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
            {isRecipe
              ? "Saved recipe"
              : isDish
              ? `Dish · ${part.dish!.parts.length} ${part.dish!.parts.length === 1 ? "part" : "parts"}`
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
            {part.dish!.parts.map((np, i) => {
              const npRecipe = !!np.recipe;
              return (
                <div
                  key={i}
                  onClick={npRecipe ? () => onTapRecipe(np.recipe as RecipeSendSnapshot) : undefined}
                  style={{ padding: "6px 0", cursor: npRecipe ? "pointer" : "default" }}
                >
                  <div style={{ fontFamily: FONT_SANS, fontSize: 13, fontWeight: npRecipe ? 700 : 400, color: FOREST }}>
                    {npRecipe ? np.recipe!.title : np.freeform_text}
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
                    {npRecipe ? "Saved recipe" : "Other"}
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

// Dishes & Menus v1.5 step 4b — the real dish/menu post detail screen,
// replacing step 4a's placeholder for the dish/menu card tap. Reads the
// same frozen grouping_snapshot getCookPost already returns (no new data
// path). Recipe posts keep CookPostDetailScreen/ExpandedRecipeOverlay above
// unchanged; this screen hand-matches DishScreen/MenuScreen's card/row
// styling (shared tokens imported, not re-declared) rather than reusing
// their components directly, since those are editable-plan components and
// this is a read-only "as posted" view — same "sibling, not fused"
// convention as this file's own card vs. RecipeCard.
export function DishMenuPostDetailScreen({
  postId,
  currentUserId,
  back,
  push,
}: {
  postId: string;
  // Null is a valid, expected state (not yet resolved) — treated the same as
  // "not the poster" so the Save button never shows before identity is known,
  // same convention as CookPostDetailScreen above.
  currentUserId: string | null;
  back: () => void;
  push: (s: Screen) => void;
}) {
  const [detail, setDetail] = useState<CookPostDetail | null | undefined>(undefined);
  // Keyed on each part's index within the top-level grouping_snapshot.parts
  // array (snapshot parts carry no id) — dish rows start expanded by default
  // per spec, collapsed by removing their index from this set.
  const [expandedDishes, setExpandedDishes] = useState<Set<number>>(new Set());
  // Recipe tap-through — kept separate from `overlayOpen` so the overlay's
  // own close (slide-out) animation still has a recipe to render while it
  // plays; only the boolean toggles on tap/close, the data stays put.
  const [overlayRecipe, setOverlayRecipe] = useState<RecipeSendSnapshot | null>(null);
  const [overlayOpen, setOverlayOpen] = useState(false);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const result = await getCookPost(postId);
      if (ignore) return;
      setDetail(result);
      if (result) {
        const initial = new Set<number>();
        result.grouping_snapshot.parts.forEach((p, i) => {
          if (p.dish) initial.add(i);
        });
        setExpandedDishes(initial);
      }
    })();
    return () => {
      ignore = true;
    };
  }, [postId]);

  function toggleDish(idx: number) {
    setExpandedDishes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function openRecipeTap(recipe: RecipeSendSnapshot) {
    setOverlayRecipe(recipe);
    setOverlayOpen(true);
  }

  if (detail === undefined) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BODY_BG, alignItems: "center", justifyContent: "center" }}>
        <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: MUTED_TEXT }}>Loading…</div>
      </div>
    );
  }

  if (detail === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BODY_BG }}>
        <div style={{ padding: "20px 16px 12px" }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED_TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: MUTED_TEXT, textAlign: "center" }}>
            This post isn't available anymore.
          </div>
        </div>
      </div>
    );
  }

  const kind = detail.grouping_snapshot.kind === "dish" ? "dish" : "menu";
  const parts = detail.grouping_snapshot.parts;
  const isOwnPost = currentUserId === null || currentUserId === detail.poster_id;

  const dishItems = parts.map((part, idx) => ({ part, idx })).sort((a, b) => a.part.position - b.part.position);
  const coursesWithParts =
    kind === "menu"
      ? COURSES.map((c) => ({
          ...c,
          items: parts
            .map((part, idx) => ({ part, idx }))
            .filter(({ part }) => part.section === c.key)
            .sort((a, b) => a.part.position - b.part.position),
        })).filter((c) => c.items.length > 0)
      : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: BODY_BG, position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 20px 4px", flexShrink: 0 }}>
        <button
          onClick={back}
          aria-label="Back"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED_TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: FOREST }}>
          {kind === "dish" ? "Dish" : "Menu"}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: isOwnPost ? "12px 20px 24px" : "12px 20px 110px" }}>
        {detail.photo_url && (
          <div style={{ width: "100%", aspectRatio: "4 / 3", borderRadius: 22, overflow: "hidden", background: CARD_BG, marginBottom: 18 }}>
            <img src={detail.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        )}

        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 26,
            fontWeight: 700,
            color: FOREST,
            lineHeight: 1.15,
            marginBottom: 14,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {detail.grouping_snapshot.title}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: detail.note ? 14 : 18 }}>
          <Avatar size={34} name={detail.poster_display_name} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 600, color: FOREST }}>{detail.poster_display_name}</div>
            <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 12, color: MUTED_TEXT }}>
              Cooked {formatCookedOn(detail.cooked_on)}
            </div>
          </div>
          {detail.score != null && (
            <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, color: FOREST, flexShrink: 0 }}>
              {detail.score.toFixed(1)}
              <span style={{ color: MUTED_TEXT, fontWeight: 500 }}>/10</span>
            </div>
          )}
        </div>

        {detail.note && (
          <div
            style={{
              fontFamily: FONT_SERIF_ITALIC,
              fontStyle: "italic",
              fontWeight: 300,
              fontSize: 15,
              color: "rgba(35,60,0,0.55)",
              lineHeight: 1.5,
              marginBottom: 20,
            }}
          >
            “{detail.note}”
          </div>
        )}

        {kind === "dish" ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontFamily: FONT_SANS, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT }}>
                Parts
              </span>
              <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>
                {dishItems.length} {dishItems.length === 1 ? "part" : "parts"}
              </span>
            </div>
            <div style={{ borderRadius: 22, background: CARD_BG, border: `1px solid ${CARD_BORDER}`, overflow: "hidden" }}>
              {dishItems.map(({ part, idx }, i) => (
                <SnapshotPartRow
                  key={idx}
                  part={part}
                  isLast={i === dishItems.length - 1}
                  isExpanded={expandedDishes.has(idx)}
                  onToggleDish={() => toggleDish(idx)}
                  onTapRecipe={openRecipeTap}
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
                {c.items.map(({ part, idx }, i) => (
                  <SnapshotPartRow
                    key={idx}
                    part={part}
                    isLast={i === c.items.length - 1}
                    isExpanded={expandedDishes.has(idx)}
                    onToggleDish={() => toggleDish(idx)}
                    onTapRecipe={openRecipeTap}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {!isOwnPost && (
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              position: "absolute",
              top: -28,
              left: 0,
              right: 0,
              height: 28,
              background: `linear-gradient(to bottom, rgba(250,247,242,0), ${BODY_BG})`,
              pointerEvents: "none",
            }}
          />
          <div style={{ padding: "0 20px 20px", background: BODY_BG }}>
            <button
              onClick={() =>
                push({
                  name: "placeholder",
                  title: kind === "dish" ? "Save dish" : "Save menu",
                  kind,
                  postId,
                })
              }
              style={{
                display: "block",
                width: "100%",
                height: 56,
                borderRadius: 100,
                background: FOREST,
                color: "#FAF7F2",
                border: "none",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                cursor: "pointer",
              }}
            >
              {kind === "dish" ? "Save dish" : "Save menu"}
            </button>
          </div>
        </div>
      )}

      <ExpandedRecipeOverlay
        open={overlayOpen}
        bottomOffset={0}
        recipe={{
          title: overlayRecipe?.title ?? "",
          description: overlayRecipe?.description ?? "",
          ingredients: (overlayRecipe?.ingredients ?? []).map((ing) => ({ name: ing.name, qty: ing.quantity })),
          steps: overlayRecipe?.steps ?? [],
        }}
        cookTime={overlayRecipe?.cook_time}
        serves={overlayRecipe?.serves}
        onBack={() => setOverlayOpen(false)}
      />
    </div>
  );
}
