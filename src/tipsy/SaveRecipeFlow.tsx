import { useState, type CSSProperties } from "react";
import {
  loadCustomCategories,
  loadOccasions,
  getMenusForOccasion,
  findMenu,
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
  bg: "#EEF4F8",
  accent: "#E6F1FB",
  border: "#85B7EB",
  borderLight: "#C5DCF4",
  navy: "#042C53",
  midBlue: "#185FA5",
  btnBlue: "#0C447C",
  muted: "#5A7FA3",
  white: "#ffffff",
};

const fontSerif = "'Playfair Display', serif";
const fontSans = "'DM Sans', sans-serif";

// Helper to get icon component by name
function getIconComponentByName(iconName: string) {
  const ICON_MAP: Record<string, any> = {
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
  };
  return ICON_MAP[iconName] || IconChefHat;
}

type Props = {
  onClose: () => void;
  onPick: (key: string, label: string, menuInfo?: { menuId: number; section: MenuSection }) => void;
  onNew: () => void;
  initialSelectedCategory?: { key: string; label: string } | null;
};

export default function SaveRecipeFlow({ onClose, onPick, onNew, initialSelectedCategory }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [slideDirection, setSlideDirection] = useState<"forward" | "back" | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<{ key: string; label: string } | null>(initialSelectedCategory || null);
  const [addToMenu, setAddToMenu] = useState(false);
  const [selectedOccasion, setSelectedOccasion] = useState<number | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<number | null>(null);
  const [selectedSection, setSelectedSection] = useState<MenuSection | null>(null);

  const allCats = loadCustomCategories();
  const occasions = loadOccasions();

  // Reorder categories so the initially selected one appears first
  const cats = initialSelectedCategory
    ? [
        ...allCats.filter(c => c.key === initialSelectedCategory.key),
        ...allCats.filter(c => c.key !== initialSelectedCategory.key)
      ]
    : allCats;

  const handleCategorySelect = (key: string, label: string) => {
    setSelectedCategory({ key, label });
  };

  const handleYes = () => {
    if (!selectedCategory) return;
    setAddToMenu(true);
    setSlideDirection("forward");
    setTimeout(() => setStep(2), 0);
  };

  const handleSkip = () => {
    if (!selectedCategory) return;
    onPick(selectedCategory.key, selectedCategory.label);
    setSlideDirection("forward");
    setTimeout(() => setStep(3), 0);
  };

  const handleSaveWithoutMenu = () => {
    if (!selectedCategory) return;
    onPick(selectedCategory.key, selectedCategory.label);
    setSlideDirection("forward");
    setTimeout(() => setStep(3), 0);
  };

  const handleSaveWithMenu = () => {
    if (!selectedCategory || !selectedMenu || !selectedSection) return;
    onPick(selectedCategory.key, selectedCategory.label, {
      menuId: selectedMenu,
      section: selectedSection,
    });
    setSlideDirection("forward");
    setTimeout(() => setStep(3), 0);
  };

  const handleBackToStep1 = () => {
    setSlideDirection("back");
    setTimeout(() => {
      setStep(1);
      setAddToMenu(false);
      setSelectedOccasion(null);
      setSelectedMenu(null);
      setSelectedSection(null);
    }, 0);
  };

  // Container style for slide animation
  const getStepStyle = (currentStep: number): CSSProperties => {
    if (step !== currentStep) {
      return { display: "none" };
    }

    const baseStyle: CSSProperties = {
      animation: slideDirection === "forward"
        ? "slide-in-left 300ms cubic-bezier(0.4, 0, 0.2, 1)"
        : slideDirection === "back"
        ? "slide-in-right 300ms cubic-bezier(0.4, 0, 0.2, 1)"
        : "none",
    };

    return baseStyle;
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "absolute",
        inset: 0,
        background: "rgba(4, 44, 83, 0.38)",
        zIndex: 80,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        animation: "tipsy-fade 0.22s ease",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: "20px 20px 0 0",
          padding: "16px 0 24px",
          width: "100%",
          maxHeight: "80vh",
          animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ width: 32, height: 4, borderRadius: 2, background: C.borderLight, margin: "0 auto 14px" }} />

        <div style={getStepStyle(1)}>
          {step === 1 && (
            <SaveStep1
              cats={cats}
              selectedCategory={selectedCategory}
              onSelectCategory={handleCategorySelect}
              onNew={onNew}
              onYes={handleYes}
              onSkip={handleSkip}
              onSave={handleSaveWithoutMenu}
            />
          )}
        </div>

        <div style={getStepStyle(2)}>
          {step === 2 && (
            <SaveStep2
              occasions={occasions}
              selectedCategory={selectedCategory}
              selectedOccasion={selectedOccasion}
              setSelectedOccasion={setSelectedOccasion}
              selectedMenu={selectedMenu}
              setSelectedMenu={setSelectedMenu}
              selectedSection={selectedSection}
              setSelectedSection={setSelectedSection}
              onBack={handleBackToStep1}
              onSave={handleSaveWithMenu}
            />
          )}
        </div>

        <div style={getStepStyle(3)}>
          {step === 3 && (
            <SaveStep3
              categoryLabel={selectedCategory?.label || ""}
              menuName={selectedMenu ? findMenu(selectedMenu)?.title : null}
              sectionLabel={selectedSection}
              onDone={onClose}
            />
          )}
        </div>
      </div>

      <style>{`
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes slide-in-left { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slide-in-right { from { transform: translateX(-100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      `}</style>
    </div>
  );
}

function SaveStep1({ cats, selectedCategory, onSelectCategory, onNew, onYes, onSkip, onSave }: {
  cats: any[];
  selectedCategory: { key: string; label: string } | null;
  onSelectCategory: (key: string, label: string) => void;
  onNew: () => void;
  onYes: () => void;
  onSkip: () => void;
  onSave: () => void;
}) {
  return (
    <>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.midBlue }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.borderLight }} />
      </div>

      <div style={{ padding: "0 18px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ fontFamily: fontSerif, fontSize: 17, color: C.navy, marginBottom: 2 }}>Where does it live?</div>
        <div style={{ fontFamily: fontSans, fontSize: 12, color: C.muted }}>Swipe to find the right category.</div>
      </div>

      <div style={{ overflowX: "auto", padding: "14px 18px 4px", display: "flex", gap: 10, scrollbarWidth: "none" }}>
        <button
          onClick={onNew}
          style={{
            flexShrink: 0, width: 96, cursor: "pointer",
            background: "none", padding: 0, textAlign: "left", border: "none",
          }}
        >
          <div style={{
            width: 96, height: 70, borderRadius: 12,
            background: C.accent, border: `1px solid ${C.border}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: C.midBlue, fontSize: 32, fontWeight: 300, lineHeight: 1,
            boxSizing: "border-box",
          }}>+</div>
          <div style={{ fontFamily: fontSans, fontSize: 11, fontWeight: 500, color: C.navy, padding: "6px 4px 2px" }}>New category</div>
        </button>
        {cats.map((c) => {
          const isSelected = selectedCategory?.key === c.key;
          return (
            <button
              key={c.key}
              onClick={() => onSelectCategory(c.key, c.label)}
              style={{
                flexShrink: 0, width: 96, cursor: "pointer",
                borderRadius: 12, overflow: "hidden",
                border: isSelected ? `2px solid ${C.btnBlue}` : "2px solid transparent",
                background: "none", padding: 0, textAlign: "left",
              }}
            >
              <div style={{
                width: 96, height: 70, position: "relative",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.gradient,
              }}>
                <div style={{ position: "absolute", inset: 0, background: "rgba(4, 44, 83, 0.22)" }} />
                <div style={{
                  position: "absolute", bottom: 6, left: 0, right: 0, textAlign: "center",
                  fontFamily: fontSans, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.95)",
                  textShadow: "0 1px 3px rgba(0,0,0,0.3)",
                }}>{c.label}</div>
              </div>
              <div style={{ fontFamily: fontSans, fontSize: 11, fontWeight: 500, color: C.navy, padding: "6px 4px 2px" }}>{c.label}</div>
            </button>
          );
        })}
      </div>

      {/* Add to menu question */}
      <div style={{ padding: "20px 18px 16px" }}>
        <div style={{ fontFamily: fontSans, fontSize: 13, fontWeight: 500, color: C.navy, marginBottom: 10 }}>
          Add to a menu?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={onYes}
            disabled={!selectedCategory}
            style={{
              flex: 1,
              padding: "10px",
              background: selectedCategory ? C.navy : C.borderLight,
              color: C.white,
              border: "none",
              borderRadius: 8,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: selectedCategory ? "pointer" : "not-allowed",
            }}
          >
            Yes
          </button>
          <button
            onClick={onSkip}
            disabled={!selectedCategory}
            style={{
              flex: 1,
              padding: "10px",
              background: "transparent",
              color: selectedCategory ? C.midBlue : C.borderLight,
              border: `1px solid ${selectedCategory ? C.border : C.borderLight}`,
              borderRadius: 8,
              fontFamily: fontSans,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              cursor: selectedCategory ? "pointer" : "not-allowed",
            }}
          >
            Skip
          </button>
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={!selectedCategory}
        style={{
          width: "calc(100% - 36px)",
          margin: "8px 18px 0",
          padding: "14px",
          background: selectedCategory ? C.accent : "#F5F5F5",
          border: `1px solid ${selectedCategory ? C.border : "#E0E0E0"}`,
          borderRadius: 12,
          color: selectedCategory ? C.midBlue : C.borderLight,
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          cursor: selectedCategory ? "pointer" : "not-allowed",
        }}
      >
        Save
      </button>
    </>
  );
}

function SaveStep2({ occasions, selectedOccasion, setSelectedOccasion, selectedMenu, setSelectedMenu, selectedSection, setSelectedSection, onBack, onSave }: {
  occasions: Occasion[];
  selectedOccasion: number | null;
  setSelectedOccasion: (id: number | null) => void;
  selectedMenu: number | null;
  setSelectedMenu: (id: number | null) => void;
  selectedSection: MenuSection | null;
  setSelectedSection: (section: MenuSection | null) => void;
  onBack: () => void;
  onSave: () => void;
}) {
  const menus = selectedOccasion ? getMenusForOccasion(selectedOccasion) : [];
  const selectedMenuData = selectedMenu ? findMenu(selectedMenu) : null;

  const SECTION_LABELS: Record<string, string> = {
    apps: "Apps",
    mains: "Mains",
    sides: "Sides",
    desserts: "Desserts",
    drinks: "Drinks",
  };

  return (
    <>
      {/* Step indicator */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.midBlue }} />
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.midBlue }} />
      </div>

      <div style={{ padding: "0 18px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
        <div style={{ fontFamily: fontSerif, fontSize: 17, color: C.navy, marginBottom: 2 }}>Which menu?</div>
        <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 12, color: C.muted }}>pick an occasion and course</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px", maxHeight: "50vh" }}>
        {/* Occasions list */}
        <div style={{ marginBottom: 20 }}>
          {occasions.map((occasion) => {
            const IconComponent = getIconComponentByName(occasion.icon);
            const isSelected = selectedOccasion === occasion.id;
            return (
              <button
                key={occasion.id}
                onClick={() => {
                  setSelectedOccasion(occasion.id);
                  setSelectedMenu(null);
                  setSelectedSection(null);
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px",
                  background: isSelected ? C.accent : "transparent",
                  border: `1px solid ${isSelected ? C.border : "transparent"}`,
                  borderRadius: 10,
                  cursor: "pointer",
                  marginBottom: 8,
                  textAlign: "left",
                }}
              >
                <div style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: C.accent,
                  border: `0.5px solid ${C.border}`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <IconComponent size={18} color={C.midBlue} />
                </div>
                <span style={{
                  fontFamily: fontSans,
                  fontSize: 14,
                  fontWeight: 500,
                  color: C.navy,
                }}>
                  {occasion.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Menus dropdown if occasion selected */}
        {selectedOccasion && menus.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontFamily: fontSans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 8,
            }}>
              Menu
            </div>
            {menus.map((menu) => {
              const isSelected = selectedMenu === menu.id;
              return (
                <button
                  key={menu.id}
                  onClick={() => {
                    setSelectedMenu(menu.id);
                    setSelectedSection(null);
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    background: isSelected ? C.accent : "transparent",
                    border: `1px solid ${isSelected ? C.border : C.borderLight}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    marginBottom: 6,
                    textAlign: "left",
                    fontFamily: fontSans,
                    fontSize: 13,
                    color: C.navy,
                  }}
                >
                  {menu.title}
                </button>
              );
            })}
          </div>
        )}

        {/* Course selection */}
        {selectedMenuData && (
          <div>
            <div style={{
              fontFamily: fontSans,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 8,
            }}>
              Course
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {selectedMenuData.enabledSections.map((section) => {
                const isSelected = selectedSection === section;
                return (
                  <button
                    key={section}
                    onClick={() => setSelectedSection(section)}
                    style={{
                      padding: "8px 14px",
                      background: isSelected ? C.navy : C.accent,
                      color: isSelected ? C.white : C.midBlue,
                      border: "none",
                      borderRadius: 20,
                      fontFamily: fontSans,
                      fontSize: 11,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      cursor: "pointer",
                    }}
                  >
                    {SECTION_LABELS[section]}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${C.borderLight}` }}>
        <button
          onClick={onBack}
          style={{
            background: "transparent",
            border: "none",
            color: C.midBlue,
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 500,
            cursor: "pointer",
            padding: 0,
          }}
        >
          ← Back
        </button>
        <button
          onClick={onSave}
          disabled={!selectedSection}
          style={{
            padding: "10px 24px",
            background: selectedSection ? C.accent : "#F5F5F5",
            border: `1px solid ${selectedSection ? C.border : "#E0E0E0"}`,
            borderRadius: 12,
            color: selectedSection ? C.midBlue : C.borderLight,
            fontFamily: fontSans,
            fontSize: 12,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            cursor: selectedSection ? "pointer" : "not-allowed",
          }}
        >
          Save
        </button>
      </div>
    </>
  );
}

function SaveStep3({ categoryLabel, menuName, sectionLabel, onDone }: {
  categoryLabel: string;
  menuName: string | null;
  sectionLabel: string | null;
  onDone: () => void;
}) {
  const SECTION_LABELS: Record<string, string> = {
    apps: "apps",
    mains: "mains",
    sides: "sides",
    desserts: "desserts",
    drinks: "drinks",
  };

  return (
    <div style={{ padding: "40px 18px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      {/* Checkmark */}
      <div style={{
        width: 64,
        height: 64,
        borderRadius: "50%",
        background: C.accent,
        border: `2px solid ${C.border}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={C.midBlue} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>

      {/* Success message */}
      <div style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: fontSerif,
          fontSize: 20,
          fontWeight: 500,
          color: C.navy,
          marginBottom: 6,
        }}>
          Saved to {categoryLabel}{menuName ? ` + ${menuName}` : ""}
        </div>
        {sectionLabel && (
          <div style={{
            fontFamily: fontSerif,
            fontStyle: "italic",
            fontSize: 14,
            color: C.muted,
          }}>
            added to {SECTION_LABELS[sectionLabel]}
          </div>
        )}
      </div>

      {/* Done button */}
      <button
        onClick={onDone}
        style={{
          padding: "12px 32px",
          background: C.btnBlue,
          color: C.white,
          border: "none",
          borderRadius: 12,
          fontFamily: fontSans,
          fontSize: 12,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          cursor: "pointer",
          marginTop: 8,
        }}
      >
        Done
      </button>
    </div>
  );
}
