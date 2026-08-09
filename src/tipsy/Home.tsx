import { useState, useEffect } from "react";
import { getPendingReceivedRecipes, type PendingReceivedRecipe } from "./data";
import watermarkSquare from "../Logos/watermark_square.png";

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

// Photoless fallback — the app's watermark icon on the card-green background,
// same green used for recipe rows/cards elsewhere (#2E4E08).
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
  onOpen: (sendId: string) => void;
}) {
  return (
    <div
      onClick={() => onOpen(item.sendId)}
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
            fontSize: 15,
            lineHeight: 1.15,
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

function openReceivedTile(sendId: string) {
  console.log("open received recipe", sendId);
}

export default function Home({
  profile,
  push,
}: {
  profile: ProfileType | null;
  push: (s: { name: "receivedPending"; items: PendingReceivedRecipe[] }) => void;
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
                <ReceivedTile key={item.sendId} item={item} onOpen={openReceivedTile} />
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
}: {
  items: PendingReceivedRecipe[];
  back: () => void;
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
            <ReceivedTileFullWidth item={item} onOpen={openReceivedTile} />
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
  onOpen: (sendId: string) => void;
}) {
  return (
    <div
      onClick={() => onOpen(item.sendId)}
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
            fontSize: 16,
            lineHeight: 1.15,
            color: "#FEE7C0",
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
