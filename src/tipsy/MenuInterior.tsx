import { useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  findMenu,
  updateMenu,
  getRecipesForMenuSection,
  findCustomCategory,
  type Menu,
  type MenuSection,
  type SavedRecipe,
  type Recipe,
} from "./data";

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

function BackArrow() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

const SECTION_LABELS: Record<MenuSection, string> = {
  apps: "APPS",
  mains: "MAINS",
  sides: "SIDES",
  desserts: "DESSERTS",
  drinks: "DRINKS",
};

type Screen =
  | { name: "recipepicker"; menuId: number; section: MenuSection }
  | { name: "recipe"; recipe: Recipe; categoryLabel: string }
  | { name: "placeholder"; title: string };

type Props = {
  menuId: number;
  back: () => void;
  push: (screen: Screen) => void;
};

export default function MenuInterior({ menuId, back, push }: Props) {
  const [menu, setMenu] = useState<Menu | null>(() => findMenu(menuId));
  const [expandedSections, setExpandedSections] = useState<Set<MenuSection>>(new Set());
  const [showEdit, setShowEdit] = useState(false);

  if (!menu) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <p style={{ fontFamily: fontSans, fontSize: 13, color: C.midBlue }}>Menu not found.</p>
      </div>
    );
  }

  const toggleSection = (section: MenuSection) => {
    const next = new Set(expandedSections);
    if (next.has(section)) {
      next.delete(section);
    } else {
      next.add(section);
    }
    setExpandedSections(next);
  };

  const refreshMenu = () => {
    const updated = findMenu(menuId);
    if (updated) setMenu(updated);
  };

  // Only show sections that are enabled OR have recipes
  const visibleSections = (["apps", "mains", "sides", "desserts", "drinks"] as MenuSection[]).filter(
    (section) => menu.enabledSections.includes(section) || menu.recipes[section].length > 0
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Header */}
      <div style={{
        background: C.white,
        borderBottom: `1px solid ${C.borderLight}`,
        padding: "16px 16px 20px",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 10 }}>
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
          <button
            onClick={() => setShowEdit(true)}
            aria-label="Edit menu"
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
              flexShrink: 0,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
            </svg>
          </button>
        </div>
        <div style={{
          fontFamily: fontSerif,
          fontSize: 24,
          fontWeight: 500,
          color: C.navy,
          marginBottom: 6,
          lineHeight: 1.2,
        }}>
          {menu.title}
        </div>
        {menu.description && (
          <div style={{
            fontFamily: fontSerif,
            fontStyle: "italic",
            fontSize: 14,
            color: C.midBlue,
            lineHeight: 1.4,
          }}>
            {menu.description}
          </div>
        )}
      </div>

      {/* Sections */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 24px" }}>
        {visibleSections.length === 0 ? (
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
              Enable sections in the menu settings to start adding recipes.
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visibleSections.map((section) => {
              const recipes = getRecipesForMenuSection(menuId, section);
              const isExpanded = expandedSections.has(section);
              const count = recipes.length;

              return (
                <div
                  key={section}
                  style={{
                    background: C.accentBg,
                    border: `0.5px solid ${C.border}`,
                    borderRadius: 10,
                    overflow: "hidden",
                  }}
                >
                  {/* Section Header */}
                  <button
                    onClick={() => toggleSection(section)}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "14px 16px",
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                    }}
                  >
                    <span style={{
                      fontFamily: fontSans,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: C.midBlue,
                    }}>
                      {SECTION_LABELS[section]} · {count}
                    </span>
                    <span style={{
                      color: C.border,
                      fontSize: 16,
                      lineHeight: 1,
                      transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                      transition: "transform 200ms ease",
                    }}>
                      ›
                    </span>
                  </button>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <>
                      {/* Divider */}
                      <div style={{
                        width: "100%",
                        height: 0.5,
                        background: C.border,
                        opacity: 0.4,
                      }} />

                      {/* Recipe rows */}
                      {recipes.map((recipe, idx) => {
                        const category = findCustomCategory(recipe.category);
                        const categoryLabel = category?.label ?? "Unknown";
                        return (
                          <button
                            key={recipe.id}
                            onClick={() => {
                              const recipeData: Recipe = {
                                title: recipe.title,
                                description: recipe.description,
                                color: category?.gradient ?? "linear-gradient(135deg, #C5DCF4 0%, #85B7EB 100%)",
                                category: categoryLabel.toLowerCase(),
                                ingredients: recipe.ingredients,
                                steps: recipe.steps,
                                savedId: recipe.id,
                                categoryKey: recipe.category,
                              };
                              push({ name: "recipe", recipe: recipeData, categoryLabel });
                            }}
                          style={{
                            width: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: 6,
                            padding: "14px 16px",
                            background: "transparent",
                            border: "none",
                            borderTop: idx > 0 ? `0.5px solid rgba(133, 183, 235, 0.4)` : "none",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          <div style={{
                            fontFamily: fontSans,
                            fontSize: 14,
                            fontWeight: 500,
                            color: C.navy,
                          }}>
                            {recipe.title}
                          </div>
                          {recipe.description && (
                            <div style={{
                              fontFamily: fontSerif,
                              fontStyle: "italic",
                              fontSize: 12,
                              color: C.midBlue,
                              lineHeight: 1.4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            } as CSSProperties}>
                              {recipe.description}
                            </div>
                          )}
                        </button>
                      );
                      })}

                      {/* Add section row */}
                      <button
                        onClick={() => {
                          push({ name: "recipepicker", menuId, section });
                        }}
                        style={{
                          width: "100%",
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "14px 16px",
                          background: "transparent",
                          border: "none",
                          borderTop: recipes.length > 0 ? `0.5px solid rgba(133, 183, 235, 0.4)` : "none",
                          cursor: "pointer",
                          color: C.midBlue,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14" />
                          <path d="M5 12h14" />
                        </svg>
                        <span style={{
                          fontFamily: fontSans,
                          fontSize: 13,
                          fontWeight: 500,
                          letterSpacing: "0.04em",
                        }}>
                          Add {SECTION_LABELS[section].toLowerCase()}
                        </span>
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Sheet */}
      {showEdit && (
        <EditMenuSheet
          menu={menu}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            refreshMenu();
          }}
        />
      )}
    </div>
  );
}

/* ---------------- Edit Menu Sheet ---------------- */

const SECTION_OPTIONS: { key: MenuSection; label: string }[] = [
  { key: "apps", label: "Apps" },
  { key: "mains", label: "Mains" },
  { key: "sides", label: "Sides" },
  { key: "desserts", label: "Desserts" },
  { key: "drinks", label: "Drinks" },
];

function EditMenuSheet({
  menu,
  onClose,
  onSaved,
}: {
  menu: Menu;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(menu.title);
  const [titleErr, setTitleErr] = useState(false);
  const [description, setDescription] = useState(menu.description);
  const [enabledSections, setEnabledSections] = useState<MenuSection[]>(menu.enabledSections);
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
    updateMenu(menu.id, {
      title: title.trim(),
      description: description.trim(),
      enabledSections,
    });
    onSaved();
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
