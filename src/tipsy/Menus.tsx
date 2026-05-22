import { useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  getMenusForOccasion,
  saveMenu,
  updateMenu,
  deleteMenu,
  findOccasion,
  updateOccasion,
  type Menu,
  type MenuSection,
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
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  cardBg: "rgba(35,60,0,0.05)",
  cardBorder: "rgba(35,60,0,0.1)",
  photoBg: "rgba(35,60,0,0.06)",
  photoLabel: "rgba(35,60,0,0.25)",
  descText: "rgba(35,60,0,0.45)",
  actionIcon: "rgba(35,60,0,0.2)",
  plusBorder: "rgba(35,60,0,0.2)",
};

const fontSerif = "'Fraunces', serif";
const fontSans = "'Inter', sans-serif";

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
  occasionId: number;
  occasionName: string;
  back: () => void;
  push: (menu: Menu) => void;
};

export default function Menus({ occasionId, occasionName, back, push }: Props) {
  const [menus, setMenus] = useState<Menu[]>(() => getMenusForOccasion(occasionId));
  const [showCreate, setShowCreate] = useState(false);
  const [editingMenu, setEditingMenu] = useState<Menu | null>(null);
  const [editingOccasion, setEditingOccasion] = useState(false);

  const refreshMenus = () => {
    setMenus(getMenusForOccasion(occasionId));
  };

  const occasion = findOccasion(occasionId);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, position: "relative" }}>
      {/* Gradient background */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 420,
        background: "linear-gradient(180deg, #3a6010 0%, #2E4E08 35%, #233C00 100%)",
        zIndex: 0,
        pointerEvents: "none",
      }} />

      {/* Header */}
      <div style={{
        padding: "16px 24px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        zIndex: 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button
            onClick={back}
            aria-label="Back"
            style={{
              background: "transparent",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: C.textLight,
              display: "flex",
              alignItems: "center",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <div style={{
              fontFamily: fontSans,
              fontSize: 13,
              fontWeight: 500,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.text,
            }}>
              {occasionName}
            </div>
            <div style={{
              fontFamily: fontSans,
              fontSize: 11,
              color: C.textMuted,
            }}>
              {menus.length} {menus.length === 1 ? "menu" : "menus"}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          aria-label="New menu"
          style={{
            width: 32,
            height: 32,
            background: "transparent",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            border: `1px solid ${C.plusBorder}`,
            color: C.textLight,
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </div>

      {/* Body - Menu Cards */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 12, position: "relative", zIndex: 1 }}>
        {menus.length === 0 ? (
          <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
          }}>
            <p style={{
              fontFamily: fontSerif,
              fontStyle: "italic",
              fontSize: 14,
              color: C.textLight,
              margin: 0,
              textAlign: "center",
            }}>
              Create your first menu for this occasion.
            </p>
          </div>
        ) : (
          menus.map((menu) => (
            <div
              key={menu.id}
              style={{
                borderRadius: 16,
                overflow: "hidden",
                flexShrink: 0,
                background: C.cardBg,
                border: `1px solid ${C.cardBorder}`,
                cursor: "pointer",
              }}
            >
              {/* Photo placeholder */}
              <div style={{
                height: 130,
                background: C.photoBg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}>
                <span style={{
                  fontFamily: fontSans,
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  color: C.photoLabel,
                }}>
                  add a photo
                </span>
              </div>
              {/* Card body */}
              <div style={{
                padding: "12px 16px 14px",
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: 10,
              }}>
                <button
                  onClick={() => push(menu)}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 3,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{
                    fontFamily: fontSans,
                    fontSize: 15,
                    fontWeight: 500,
                    color: C.text,
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}>
                    {menu.title}
                  </div>
                  {menu.description && (
                    <div style={{
                      fontFamily: fontSerif,
                      fontStyle: "italic",
                      fontWeight: 300,
                      fontSize: 13,
                      color: C.descText,
                      lineHeight: 1.4,
                      width: "100%",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    } as CSSProperties}>
                      {menu.description}
                    </div>
                  )}
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0, paddingTop: 2 }}>
                  <button
                    onClick={() => setEditingMenu(menu)}
                    aria-label="Edit menu"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: C.actionIcon,
                    }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => {
                      if (window.confirm(`Delete ${menu.title}?`)) {
                        deleteMenu(menu.id);
                        refreshMenus();
                      }
                    }}
                    aria-label="Delete menu"
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      color: C.actionIcon,
                    }}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Creation Sheet */}
      {showCreate && (
        <CreateMenuSheet
          occasionId={occasionId}
          onClose={() => setShowCreate(false)}
          onSaved={(menu) => {
            setShowCreate(false);
            refreshMenus();
            push(menu);
          }}
        />
      )}

      {/* Edit Menu Sheet */}
      {editingMenu && (
        <EditMenuSheet
          menu={editingMenu}
          onClose={() => setEditingMenu(null)}
          onSaved={() => {
            setEditingMenu(null);
            refreshMenus();
          }}
          onDeleted={() => {
            setEditingMenu(null);
            refreshMenus();
          }}
        />
      )}

      {/* Edit Occasion Sheet */}
      {editingOccasion && occasion && (
        <EditOccasionSheet
          occasion={occasion}
          onClose={() => setEditingOccasion(false)}
          onSaved={() => {
            setEditingOccasion(false);
            // Optionally refresh occasion name in header or navigate back
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Create Menu Sheet ---------------- */

const SECTION_OPTIONS: { key: MenuSection; label: string }[] = [
  { key: "apps", label: "Apps" },
  { key: "mains", label: "Mains" },
  { key: "sides", label: "Sides" },
  { key: "desserts", label: "Desserts" },
  { key: "drinks", label: "Drinks" },
];

function CreateMenuSheet({
  occasionId,
  onClose,
  onSaved,
}: {
  occasionId: number;
  onClose: () => void;
  onSaved: (menu: Menu) => void;
}) {
  const [title, setTitle] = useState("");
  const [titleErr, setTitleErr] = useState(false);
  const [description, setDescription] = useState("");
  const [enabledSections, setEnabledSections] = useState<MenuSection[]>([]);
  const [sheetPhase, setSheetPhase] = useState<"entering" | "entered">("entering");

  const toggleSection = (section: MenuSection) => {
    if (enabledSections.includes(section)) {
      setEnabledSections(enabledSections.filter((s) => s !== section));
    } else {
      setEnabledSections([...enabledSections, section]);
    }
  };

  const trySave = () => {
    if (!title.trim()) {
      setTitleErr(true);
      return;
    }
    const menu = saveMenu(occasionId, title.trim(), description.trim(), enabledSections);
    onSaved(menu);
  };

  // Slide-up animation
  useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });

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
          padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxHeight: "80%",
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
            New menu
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

        {/* Title */}
        <div>
          <Label>Menu title</Label>
          <TextInput
            value={title}
            onChange={(v) => {
              setTitle(v);
              if (v.trim()) setTitleErr(false);
            }}
            onEnter={trySave}
            placeholder="e.g. Christmas Eve Dinner"
          />
          {titleErr && <ValMsg>Please give your menu a title.</ValMsg>}
        </div>

        {/* Description */}
        <div>
          <Label>Description (optional)</Label>
          <TextArea
            value={description}
            onChange={setDescription}
            placeholder="Add a note about this menu..."
            rows={3}
          />
        </div>

        {/* Section toggles */}
        <div>
          <div style={{
            background: C.bg,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {SECTION_OPTIONS.map((opt, idx) => {
              const isOn = enabledSections.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleSection(opt.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "transparent",
                    border: "none",
                    borderBottom: idx < SECTION_OPTIONS.length - 1 ? `0.5px solid ${C.borderLight}` : "none",
                    cursor: "pointer",
                  }}
                >
                  <span style={{
                    fontFamily: fontSans,
                    fontSize: 13,
                    color: C.navy,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 500,
                  }}>
                    {opt.label}
                  </span>
                  {/* iOS-style pill toggle */}
                  <div style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: isOn ? C.btnBlue : C.border,
                    position: "relative",
                    transition: "background 200ms ease",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: C.white,
                      position: "absolute",
                      top: 2,
                      left: isOn ? 22 : 2,
                      transition: "left 200ms ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                    }} />
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{
            fontFamily: fontSans,
            fontSize: 11,
            color: C.muted,
            marginTop: 8,
            lineHeight: 1.4,
          }}>
            Toggle on the sections you want in this menu. You can change this later.
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
          Save menu
        </button>
      </div>
    </div>
  );
}

/* ---------------- Edit Menu Sheet ---------------- */

function EditMenuSheet({
  menu,
  onClose,
  onSaved,
  onDeleted,
}: {
  menu: Menu;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(menu.title);
  const [titleErr, setTitleErr] = useState(false);
  const [description, setDescription] = useState(menu.description);
  const [enabledSections, setEnabledSections] = useState<MenuSection[]>(menu.enabledSections);
  const [sheetPhase, setSheetPhase] = useState<"entering" | "entered">("entering");
  const [showDelete, setShowDelete] = useState(false);

  const toggleSection = (section: MenuSection) => {
    if (enabledSections.includes(section)) {
      setEnabledSections(enabledSections.filter((s) => s !== section));
    } else {
      setEnabledSections([...enabledSections, section]);
    }
  };

  const trySave = () => {
    if (!title.trim()) {
      setTitleErr(true);
      return;
    }
    updateMenu(menu.id, {
      title: title.trim(),
      description: description.trim(),
      enabledSections,
    });
    onSaved();
  };

  const tryDelete = () => {
    deleteMenu(menu.id);
    onDeleted();
  };

  // Slide-up animation
  useState(() => {
    requestAnimationFrame(() => {
      setSheetPhase("entered");
    });
  });

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
          padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxHeight: "80%",
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
            Edit menu
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

        {/* Title */}
        <div>
          <Label>Menu title</Label>
          <TextInput
            value={title}
            onChange={(v) => {
              setTitle(v);
              if (v.trim()) setTitleErr(false);
            }}
            onEnter={trySave}
            placeholder="e.g. Christmas Eve Dinner"
          />
          {titleErr && <ValMsg>Please give your menu a title.</ValMsg>}
        </div>

        {/* Description */}
        <div>
          <Label>Description (optional)</Label>
          <TextArea
            value={description}
            onChange={setDescription}
            placeholder="Add a note about this menu..."
            rows={3}
          />
        </div>

        {/* Section toggles */}
        <div>
          <div style={{
            background: C.bg,
            border: `1px solid ${C.borderLight}`,
            borderRadius: 12,
            overflow: "hidden",
          }}>
            {SECTION_OPTIONS.map((opt, idx) => {
              const isOn = enabledSections.includes(opt.key);
              return (
                <button
                  key={opt.key}
                  onClick={() => toggleSection(opt.key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "12px 14px",
                    background: "transparent",
                    border: "none",
                    borderBottom: idx < SECTION_OPTIONS.length - 1 ? `0.5px solid ${C.borderLight}` : "none",
                    cursor: "pointer",
                  }}
                >
                  <span style={{
                    fontFamily: fontSans,
                    fontSize: 13,
                    color: C.navy,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    fontWeight: 500,
                  }}>
                    {opt.label}
                  </span>
                  {/* iOS-style pill toggle */}
                  <div style={{
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: isOn ? C.btnBlue : C.border,
                    position: "relative",
                    transition: "background 200ms ease",
                    flexShrink: 0,
                  }}>
                    <div style={{
                      width: 20,
                      height: 20,
                      borderRadius: "50%",
                      background: C.white,
                      position: "absolute",
                      top: 2,
                      left: isOn ? 22 : 2,
                      transition: "left 200ms ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.12)",
                    }} />
                  </div>
                </button>
              );
            })}
          </div>
          <div style={{
            fontFamily: fontSans,
            fontSize: 11,
            color: C.muted,
            marginTop: 8,
            lineHeight: 1.4,
          }}>
            Toggle on the sections you want in this menu. You can change this later.
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
          Delete menu
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
                Delete this menu?
              </div>
              <div style={{
                fontFamily: fontSans,
                fontSize: 13,
                color: C.midBlue,
                textAlign: "center",
                marginBottom: 12,
              }}>
                This can't be undone.
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

/* ---------------- Edit Occasion Sheet (from Menus screen) ---------------- */

function EditOccasionSheet({
  occasion,
  onClose,
  onSaved,
}: {
  occasion: Occasion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(occasion.name);
  const [nameErr, setNameErr] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(occasion.icon);
  const [sheetPhase, setSheetPhase] = useState<"entering" | "entered">("entering");

  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    updateOccasion(occasion.id, { name: name.trim(), icon: selectedIcon });
    onSaved();
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
          padding: "24px 20px calc(80px + env(safe-area-inset-bottom))",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          maxHeight: "80%",
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
          <TextInput
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

function TextInput({
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

function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      rows={rows}
      style={{
        ...inputStyleBase,
        borderColor: focused ? C.border : C.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none",
        resize: "vertical",
        minHeight: 80,
      }}
    />
  );
}
