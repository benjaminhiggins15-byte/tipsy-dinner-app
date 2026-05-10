import { useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  loadOccasions,
  saveOccasion,
  updateOccasion,
  deleteOccasion,
  type Occasion,
} from "./data";
import {
  IconChefHat,
  IconCandle,
  IconGrill,
  IconCake,
  IconGlassFull,
  IconHeart,
  IconStar,
  IconSun,
  IconMoon,
  IconSnowflake,
  IconFlame,
  IconLeaf,
  IconToolsKitchen2,
  IconBowlSpoon,
  IconPizza,
} from "@tabler/icons-react";

const C = {
  bg: "#EEF4F8",
  accentBg: "#E6F1FB",
  borderLight: "#C5DCF4",
  border: "#85B7EB",
  navy: "#042C53",
  midBlue: "#185FA5",
  btnBlue: "#0C447C",
  muted: "#5A7FA3",
  white: "#ffffff",
};

const fontSerif = "'Playfair Display', serif";
const fontSans = "'DM Sans', sans-serif";

// Curated icon set for occasions
const ICON_OPTIONS = [
  { name: "IconChefHat", component: IconChefHat },
  { name: "IconCandle", component: IconCandle },
  { name: "IconGrill", component: IconGrill },
  { name: "IconCake", component: IconCake },
  { name: "IconGlassFull", component: IconGlassFull },
  { name: "IconHeart", component: IconHeart },
  { name: "IconStar", component: IconStar },
  { name: "IconSun", component: IconSun },
  { name: "IconMoon", component: IconMoon },
  { name: "IconSnowflake", component: IconSnowflake },
  { name: "IconFlame", component: IconFlame },
  { name: "IconLeaf", component: IconLeaf },
  { name: "IconToolsKitchen2", component: IconToolsKitchen2 },
  { name: "IconBowlSpoon", component: IconBowlSpoon },
  { name: "IconPizza", component: IconPizza },
];

// AI-assigned icon based on keywords in occasion name
function assignIcon(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes("christmas") || lower.includes("holiday")) return "IconSnowflake";
  if (lower.includes("birthday") || lower.includes("celebration")) return "IconCake";
  if (lower.includes("bbq") || lower.includes("grill") || lower.includes("summer")) return "IconGrill";
  if (lower.includes("dinner") || lower.includes("party")) return "IconCandle";
  if (lower.includes("brunch") || lower.includes("breakfast")) return "IconSun";
  if (lower.includes("romantic") || lower.includes("date") || lower.includes("valentine")) return "IconHeart";
  if (lower.includes("thanksgiving") || lower.includes("fall")) return "IconLeaf";
  if (lower.includes("cocktail") || lower.includes("drinks")) return "IconGlassFull";
  if (lower.includes("pizza")) return "IconPizza";
  if (lower.includes("special") || lower.includes("fancy")) return "IconStar";
  return "IconChefHat"; // default
}

function getIconComponent(iconName: string) {
  return ICON_OPTIONS.find((opt) => opt.name === iconName)?.component ?? IconChefHat;
}

function BackArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

type Props = {
  back: () => void;
  push: (occasion: Occasion) => void;
};

export default function Occasions({ back, push }: Props) {
  const [occasions, setOccasions] = useState<Occasion[]>(() => loadOccasions());
  const [showCreate, setShowCreate] = useState(false);
  const [editingOccasion, setEditingOccasion] = useState<Occasion | null>(null);

  const refreshOccasions = () => {
    setOccasions(loadOccasions());
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Header */}
      <div style={{
        padding: "32px 24px 16px",
        flexShrink: 0,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <button
              onClick={back}
              aria-label="Back"
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: C.midBlue,
                display: "flex",
                alignItems: "center",
              }}
            >
              <BackArrow />
            </button>
          </div>
          <div style={{ fontFamily: fontSerif, fontSize: 28, fontWeight: 400, color: C.navy }}>
            Curate
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="New occasion"
          style={{
            width: 32,
            height: 32,
            background: C.accentBg,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: `0.5px solid ${C.border}`,
            color: C.midBlue,
            marginTop: 4,
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Body - Full-width rows */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {occasions.length === 0 ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
          }}>
            <p style={{
              fontFamily: fontSans,
              fontSize: 13,
              color: C.midBlue,
              margin: 0,
              textAlign: "center",
            }}>
              Create your first occasion to start building menus.
            </p>
          </div>
        ) : (
          occasions.map((occasion) => {
            const IconComponent = getIconComponent(occasion.icon);
            return (
              <div
                key={occasion.id}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "16px 24px",
                  background: C.bg,
                  borderBottom: `0.5px solid ${C.border}`,
                }}
              >
                <div style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: C.accentBg,
                  border: `0.5px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <IconComponent size={20} color={C.midBlue} />
                </div>
                <button
                  onClick={() => push(occasion)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <p style={{
                    fontFamily: fontSans,
                    fontSize: 14,
                    fontWeight: 500,
                    color: C.navy,
                    margin: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {occasion.name}
                  </p>
                </button>
                <button
                  onClick={() => setEditingOccasion(occasion)}
                  aria-label="Edit occasion"
                  style={{
                    width: 28,
                    height: 28,
                    background: "transparent",
                    border: "none",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    color: C.midBlue,
                    flexShrink: 0,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => push(occasion)}
                  style={{
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: C.border,
                    fontSize: 18,
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ›
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Creation Sheet */}
      {showCreate && (
        <CreateOccasionSheet
          onClose={() => setShowCreate(false)}
          onSaved={(occasion) => {
            setShowCreate(false);
            refreshOccasions();
            push(occasion);
          }}
        />
      )}

      {/* Edit Sheet */}
      {editingOccasion && (
        <EditOccasionSheet
          occasion={editingOccasion}
          onClose={() => setEditingOccasion(null)}
          onSaved={() => {
            setEditingOccasion(null);
            refreshOccasions();
          }}
          onDeleted={() => {
            setEditingOccasion(null);
            refreshOccasions();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Create Occasion Sheet ---------------- */

function CreateOccasionSheet({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (occasion: Occasion) => void;
}) {
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState("IconChefHat");
  const [sheetPhase, setSheetPhase] = useState<"entering" | "entered">("entering");

  // Auto-assign icon when name changes
  const handleNameChange = (value: string) => {
    setName(value);
    if (value.trim()) {
      setNameErr(false);
      const assigned = assignIcon(value);
      setSelectedIcon(assigned);
    }
  };

  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    const occasion = saveOccasion(name.trim(), selectedIcon);
    onSaved(occasion);
  };

  // Slide-up animation
  useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });

  const SelectedIconComponent = getIconComponent(selectedIcon);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4,44,83,0.55)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: C.white,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: "24px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxHeight: "85%",
          overflowY: "auto",
          transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
          transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{
            fontFamily: fontSerif,
            fontSize: 20,
            fontWeight: 500,
            color: C.navy,
          }}>
            New occasion
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.muted,
              padding: 0,
              fontSize: 24,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Occasion name */}
        <div>
          <Label>Occasion name</Label>
          <NameInput
            value={name}
            onChange={handleNameChange}
            onEnter={trySave}
            placeholder="e.g. Christmas Dinner, Birthday Party"
          />
          {nameErr && <ValMsg>Please give your occasion a name.</ValMsg>}
        </div>

        {/* Icon preview */}
        <div>
          <Label>Icon</Label>
          <div style={{
            width: "100%",
            padding: "16px",
            background: C.accentBg,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: C.white,
              border: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <SelectedIconComponent size={28} color={C.midBlue} />
            </div>
          </div>
        </div>

        {/* Icon grid */}
        <div>
          <Label>Choose an icon</Label>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
          }}>
            {ICON_OPTIONS.map((opt) => {
              const IconComp = opt.component;
              const isSelected = selectedIcon === opt.name;
              return (
                <button
                  key={opt.name}
                  onClick={() => setSelectedIcon(opt.name)}
                  aria-label={opt.name}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    background: isSelected ? C.accentBg : C.bg,
                    border: isSelected ? `2px solid ${C.btnBlue}` : `1px solid ${C.borderLight}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <IconComp size={22} color={C.midBlue} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={trySave}
          style={{
            width: "100%",
            background: C.btnBlue,
            color: C.white,
            border: "none",
            borderRadius: 12,
            padding: "14px",
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          Save occasion
        </button>
      </div>
    </div>
  );
}

/* ---------------- Edit Occasion Sheet ---------------- */

function EditOccasionSheet({
  occasion,
  onClose,
  onSaved,
  onDeleted,
}: {
  occasion: Occasion;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(occasion.name);
  const [nameErr, setNameErr] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(occasion.icon);
  const [sheetPhase, setSheetPhase] = useState<"entering" | "entered">("entering");
  const [showDelete, setShowDelete] = useState(false);

  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    updateOccasion(occasion.id, { name: name.trim(), icon: selectedIcon });
    onSaved();
  };

  const tryDelete = () => {
    deleteOccasion(occasion.id);
    onDeleted();
  };

  // Slide-up animation
  useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });

  const SelectedIconComponent = getIconComponent(selectedIcon);

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4,44,83,0.55)",
        display: "flex",
        alignItems: "flex-end",
        zIndex: 10,
        transition: sheetPhase === "entering" ? "none" : "opacity 250ms ease-out",
        opacity: sheetPhase === "entered" ? 1 : 0,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          background: C.white,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: "24px 20px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxHeight: "85%",
          overflowY: "auto",
          transform: sheetPhase === "entered" ? "translateY(0)" : "translateY(100%)",
          transition: sheetPhase === "entering" ? "none" : "transform 300ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{
            fontFamily: fontSerif,
            fontSize: 20,
            fontWeight: 500,
            color: C.navy,
          }}>
            Edit occasion
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: C.muted,
              padding: 0,
              fontSize: 24,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Occasion name */}
        <div>
          <Label>Occasion name</Label>
          <NameInput
            value={name}
            onChange={(v) => {
              setName(v);
              if (v.trim()) setNameErr(false);
            }}
            onEnter={trySave}
            placeholder="e.g. Christmas Dinner, Birthday Party"
          />
          {nameErr && <ValMsg>Please give your occasion a name.</ValMsg>}
        </div>

        {/* Icon preview */}
        <div>
          <Label>Icon</Label>
          <div style={{
            width: "100%",
            padding: "16px",
            background: C.accentBg,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 12,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: C.white,
              border: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <SelectedIconComponent size={28} color={C.midBlue} />
            </div>
          </div>
        </div>

        {/* Icon grid */}
        <div>
          <Label>Choose an icon</Label>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
          }}>
            {ICON_OPTIONS.map((opt) => {
              const IconComp = opt.component;
              const isSelected = selectedIcon === opt.name;
              return (
                <button
                  key={opt.name}
                  onClick={() => setSelectedIcon(opt.name)}
                  aria-label={opt.name}
                  style={{
                    width: "100%",
                    aspectRatio: "1 / 1",
                    borderRadius: 10,
                    background: isSelected ? C.accentBg : C.bg,
                    border: isSelected ? `2px solid ${C.btnBlue}` : `1px solid ${C.borderLight}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    padding: 0,
                  }}
                >
                  <IconComp size={22} color={C.midBlue} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Save button */}
        <button
          onClick={trySave}
          style={{
            width: "100%",
            background: C.btnBlue,
            color: C.white,
            border: "none",
            borderRadius: 12,
            padding: "14px",
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
            marginTop: 4,
          }}
        >
          Save changes
        </button>

        {/* Delete button */}
        <button
          onClick={() => setShowDelete(true)}
          style={{
            width: "100%",
            background: "transparent",
            color: "#B85C5C",
            border: "none",
            padding: "12px",
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            cursor: "pointer",
          }}
        >
          Delete occasion
        </button>

        {/* Delete confirmation */}
        {showDelete && (
          <div
            onClick={() => setShowDelete(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(4,44,83,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 20,
              padding: 24,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                background: C.bg,
                borderRadius: 16,
                padding: "24px 20px",
                width: "100%",
                maxWidth: 280,
                display: "flex",
                flexDirection: "column",
                gap: 8,
                border: `0.5px solid ${C.border}`,
              }}
            >
              <div style={{
                fontFamily: fontSerif,
                fontSize: 20,
                color: C.navy,
                fontWeight: 400,
                textAlign: "center",
              }}>
                Delete this occasion?
              </div>
              <div style={{
                fontFamily: fontSans,
                fontSize: 13,
                color: C.midBlue,
                textAlign: "center",
                marginBottom: 12,
              }}>
                This will also remove all menus for this occasion. This can't be undone.
              </div>
              <button
                onClick={() => setShowDelete(false)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  background: "transparent",
                  border: `0.5px solid ${C.border}`,
                  color: C.midBlue,
                  fontFamily: fontSans,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={tryDelete}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  background: "#B85C5C",
                  border: "none",
                  color: "#fff",
                  fontFamily: fontSans,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Helper Components ---------------- */

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label style={{
      display: "block",
      fontFamily: fontSans,
      fontSize: 10,
      letterSpacing: "0.1em",
      textTransform: "uppercase",
      color: C.muted,
      marginBottom: 8,
    }}>
      {children}
    </label>
  );
}

function ValMsg({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: fontSans,
      fontSize: 11,
      color: "#c0392b",
      marginTop: 5,
    }}>
      {children}
    </div>
  );
}

const inputStyleBase: CSSProperties = {
  width: "100%",
  background: C.white,
  border: `1px solid ${C.borderLight}`,
  borderRadius: 10,
  padding: "11px 14px",
  fontFamily: fontSans,
  fontSize: 13,
  color: C.navy,
  outline: "none",
  WebkitAppearance: "none",
};

function NameInput({
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onEnter?: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) {
      e.preventDefault();
      onEnter();
    }
  };
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      style={{
        ...inputStyleBase,
        borderColor: focused ? C.border : C.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none",
      }}
    />
  );
}
