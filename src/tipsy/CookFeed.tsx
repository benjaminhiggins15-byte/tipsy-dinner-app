import { useState, useEffect } from "react";
import { IconRefresh } from "@tabler/icons-react";
import {
  getCookFeed,
  getCookPost,
  COOK_FEED_PAGE_SIZE,
  type CookFeedPost,
  type CookPostDetail,
} from "./data";
import ExpandedRecipeOverlay from "./ExpandedRecipeOverlay";

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

// Only screen this file ever pushes — kept narrow and structurally
// compatible with the real App-level Screen union, same convention as
// MenuInterior's own local Screen type.
type Screen = { name: "cookPostDetail"; postId: string };

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
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
      <span style={{ fontFamily: fontSans, fontSize: 14, fontWeight: 400, color: C.text, lineHeight: 1.35 }}>
        <span style={{ fontWeight: 600 }}>{post.poster_display_name}</span> cooked{" "}
        <span style={{ fontWeight: 600 }}>{post.recipe_title}</span>
      </span>
      <span style={{ fontFamily: fontSans, fontSize: 11, fontWeight: 500, color: C.textFaint, flexShrink: 0, whiteSpace: "nowrap" }}>
        {formatRelativeTime(post.created_at)}
      </span>
    </div>
  );
}

function NoteLine({ text }: { text: string }) {
  return (
    <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontWeight: 300, fontSize: 14, color: "rgba(35,60,0,0.6)", lineHeight: 1.5, marginTop: 10 }}>
      {text}
    </div>
  );
}

function CookFeedCard({ post, onTap }: { post: CookFeedPost; onTap: () => void }) {
  const hasNote = !!(post.note && post.note.trim().length > 0);

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
      {post.photo_source === "cook" && post.photo_url ? (
        <>
          <Headline post={post} />
          <div style={{
            width: "100%",
            aspectRatio: "4 / 3",
            borderRadius: 10,
            overflow: "hidden",
            background: "rgba(35,60,0,0.06)",
            marginTop: 12,
          }}>
            <img src={post.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
        </>
      ) : post.photo_source === "recipe" && post.photo_url ? (
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "rgba(35,60,0,0.06)" }}>
            <img src={post.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Headline post={post} />
          </div>
        </div>
      ) : (
        <Headline post={post} />
      )}
      {hasNote && <NoteLine text={post.note as string} />}
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
                onTap={() => push({ name: "cookPostDetail", postId: post.post_id })}
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
  back,
}: {
  postId: string;
  back: () => void;
}) {
  const [detail, setDetail] = useState<CookPostDetail | null | undefined>(undefined);

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

  const snapshot = detail.recipe_snapshot;
  const recipe = {
    title: snapshot.title,
    description: snapshot.description,
    ingredients: snapshot.ingredients.map((ing) => ({ name: ing.name, qty: ing.quantity })),
    steps: snapshot.steps,
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
      />
    </div>
  );
}
