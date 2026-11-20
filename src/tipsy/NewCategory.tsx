import { useState, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import { categories, saveCustomCategory, updateCustomCategory, findCustomCategory, type CustomCategory } from "./data";

const C = {
  bg: "#FAF7F2",
  inputBg: "rgba(35,60,0,0.05)",
  inputBorder: "rgba(35,60,0,0.1)",
  green: "#233C00",
  cream: "#FAF7F2",
  muted: "rgba(35,60,0,0.35)",
  mutedText: "rgba(35,60,0,0.6)",
  arrow: "rgba(35,60,0,0.6)",
};

const fontDisplay = "Inter, sans-serif";
const fontSans = "Inter, sans-serif";

type Props = {
  back: () => void;
  onSaved: (cat?: CustomCategory) => void;
  editKey?: string;
  onEditSaved?: (newLabel: string) => void;
  onDeleted?: () => void;
};

export default function NewCategory({ back, onSaved, editKey, onEditSaved, onDeleted }: Props) {
  const isEdit = !!editKey;
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [gradientIdx, setGradientIdx] = useState(0);
  const [loading, setLoading] = useState(false);

  // Load existing category if editing
  useEffect(() => {
    if (isEdit && editKey) {
      const loadExisting = async () => {
        const existing = await findCustomCategory(editKey);
        if (existing) {
          setName(existing.label);
          const idx = Math.max(0, categories.findIndex((c) => c.gradient === existing.gradient));
          setGradientIdx(idx);
        }
      };
      loadExisting();
    }
  }, [isEdit, editKey]);

  const trySave = async () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    setSaveErr(false);
    setLoading(true);
    try {
      const trimmed = name.trim();
      const gradient = categories[gradientIdx].gradient;
      if (isEdit && editKey) {
        const ok = await updateCustomCategory(editKey, trimmed, gradient);
        if (!ok) {
          setSaveErr(true);
          return;
        }
        onEditSaved?.(trimmed);
      } else {
        const cat = await saveCustomCategory(trimmed, gradient);
        onSaved(cat);
      }
    } catch (error) {
      console.error('Error saving category:', error);
      setSaveErr(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg }}>
      {/* Header */}
      <div style={{
        background: C.bg,
        padding: "0 20px", height: 52,
        display: "flex", alignItems: "center",
        flexShrink: 0,
      }}>
        <button onClick={back} aria-label="Back" style={{
          background: "none", border: "none", cursor: "pointer",
          color: C.arrow,
          display: "flex", alignItems: "center", padding: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 28px", display: "flex", flexDirection: "column" }}>
        <Eyebrow>{isEdit ? "Edit category" : "New category"}</Eyebrow>
        <Title>{isEdit ? "Edit your category" : "Create a category"}</Title>
        <Sub>{isEdit ? "Update the name or style." : "Give it a name and pick a style."}</Sub>

        <div style={{ marginBottom: 18 }}>
          <Label>Category name</Label>
          <NameInput value={name} onChange={(v) => { setName(v); if (v.trim()) setNameErr(false); if (saveErr) setSaveErr(false); }} onEnter={trySave} placeholder="e.g. French, BBQ, Pasta" />
          {nameErr && <ValMsg>Please give your category a name.</ValMsg>}
          {saveErr && <ValMsg>Couldn't save changes. Please try again.</ValMsg>}
        </div>

        {!isEdit && (
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
                      border: selected ? `2px solid ${C.green}` : "2px solid transparent",
                      boxSizing: "border-box",
                    }}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button onClick={trySave} style={{
          width: "100%", background: C.green, color: C.cream, border: "none",
          borderRadius: 14, padding: "14px",
          fontFamily: fontSans, fontSize: 12, fontWeight: 500,
          letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
          marginTop: 8,
        }}>{isEdit ? "Save changes" : "Save category"}</button>
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6, fontWeight: 500 }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontDisplay, fontSize: 28, fontWeight: 400, color: C.green, marginBottom: 8, lineHeight: 1.1, textTransform: "uppercase" }}>{children}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 13, color: C.mutedText, lineHeight: 1.5, marginBottom: 20 }}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontFamily: fontSans, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 8, fontWeight: 500 }}>{children}</label>;
}
function ValMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 11, color: "#B85C5C", marginTop: 5 }}>{children}</div>;
}

const inputStyleBase: CSSProperties = {
  width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`,
  borderRadius: 10, padding: "14px 16px",
  fontFamily: fontSans, fontSize: 16, color: C.green, fontWeight: 400,
  outline: "none", WebkitAppearance: "none",
};

function NameInput({ value, onChange, placeholder, onEnter }: { value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void }) {
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); }
  };
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      placeholder={placeholder}
      style={inputStyleBase}
    />
  );
}