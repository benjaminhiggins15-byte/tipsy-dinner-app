import { useEffect, useState } from "react";
import { listMyPlans, type PlanSummary } from "./data";
import { DishIcon, MenuIcon } from "./LogCookTypePicker";
import { PlanRow } from "./ChooseDishOrMenu";
import { BottomSheet, Toast } from "./BottomSheet";

// Dishes & Menus v1.5 step 5a/5b — the DISHES & MENUS list screen, reached
// from the Recipes tab header pill. Row tap goes to the real Plan Detail
// screen (step 5b); `toastMessage` carries a message in from there after a
// delete (mirrors Home.tsx's own incomingToast pattern).

const FONT_SANS = "'Inter', sans-serif";
const FONT_SERIF_ITALIC = "'Fraunces', serif";
const FOREST = "#233C00";
const CREAM = "#FEE7C0";
const CARD_BG = "rgba(35,60,0,0.05)";
const CARD_BORDER = "rgba(35,60,0,0.1)";
const MUTED_TEXT = "rgba(35,60,0,0.6)";

// Minimal local Screen type — same convention as DishScreen.tsx/MenuScreen.tsx:
// each screen file states only the push targets it actually uses.
type Screen =
  | { name: "dishScreen" }
  | { name: "menuScreen" }
  | { name: "planDetail"; groupingId: string; kind: "dish" | "menu" };

export default function DishesMenusList({
  back,
  push,
  toastMessage,
}: {
  back: () => void;
  push: (s: Screen) => void;
  toastMessage?: string;
}) {
  const [state, setState] = useState<{ loaded: boolean; plans: PlanSummary[] }>({ loaded: false, plans: [] });
  const [typeSheetOpen, setTypeSheetOpen] = useState(false);
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
      const plans = await listMyPlans();
      if (ignore) return;
      setState({ loaded: true, plans });
    })();
    return () => {
      ignore = true;
    };
    // Screen instances are pushed fresh each time this screen is navigated
    // to (see DishScreen.tsx's identical comment) — that remount is what
    // keeps this list current after creating/editing/saving/logging a cook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openRow(plan: PlanSummary) {
    push({ name: "planDetail", groupingId: plan.id, kind: plan.kind });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      {/* Header */}
      <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 24px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{ background: "transparent", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={MUTED_TEXT} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: FOREST }}>
            Dishes & Menus
          </div>
        </div>
        <button
          onClick={() => setTypeSheetOpen(true)}
          aria-label="New dish or menu"
          style={{
            height: 32,
            padding: "0 14px",
            borderRadius: 16,
            border: "none",
            background: FOREST,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            fontFamily: FONT_SANS,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: CREAM,
            whiteSpace: "nowrap",
          }}
        >
          + New
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "4px 20px 24px" }}>
        {!state.loaded ? null : state.plans.length === 0 ? (
          <EmptyState onNew={() => setTypeSheetOpen(true)} />
        ) : (
          state.plans.map((plan) => <PlanRow key={plan.id} plan={plan} onClick={() => openRow(plan)} />)
        )}
      </div>

      {typeSheetOpen && (
        <NewPlanTypeSheet
          onClose={() => setTypeSheetOpen(false)}
          onPickDish={() => {
            setTypeSheetOpen(false);
            push({ name: "dishScreen" });
          }}
          onPickMenu={() => {
            setTypeSheetOpen(false);
            push({ name: "menuScreen" });
          }}
        />
      )}

      <Toast
        show={!!incomingToast}
        message={incomingToast}
        portal={false}
        placement="bottom"
        offset={80}
        background="#233C00"
        color="#FEE7C0"
        borderRadius={8}
        padding="8px 16px"
        fontSize={12}
        fontWeight={500}
      />
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 16px 24px", textAlign: "center" }}>
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 24,
          background: "rgba(35,60,0,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
        }}
      >
        <div style={{ transform: "scale(2)" }}>
          <DishIcon />
        </div>
      </div>
      <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 19, color: FOREST, marginBottom: 10 }}>
        Plan a plate, or a whole meal
      </div>
      <div style={{ fontFamily: FONT_SANS, fontSize: 13, color: MUTED_TEXT, lineHeight: 1.5, marginBottom: 24, maxWidth: 280 }}>
        Dishes bundle your recipes with anything else on the plate. Menus line up a whole meal, course by course.
      </div>
      <button
        onClick={onNew}
        style={{
          width: "100%",
          height: 48,
          borderRadius: 24,
          background: FOREST,
          border: "none",
          color: "#FAF7F2",
          fontFamily: FONT_SANS,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: "pointer",
        }}
      >
        + New dish or menu
      </button>
    </div>
  );
}

function NewPlanTypeSheet({
  onClose,
  onPickDish,
  onPickMenu,
}: {
  onClose: () => void;
  onPickDish: () => void;
  onPickMenu: () => void;
}) {
  return (
    <BottomSheet onClose={onClose} bottomInset={64} sizing="auto" maxHeight="85vh">
      <div style={{ overflowY: "auto", minHeight: 0, flex: "1 1 auto", padding: "16px 20px 24px" }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "rgba(35,60,0,0.15)", margin: "0 auto 20px" }} />
        <div
          style={{
            fontFamily: FONT_SANS,
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: FOREST,
            textAlign: "center",
            marginBottom: 20,
          }}
        >
          What are you planning?
        </div>

        <button
          onClick={onPickDish}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            width: "100%",
            textAlign: "left",
            padding: 18,
            borderRadius: 22,
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            marginBottom: 12,
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
            <DishIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 15, color: FOREST }}>Dish</div>
            <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT, marginTop: 2 }}>
              One plate: a few of your recipes, plus anything else.
            </div>
          </div>
        </button>

        <button
          onClick={onPickMenu}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            width: "100%",
            textAlign: "left",
            padding: 18,
            borderRadius: 22,
            background: CARD_BG,
            border: `1px solid ${CARD_BORDER}`,
            marginBottom: 12,
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
            <MenuIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: FONT_SANS, fontWeight: 700, fontSize: 15, color: FOREST }}>Menu</div>
            <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT, marginTop: 2 }}>
              A whole meal, course by course.
            </div>
          </div>
        </button>
      </div>
    </BottomSheet>
  );
}
