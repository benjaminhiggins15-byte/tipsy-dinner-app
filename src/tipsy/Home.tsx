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

// Photoless fallback — first pass: the app's watermark icon on cream (#FAF7F2),
// matching the mini-player's watermark-on-cream treatment rather than the tile's
// own green. First draft, judged on phone — not a settled pattern yet.
function PlaceholderArt({ iconSize = 40 }: { iconSize?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: "#FAF7F2",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <img src={watermarkSquare} alt="" style={{ width: iconSize, height: iconSize, opacity: 0.4 }} />
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

function ReceivedHero({ photoUrl }: { photoUrl: string | null }) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "4/3",
        borderRadius: 30,
        overflow: "hidden",
        flexShrink: 0,
        background: "#2E4E08",
      }}
    >
      {photoUrl ? (
        <img
          src={photoUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", maxWidth: "none" }}
        />
      ) : (
        <PlaceholderArt iconSize={56} />
      )}
    </div>
  );
}

type ReceivedTab = "ingredients" | "steps";

export function ReceivedRecipeView({
  item,
  back,
}: {
  item: PendingReceivedRecipe;
  back: () => void;
}) {
  const [tab, setTab] = useState<ReceivedTab>("ingredients");
  const [noteRevealed, setNoteRevealed] = useState(!item.note);

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

      <div style={{ flex: 1, overflowY: "auto", padding: `0 ${EDGE}px`, paddingBottom: 96 }}>
        <ReceivedHero photoUrl={item.photoUrl} />

        <div
          style={{
            fontFamily: "Lazydog, sans-serif",
            textTransform: "uppercase",
            fontSize: 22,
            lineHeight: 1.2,
            color: C.text,
            marginTop: 20,
          }}
        >
          {item.title}
        </div>

        {item.description && (
          <div
            style={{
              fontFamily: fontDisplay,
              fontStyle: "italic",
              fontSize: 15,
              lineHeight: 1.5,
              color: C.text,
              marginTop: 10,
            }}
          >
            {item.description}
          </div>
        )}

        <div
          style={{
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 500,
            color: C.textLight,
            marginTop: 10,
          }}
        >
          inspired by {item.senderName}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 24,
            position: "sticky",
            top: 0,
            background: C.bg,
            paddingTop: 4,
            paddingBottom: 8,
            zIndex: 10,
          }}
        >
          {(["ingredients", "steps"] as ReceivedTab[]).map((t) => (
            <div
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontFamily: fontSans,
                fontSize: 13,
                fontWeight: 500,
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: tab === t ? "#FEE7C0" : C.textLight,
                background: tab === t ? "#233C00" : "transparent",
                border: tab === t ? "none" : "1px solid rgba(35,60,0,0.2)",
                borderRadius: 20,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              {t === "ingredients" ? "Ingredients" : "Steps"}
            </div>
          ))}
        </div>

        {tab === "ingredients" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
            {item.ingredients.map((ing, i) => (
              <div
                key={i}
                style={{
                  fontFamily: fontSans,
                  fontSize: 15,
                  color: C.text,
                  lineHeight: 1.4,
                }}
              >
                {[ing.quantity, ing.name].filter(Boolean).join(" ")}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 4 }}>
            {item.steps.map((step, i) => {
              const s = normalizeStep(step);
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 12,
                      fontWeight: 600,
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                      color: C.textLight,
                    }}
                  >
                    {s.title || `Step ${i + 1}`}
                  </div>
                  <div
                    style={{
                      fontFamily: fontSans,
                      fontSize: 15,
                      color: C.text,
                      lineHeight: 1.5,
                    }}
                  >
                    {s.instruction}
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
        flexDirection: "column",
        justifyContent: "flex-end",
      }}
    >
      <div
        style={{
          background: "#FAF7F2",
          borderRadius: "24px 24px 0 0",
          padding: "28px 24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
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
