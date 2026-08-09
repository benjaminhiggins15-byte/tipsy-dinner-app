import { useState, useEffect } from "react";
import { getPendingReceivedRecipes, normalizeStep, type PendingReceivedRecipe } from "./data";
import watermarkSquare from "../Logos/watermark_square.png";

type HomePush = (s: { name: "receivedPending"; items: PendingReceivedRecipe[] } | { name: "receivedRecipe"; item: PendingReceivedRecipe }) => void;

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  display_name: string;
  handle: string;
  onboarding_complete: boolean;
};

const C = {
  bg: "#FAF7F2",
  text: "#233C00",
  textLight: "rgba(35,60,0,0.6)",
};

const fontDisplay = "'Fraunces', serif";
const fontSans = "'Inter', sans-serif";

const TILE_WIDTH = 190;
const TILE_HEIGHT = 142;
const EDGE = 20;

function greetingForNow(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// Photoless tile fallback — the app's watermark icon on the card-green
// background. A cream-on-watermark version was tried and judged worse on
// phone; open item to revisit later, not a settled pattern either way.
function PlaceholderArt() {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#2E4E08",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img src={watermarkSquare} alt="" style={{ width: 40, height: 40, opacity: 0.5 }} />
    </div>
  );
}

function ReceivedTile({
  item,
  onOpen,
}: {
  item: PendingReceivedRecipe;
  onOpen: (item: PendingReceivedRecipe) => void;
}) {
  return (
    <div
      onClick={() => onOpen(item)}
      style={{
        position: "relative",
        width: TILE_WIDTH,
        height: TILE_HEIGHT,
        minWidth: TILE_WIDTH,
        borderRadius: 20,
        overflow: "hidden",
        cursor: "pointer",
        flexShrink: 0,
        background: "#2E4E08",
      }}
    >
      {item.photoUrl ? (
        <div
          style={{
            position: "absolute",
            inset: -10,
            backgroundImage: `url(${item.photoUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(6px)",
            transform: "scale(1.1)",
          }}
        />
      ) : (
        <PlaceholderArt />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(0deg, rgba(24,40,0,0.85) 0%, rgba(24,40,0,0.15) 55%, rgba(24,40,0,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div
          style={{
            fontFamily: "Lazydog, sans-serif",
            textTransform: "uppercase",
            fontSize: 14,
            lineHeight: 1.2,
            color: "#FEE7C0",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(254,231,192,0.75)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          from {item.senderName}
        </div>
      </div>
    </div>
  );
}

export default function Home({
  profile,
  push,
}: {
  profile: ProfileType | null;
  push: HomePush;
}) {
  const [pending, setPending] = useState<PendingReceivedRecipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    (async () => {
      const items = await getPendingReceivedRecipes();
      if (ignore) return;
      setPending(items);
      setLoading(false);
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const firstName = profile?.display_name?.split(" ")[0] || profile?.display_name || "";
  const visible = pending.slice(0, 4);
  const hasMore = pending.length > 4;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      <div style={{ padding: `28px ${EDGE}px 8px`, flexShrink: 0 }}>
        <div
          style={{
            fontFamily: fontDisplay,
            fontStyle: "italic",
            fontSize: 22,
            color: C.text,
          }}
        >
          {greetingForNow()}{firstName ? `, ${firstName}` : ""}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 16 }}>
        {!loading && pending.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: `0 ${EDGE}px`,
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  fontFamily: fontSans,
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: C.text,
                }}
              >
                Received recipes
              </div>
              {hasMore && (
                <div
                  onClick={() => push({ name: "receivedPending", items: pending })}
                  style={{
                    fontFamily: fontSans,
                    fontSize: 12,
                    fontWeight: 500,
                    color: C.textLight,
                    cursor: "pointer",
                  }}
                >
                  View all ({pending.length})
                </div>
              )}
            </div>
            <div
              style={{
                display: "flex",
                gap: 12,
                overflowX: "auto",
                padding: `0 ${EDGE}px`,
              }}
            >
              {visible.map((item) => (
                <ReceivedTile key={item.sendId} item={item} onOpen={(i) => push({ name: "receivedRecipe", item: i })} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ReceivedPending({
  items,
  back,
  push,
}: {
  items: PendingReceivedRecipe[];
  back: () => void;
  push: HomePush;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      <div
        style={{
          padding: "16px 24px",
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button
          onClick={back}
          aria-label="Back"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.text,
          }}
        >
          Received recipes
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: `8px ${EDGE}px 16px`, display: "flex", flexDirection: "column", gap: 12 }}>
        {items.map((item) => (
          <div key={item.sendId} style={{ width: "100%" }}>
            <ReceivedTileFullWidth item={item} onOpen={(i) => push({ name: "receivedRecipe", item: i })} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceivedTileFullWidth({
  item,
  onOpen,
}: {
  item: PendingReceivedRecipe;
  onOpen: (item: PendingReceivedRecipe) => void;
}) {
  return (
    <div
      onClick={() => onOpen(item)}
      style={{
        position: "relative",
        width: "100%",
        height: TILE_HEIGHT,
        borderRadius: 20,
        overflow: "hidden",
        cursor: "pointer",
        background: "#2E4E08",
      }}
    >
      {item.photoUrl ? (
        <div
          style={{
            position: "absolute",
            inset: -10,
            backgroundImage: `url(${item.photoUrl})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            filter: "blur(6px)",
            transform: "scale(1.1)",
          }}
        />
      ) : (
        <PlaceholderArt />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(0deg, rgba(24,40,0,0.85) 0%, rgba(24,40,0,0.15) 55%, rgba(24,40,0,0) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 14,
          right: 14,
          bottom: 12,
          display: "flex",
          flexDirection: "column",
          gap: 3,
        }}
      >
        <div
          style={{
            fontFamily: "Lazydog, sans-serif",
            textTransform: "uppercase",
            fontSize: 15,
            lineHeight: 1.2,
            color: "#FEE7C0",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {item.title}
        </div>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 11,
            fontWeight: 500,
            color: "rgba(254,231,192,0.75)",
          }}
        >
          from {item.senderName}
        </div>
      </div>
    </div>
  );
}

type ReceivedTab = "ingredients" | "steps";

// Presentation below (hero/title/description/tabs/ingredient rows/step rows)
// deliberately mirrors RecipeCard's actual rendering (App.tsx) so a received
// recipe looks identical to one already living in the library — matched by
// hand, not by sharing the component (RecipeCard is a known-trouble file;
// see CLAUDE.md's Update vs Save-as-New section).
export function ReceivedRecipeView({
  item,
  back,
}: {
  item: PendingReceivedRecipe;
  back: () => void;
}) {
  const [tab, setTab] = useState<ReceivedTab>("ingredients");
  const [noteRevealed, setNoteRevealed] = useState(!item.note);
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set());

  const toggleStep = (idx: number) => {
    const next = new Set(expandedSteps);
    if (next.has(idx)) {
      next.delete(idx);
    } else {
      next.add(idx);
    }
    setExpandedSteps(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, position: "relative" }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "16px 24px",
          flexShrink: 0,
        }}
      >
        <button
          onClick={back}
          aria-label="Back"
          style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", justifySelf: "start" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: C.text,
            justifySelf: "center",
            whiteSpace: "nowrap",
          }}
        >
          Recipe Preview
        </div>
        <div />
      </div>

      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 96 }}>
        <div style={{ padding: "4px 24px 20px" }}>
          {/* Hero — renders only when there's a photo, matching RecipeCard:
              a photoless recipe shows no hero block at all. */}
          {item.photoUrl && (
            <div style={{ marginBottom: 18 }}>
              <div
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "4 / 3",
                  borderRadius: 30,
                  overflow: "hidden",
                  background: "rgba(35,60,0,0.06)",
                }}
              >
                <img
                  src={item.photoUrl}
                  alt=""
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            </div>
          )}

          <div style={{ marginBottom: 8 }}>
            <div
              style={{
                fontFamily: "Inter, sans-serif",
                fontStyle: "normal",
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "capitalize",
                color: "#233C00",
                lineHeight: 1.1,
              }}
            >
              {item.title}
            </div>
          </div>

          {item.description && (
            <div
              style={{
                fontFamily: "Fraunces, serif",
                fontStyle: "italic",
                fontWeight: 300,
                fontSize: 15,
                color: "rgba(35,60,0,0.55)",
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              {item.description}
            </div>
          )}

          <div
            style={{
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 500,
              color: "rgba(35,60,0,0.5)",
            }}
          >
            inspired by {item.senderName}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            padding: "20px 24px 0",
            flexShrink: 0,
            gap: 28,
            borderBottom: "1px solid rgba(35,60,0,0.08)",
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "#FAF7F2",
          }}
        >
          {(["ingredients", "steps"] as ReceivedTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                paddingBottom: 12,
                fontFamily: "Inter, sans-serif",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: tab === t ? "#233C00" : "rgba(35,60,0,0.3)",
                position: "relative",
                cursor: "pointer",
                background: "transparent",
                border: "none",
              }}
            >
              {t === "ingredients" ? "Ingredients" : "Steps"}
              {tab === t && (
                <div
                  style={{
                    position: "absolute",
                    bottom: -1,
                    left: 0,
                    right: 0,
                    height: 1.5,
                    background: "#233C00",
                    borderRadius: 2,
                  }}
                />
              )}
            </button>
          ))}
        </div>

        <div style={{ paddingTop: 4 }}>
          <div style={{ display: tab === "ingredients" ? "block" : "none" }}>
            {item.ingredients.map((ing, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: 8,
                  padding: "12px 24px",
                  borderBottom: idx === item.ingredients.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)",
                }}
              >
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 15,
                    fontWeight: 400,
                    color: "#233C00",
                    textAlign: "left",
                    flex: 1,
                    maxWidth: "58%",
                  }}
                >
                  {ing.name}
                </span>
                <span
                  style={{
                    fontFamily: "Inter, sans-serif",
                    fontSize: 14,
                    fontWeight: 500,
                    fontVariantNumeric: "tabular-nums",
                    color: "rgba(35,60,0,0.4)",
                    textAlign: "right",
                    flexShrink: 0,
                    maxWidth: "40%",
                  }}
                >
                  {ing.quantity}
                </span>
              </div>
            ))}
            {item.ingredients.length === 0 && (
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  color: "rgba(35,60,0,0.4)",
                  padding: "20px 24px",
                }}
              >
                No ingredients yet.
              </p>
            )}
          </div>
          <div style={{ display: tab === "steps" ? "block" : "none", padding: "20px 24px" }}>
            {item.steps.some((s) => !!normalizeStep(s).title.trim()) && (
              <div
                style={{
                  fontFamily: "Fraunces, serif",
                  fontStyle: "italic",
                  fontWeight: 300,
                  fontSize: 15,
                  color: "rgba(35,60,0,0.55)",
                  lineHeight: 1.5,
                  marginBottom: 18,
                }}
              >
                Tap each step for details
              </div>
            )}
            {item.steps.map((step, idx) => {
              const normalized = normalizeStep(step);
              const hasTitle = !!(normalized.title && normalized.title.trim().length > 0);
              const isExpanded = expandedSteps.has(idx);

              if (!hasTitle) {
                return (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      gap: 14,
                      alignItems: "flex-start",
                      marginBottom: idx === item.steps.length - 1 ? 0 : 20,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 18,
                        fontWeight: 500,
                        color: "rgba(35,60,0,0.3)",
                        flexShrink: 0,
                        lineHeight: 1.4,
                      }}
                    >
                      {idx + 1}
                    </span>
                    <p
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 14,
                        color: "#233C00",
                        lineHeight: 1.6,
                        margin: 0,
                      }}
                    >
                      {normalized.instruction}
                    </p>
                  </div>
                );
              }

              return (
                <div key={idx} style={{ marginBottom: idx === item.steps.length - 1 ? 0 : 10 }}>
                  <button
                    onClick={() => toggleStep(idx)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      padding: "12px 14px",
                      background: "rgba(35,60,0,0.03)",
                      border: "1px solid rgba(35,60,0,0.08)",
                      borderRadius: isExpanded ? "10px 10px 0 0" : 10,
                      borderBottom: isExpanded ? "none" : "1px solid rgba(35,60,0,0.08)",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Inter, sans-serif",
                        fontSize: 14,
                        fontWeight: 500,
                        color: "#233C00",
                        textAlign: "left",
                      }}
                    >
                      {idx + 1}) {normalized.title}
                    </span>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="rgba(35,60,0,0.25)"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{
                        transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 200ms ease",
                        flexShrink: 0,
                      }}
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                  {isExpanded && (
                    <div
                      style={{
                        background: "rgba(35,60,0,0.03)",
                        border: "1px solid rgba(35,60,0,0.08)",
                        borderTop: "none",
                        borderRadius: "0 0 10px 10px",
                        padding: "12px 14px",
                      }}
                    >
                      <p
                        style={{
                          fontFamily: "Inter, sans-serif",
                          fontSize: 14,
                          color: "#233C00",
                          lineHeight: 1.6,
                          margin: 0,
                        }}
                      >
                        {normalized.instruction}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
            {item.steps.length === 0 && (
              <p
                style={{
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  color: "rgba(35,60,0,0.4)",
                }}
              >
                No steps yet.
              </p>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          position: "fixed",
          bottom: 64,
          left: 0,
          right: 0,
          display: "flex",
          gap: 12,
          padding: `12px ${EDGE}px`,
          background: C.bg,
          borderTop: "1px solid rgba(35,60,0,0.08)",
          zIndex: 70,
        }}
      >
        <button
          onClick={() => console.log("dismiss stub", item.sendId)}
          style={{
            flex: 1,
            fontFamily: fontSans,
            fontSize: 14,
            fontWeight: 600,
            color: C.text,
            background: "transparent",
            border: "1.5px solid rgba(35,60,0,0.25)",
            borderRadius: 14,
            padding: "14px 0",
            cursor: "pointer",
          }}
        >
          Dismiss
        </button>
        <button
          onClick={() => console.log("save stub", item.sendId)}
          style={{
            flex: 2,
            fontFamily: fontSans,
            fontSize: 14,
            fontWeight: 600,
            color: "#FEE7C0",
            background: "#233C00",
            border: "none",
            borderRadius: 14,
            padding: "14px 0",
            cursor: "pointer",
          }}
        >
          Save to my library
        </button>
      </div>

      {item.note && !noteRevealed && (
        <ReceivedNoteOverlay
          senderName={item.senderName}
          note={item.note}
          onViewRecipe={() => setNoteRevealed(true)}
        />
      )}
    </div>
  );
}

function ReceivedNoteOverlay({
  senderName,
  note,
  onViewRecipe,
}: {
  senderName: string;
  note: string;
  onViewRecipe: () => void;
}) {
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 64,
        background: "rgba(35,60,0,0.08)",
        zIndex: 90,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 320,
          background: "#FAF7F2",
          borderRadius: 24,
          padding: "28px 24px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxShadow: "0 16px 40px rgba(24,40,0,0.25)",
        }}
      >
        <div
          style={{
            fontFamily: fontSans,
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            color: C.textLight,
          }}
        >
          {senderName} sent you this
        </div>
        <div
          style={{
            fontFamily: fontDisplay,
            fontStyle: "italic",
            fontSize: 17,
            lineHeight: 1.5,
            color: C.text,
          }}
        >
          {note}
        </div>
        <button
          onClick={onViewRecipe}
          style={{
            fontFamily: fontSans,
            fontSize: 14,
            fontWeight: 600,
            color: "#FEE7C0",
            background: "#233C00",
            border: "none",
            borderRadius: 14,
            padding: "14px 0",
            cursor: "pointer",
            marginTop: 8,
          }}
        >
          View recipe
        </button>
      </div>
    </div>
  );
}
