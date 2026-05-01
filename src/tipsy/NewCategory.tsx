import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { categories, saveCustomCategory, updateCustomCategory, deleteCustomCategory, findCustomCategory, type CustomCategory } from "./data";

const C = {
  bg: "#EEF4F8",
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

type Props = {
  back: () => void;
  onSaved: (cat?: CustomCategory) => void;
  editKey?: string;
  onEditSaved?: (newLabel: string) => void;
  onDeleted?: () => void;
};

export default function NewCategory({ back, onSaved, editKey, onEditSaved, onDeleted }: Props) {
  const isEdit = !!editKey;
  const existing = isEdit ? findCustomCategory(editKey!) : null;
  const initialGradientIdx = existing
    ? Math.max(0, categories.findIndex((c) => c.gradient === existing.gradient))
    : 0;
  const [name, setName] = useState(existing?.label ?? "");
  const [nameErr, setNameErr] = useState(false);
  const [gradientIdx, setGradientIdx] = useState(initialGradientIdx);
  const [showDelete, setShowDelete] = useState(false);

  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    const trimmed = name.trim();
    const gradient = categories[gradientIdx].gradient;
    if (isEdit && editKey) {
      updateCustomCategory(editKey, trimmed, gradient);
      onEditSaved?.(trimmed);
    } else {
      const cat = saveCustomCategory(trimmed, gradient);
      onSaved(cat);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Header */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.borderLight}`,
        padding: "0 16px", height: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", flexShrink: 0,
      }}>
        <button onClick={back} aria-label="Back" style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.midBlue,
          display: "flex", alignItems: "center", padding: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div style={{
          fontFamily: fontSerif, fontSize: 16, color: C.navy,
          position: "absolute", left: "50%", transform: "translateX(-50%)",
        }}>Tipsy Dinner</div>
        <div style={{ width: 50 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 28px", display: "flex", flexDirection: "column" }}>
        <Eyebrow>{isEdit ? "Edit category" : "New category"}</Eyebrow>
        <Title>{isEdit ? "Edit your category" : "Create a category"}</Title>
        <Sub>{isEdit ? "Update the name or style." : "Give it a name and pick a style."}</Sub>

        <div style={{ marginBottom: 18 }}>
          <Label>Category name</Label>
          <NameInput value={name} onChange={(v) => { setName(v); if (v.trim()) setNameErr(false); }} onEnter={trySave} placeholder="e.g. French, BBQ, Pasta" />
          {nameErr && <ValMsg>Please give your category a name.</ValMsg>}
        </div>

        <div style={{ marginBottom: 18 }}>
          <Label>Choose a style</Label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            {categories.map((c, i) => {
              const selected = i === gradientIdx;
              return (
                <button
                  key={c.key}
                  onClick={() => setGradientIdx(i)}
                  aria-label={`Style ${i + 1}`}
                  style={{
                    width: "100%", aspectRatio: "1 / 1",
                    borderRadius: 12, cursor: "pointer", padding: 0,
                    background: c.gradient,
                    border: selected ? `2px solid ${C.btnBlue}` : "2px solid transparent",
                    boxSizing: "border-box",
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={trySave} style={{
          width: "100%", background: C.btnBlue, color: C.white, border: "none",
          borderRadius: 12, padding: "14px",
          fontFamily: fontSans, fontSize: 12, fontWeight: 600,
          letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
          marginTop: 8,
        }}>{isEdit ? "Save changes" : "Save category"}</button>

        {isEdit && (
          <button onClick={() => setShowDelete(true)} style={{
            width: "100%", background: "transparent", color: "#B85C5C",
            border: "none", padding: "12px",
            fontFamily: fontSans, fontSize: 12, fontWeight: 600,
            letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
            marginTop: 4,
          }}>Delete category</button>
        )}
      </div>

      {isEdit && showDelete && (
        <div
          onClick={() => setShowDelete(false)}
          style={{
            position: "absolute", inset: 0, background: "rgba(4,44,83,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10, padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.bg, borderRadius: 16, padding: "24px 20px",
              width: "100%", maxWidth: 280, display: "flex", flexDirection: "column",
              gap: 8, border: `0.5px solid ${C.border}`,
            }}
          >
            <div style={{ fontFamily: fontSerif, fontSize: 20, color: C.navy, fontWeight: 400, textAlign: "center" }}>
              Delete this category?
            </div>
            <div style={{ fontFamily: fontSans, fontSize: 13, color: C.midBlue, textAlign: "center", marginBottom: 12 }}>
              This will also remove all recipes saved to this category. This can't be undone.
            </div>
            <button
              onClick={() => setShowDelete(false)}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "transparent", border: `0.5px solid ${C.border}`,
                color: C.midBlue, fontFamily: fontSans,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (editKey) deleteCustomCategory(editKey);
                setShowDelete(false);
                onDeleted?.();
              }}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "#B85C5C", border: "none",
                color: "#fff", fontFamily: fontSans,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSerif, fontSize: 22, fontWeight: 500, color: C.navy, marginBottom: 4, lineHeight: 1.25 }}>{children}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 12, color: C.muted, lineHeight: 1.5, marginBottom: 20 }}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontFamily: fontSans, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 8 }}>{children}</label>;
}
function ValMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 11, color: "#c0392b", marginTop: 5 }}>{children}</div>;
}

const inputStyleBase: CSSProperties = {
  width: "100%", background: C.white, border: `1px solid ${C.borderLight}`,
  borderRadius: 10, padding: "11px 14px",
  fontFamily: fontSans, fontSize: 13, color: C.navy,
  outline: "none", WebkitAppearance: "none",
};

function NameInput({ value, onChange, placeholder, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void }) {
  const [focused, setFocused] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); }
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