import { useEffect, useState } from "react";
import { listMyPlans, type PlanSummary } from "./data";
import { DishIcon, MenuIcon, ChevronIcon } from "./LogCookTypePicker";

// Dishes & Menus v1.5 step 2b — reached only via LogCookTypePicker's "Start
// from a saved dish or menu" link. Rows push the existing dev-only
// "placeholder" screen (same one step 2a wired for a fresh dish/menu) but
// carrying groupingId instead of recipeId — step 3 builds the real
// dish/menu Log Cook sheet behind that same placeholder slot.
type Screen = { name: "placeholder"; title: string; kind?: "dish" | "menu"; groupingId?: string };

const FONT_SANS = "'Inter', sans-serif";
const FONT_SERIF_ITALIC = "'Fraunces', serif";
const FOREST = "#233C00";
const CREAM = "#FEE7C0";
const CARD_BG = "rgba(35,60,0,0.05)";
const CARD_BORDER = "rgba(35,60,0,0.1)";
// Matches LogCookTypePicker's own restated Home.tsx C.textLight token.
const MUTED_TEXT = "rgba(35,60,0,0.6)";

type Filter = "all" | "dish" | "menu";

function formatLastCooked(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function subtitleFor(plan: PlanSummary): string {
  if (plan.lastCookedOn) return `Last cooked ${formatLastCooked(plan.lastCookedOn)}`;
  if (plan.inspiredByName) return `Inspired by ${plan.inspiredByName}`;
  return "Not cooked yet";
}

export default function ChooseDishOrMenu({
  back,
  push,
}: {
  back: () => void;
  push: (s: Screen) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [state, setState] = useState<{ loaded: boolean; plans: PlanSummary[] }>({ loaded: false, plans: [] });

  useEffect(() => {
    let ignore = false;
    (async () => {
      const plans = await listMyPlans();
      if (ignore) return;
      setState({ loaded: true, plans });
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredPlans = state.plans.filter((p) => filter === "all" || p.kind === filter);

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "dish", label: "DISHES" },
    { key: "menu", label: "MENUS" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
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
            Choose a dish or menu
          </div>
        </div>
        <div
          style={{
            fontFamily: FONT_SERIF_ITALIC,
            fontStyle: "italic",
            fontSize: 14,
            color: MUTED_TEXT,
            marginLeft: 34,
            marginBottom: 16,
          }}
        >
          Pick one to log a cook.
        </div>

        {/* Filter chips */}
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {chips.map((chip) => {
            const selected = filter === chip.key;
            return (
              <button
                key={chip.key}
                onClick={() => setFilter(chip.key)}
                style={{
                  padding: "7px 16px",
                  borderRadius: 999,
                  background: selected ? FOREST : "transparent",
                  border: `1px solid ${FOREST}`,
                  color: selected ? CREAM : FOREST,
                  fontFamily: FONT_SANS,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 24px" }}>
        {!state.loaded ? null : filteredPlans.length === 0 ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "48px 24px" }}>
            <p
              style={{
                fontFamily: FONT_SERIF_ITALIC,
                fontStyle: "italic",
                fontSize: 14,
                color: MUTED_TEXT,
                margin: 0,
                textAlign: "center",
              }}
            >
              {filter === "all"
                ? "You haven't saved a dish or menu yet."
                : filter === "dish"
                ? "No dishes yet."
                : "No menus yet."}
            </p>
          </div>
        ) : (
          filteredPlans.map((plan) => (
            <button
              key={plan.id}
              onClick={() =>
                push({
                  name: "placeholder",
                  title: plan.kind === "dish" ? "Dish (preview)" : "Menu (preview)",
                  kind: plan.kind,
                  groupingId: plan.id,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                width: "100%",
                textAlign: "left",
                padding: 16,
                borderRadius: 20,
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                marginBottom: 10,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  minWidth: 44,
                  borderRadius: 14,
                  background: "rgba(35,60,0,0.08)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {plan.kind === "dish" ? <DishIcon /> : <MenuIcon />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT_SANS,
                    fontWeight: 700,
                    fontSize: 15,
                    color: FOREST,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {plan.title || (plan.kind === "dish" ? "Untitled dish" : "Untitled menu")}
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
                  {plan.kind === "dish" ? "DISH" : "MENU"} · {plan.partCount} {plan.partCount === 1 ? "PART" : "PARTS"}
                </div>
                <div
                  style={{
                    fontFamily: FONT_SERIF_ITALIC,
                    fontStyle: "italic",
                    fontSize: 13,
                    color: MUTED_TEXT,
                    marginTop: 3,
                  }}
                >
                  {subtitleFor(plan)}
                </div>
              </div>
              <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                <ChevronIcon />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
