import { useState, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import {
  findMenu,
  updateMenu,
  getRecipesForMenuSection,
  removeRecipeFromMenuSection,
  findCustomCategory,
  type Menu,
  type MenuSection,
  type SavedRecipe,
  type Recipe,
} from "./data";

const C = {
  bg: "#FAF7F2",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  sectionBg: "rgba(35,60,0,0.04)",
  sectionBorder: "rgba(35,60,0,0.08)",
  sectionName: "rgba(35,60,0,0.6)",
  sectionCount: "rgba(35,60,0,0.3)",
  bodyBg: "rgba(35,60,0,0.02)",
  rowBorder: "rgba(35,60,0,0.05)",
  removeIcon: "rgba(35,60,0,0.2)",
  addText: "rgba(35,60,0,0.3)",
  chevron: "rgba(35,60,0,0.25)",
};

const fontSerif = "'Fraunces', serif";
const fontSans = "'Inter', sans-serif";

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
  | { name: "recipepicker"; menuId: string; section: MenuSection }
  | { name: "recipe"; recipe: Recipe; categoryLabel: string }
  | { name: "placeholder"; title: string };

type Props = {
  menuId: string;
  back: () => void;
  push: (screen: Screen) => void;
};

export default function MenuInterior({ menuId, back, push }: Props) {
  const [menu, setMenu] = useState<Menu | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<MenuSection>>(new Set());
  const [sectionRecipes, setSectionRecipes] = useState<Record<string, SavedRecipe[]>>({});
  const [loadingStates, setLoadingStates] = useState<Set<MenuSection>>(new Set());
  const [showEdit, setShowEdit] = useState(false);

  // Load menu on mount
  useEffect(() => {
    async function loadMenu() {
      const loadedMenu = await findMenu(menuId);
      setMenu(loadedMenu);
    }
    loadMenu();
  }, [menuId]);

  // Load recipes for expanded sections
  useEffect(() => {
    async function loadRecipes() {
      // Mark sections as loading
      setLoadingStates(new Set(expandedSections));

      for (const section of expandedSections) {
        const recipes = await getRecipesForMenuSection(menuId, section);
        setSectionRecipes(prev => ({ ...prev, [section]: recipes }));

        // Remove section from loading state after it loads
        setLoadingStates(prev => {
          const next = new Set(prev);
          next.delete(section);
          return next;
        });
      }
    }
    if (expandedSections.size > 0) {
      loadRecipes();
    } else {
      setLoadingStates(new Set());
    }
  }, [expandedSections, menuId]);

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

  const refreshMenu = async () => {
    const updated = await findMenu(menuId);
    if (updated) setMenu(updated);

    // Reload recipes for expanded sections
    setLoadingStates(new Set(expandedSections));
    for (const section of expandedSections) {
      const recipes = await getRecipesForMenuSection(menuId, section);
      setSectionRecipes(prev => ({ ...prev, [section]: recipes }));

      setLoadingStates(prev => {
        const next = new Set(prev);
        next.delete(section);
        return next;
      });
    }
  };

  // Only show sections that are enabled OR have recipes
  const visibleSections = (["apps", "mains", "sides", "desserts", "drinks"] as MenuSection[]).filter(
    (section) => menu.enabledSections.includes(section) || menu.recipes[section].length > 0
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      {/* Header */}
      <div style={{
        padding: "16px 24px",
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
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
              {menu.title}
            </div>
            <div style={{
              fontFamily: fontSans,
              fontSize: 11,
              color: C.textMuted,
            }}>
              {/* Occasion name would go here if available */}
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowEdit(true)}
          aria-label="Edit menu"
          style={{
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: C.textMuted,
            flexShrink: 0,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
      </div>

      {/* Sections */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 20px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
        {visibleSections.length === 0 ? (
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
              Enable sections in the menu settings to start adding recipes.
            </p>
          </div>
        ) : (
          visibleSections.map((section) => {
            const recipes = sectionRecipes[section] || [];
            const isExpanded = expandedSections.has(section);
            const count = menu.recipes[section].length;

            return (
              <div
                key={section}
                style={{
                  borderRadius: 14,
                  overflow: "hidden",
                  flexShrink: 0,
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
                    background: C.sectionBg,
                    border: `1px solid ${C.sectionBorder}`,
                    borderRadius: isExpanded ? "14px 14px 0 0" : 14,
                    borderBottom: isExpanded ? "none" : `1px solid ${C.sectionBorder}`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontFamily: fontSans,
                      fontSize: 12,
                      fontWeight: 500,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: C.sectionName,
                    }}>
                      {SECTION_LABELS[section]}
                    </span>
                    <span style={{
                      fontFamily: fontSans,
                      fontSize: 11,
                      color: C.sectionCount,
                    }}>
                      {count} {count === 1 ? "recipe" : "recipes"}
                    </span>
                  </div>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.chevron} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{
                    transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 200ms ease",
                  }}>
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div style={{
                    background: C.bodyBg,
                    border: `1px solid ${C.sectionBorder}`,
                    borderTop: "none",
                    borderRadius: "0 0 14px 14px",
                  }}>
                    {/* Recipe rows */}
                    {loadingStates.has(section) ? (
                      <div style={{ padding: 16, textAlign: "center", fontFamily: fontSerif, fontStyle: "italic", fontSize: 13, color: C.textMuted }}>
                        Loading recipes...
                      </div>
                    ) : (
                      recipes.map((recipe, idx) => {
                        const category = findCustomCategory(recipe.category);
                      const categoryLabel = category?.label ?? "Unknown";
                      return (
                        <div
                          key={recipe.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            padding: "12px 16px",
                            borderBottom: idx === recipes.length - 1 ? "none" : `1px solid ${C.rowBorder}`,
                            gap: 12,
                          }}
                        >
                          <button
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
                              flex: 1,
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: 2,
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{
                              fontFamily: fontSans,
                              fontSize: 14,
                              fontWeight: 500,
                              color: C.text,
                            }}>
                              {recipe.title}
                            </div>
                            <div style={{
                              fontFamily: fontSans,
                              fontSize: 11,
                              color: C.textMuted,
                            }}>
                              {categoryLabel} · 30 min
                            </div>
                          </button>
                          <button
                            onClick={() => {
                              removeRecipeFromMenuSection(menuId, section, recipe.id);
                              refreshMenu();
                            }}
                            aria-label="Remove recipe"
                            style={{
                              background: "transparent",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              color: C.removeIcon,
                            }}
                          >
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      );
                    }))}

                    {/* Add recipe row */}
                    <button
                      onClick={() => {
                        push({ name: "recipepicker", menuId, section });
                      }}
                      style={{
                        width: "100%",
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 16px",
                        background: "transparent",
                        border: "none",
                        borderTop: recipes.length > 0 ? `1px solid ${C.rowBorder}` : "none",
                        cursor: "pointer",
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.addText} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                      <span style={{
                        fontFamily: fontSans,
                        fontSize: 12,
                        fontWeight: 500,
                        color: C.addText,
                      }}>
                        add a recipe
                      </span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
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
