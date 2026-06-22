import { useState, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import { categories, saveCustomCategory, updateCustomCategory, deleteCustomCategory, findCustomCategory, type CustomCategory } from "./data";

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
  const [gradientIdx, setGradientIdx] = useState(0);
  const [showDelete, setShowDelete] = useState(false);
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
    setLoading(true);
    try {
      const trimmed = name.trim();
      const gradient = categories[gradientIdx].gradient;
      if (isEdit && editKey) {
        await updateCustomCategory(editKey, trimmed, gradient);
        onEditSaved?.(trimmed);
      } else {
        const cat = await saveCustomCategory(trimmed, gradient);
        onSaved(cat);
      }
    } catch (error) {
      console.error('Error saving category:', error);
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
                    border: selected ? `2px solid ${C.green}` : "2px solid transparent",
                    boxSizing: "border-box",
                  }}
                />
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <button onClick={trySave} style={{
          width: "100%", background: C.green, color: C.cream, border: "none",
          borderRadius: 14, padding: "14px",
          fontFamily: fontSans, fontSize: 12, fontWeight: 500,
          letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
          marginTop: 8,
        }}>{isEdit ? "Save changes" : "Save category"}</button>

        {isEdit && (
          <button onClick={() => setShowDelete(true)} style={{
            width: "100%", background: "transparent", color: "#B85C5C",
            border: "none", padding: "12px",
            fontFamily: fontSans, fontSize: 12, fontWeight: 500,
            letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
            marginTop: 4,
          }}>Delete category</button>
        )}
      </div>

      {isEdit && showDelete && (
        <div
          onClick={() => setShowDelete(false)}
          style={{
            position: "absolute", inset: 0, background: "rgba(35,60,0,0.6)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 10, padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.bg, borderRadius: 16, padding: "24px 20px",
              width: "100%", maxWidth: 280, display: "flex", flexDirection: "column",
              gap: 8, border: `1px solid ${C.inputBorder}`,
            }}
          >
            <div style={{ fontFamily: fontDisplay, fontSize: 24, color: C.green, fontWeight: 400, textAlign: "center", textTransform: "uppercase", lineHeight: 1.2 }}>
              Delete this category?
            </div>
            <div style={{ fontFamily: fontSans, fontSize: 13, color: C.mutedText, textAlign: "center", marginBottom: 12 }}>
              This will also remove all recipes saved to this category. This can't be undone.
            </div>
            <button
              onClick={() => setShowDelete(false)}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "transparent", border: `1px solid ${C.inputBorder}`,
                color: C.green, fontFamily: fontSans,
                fontSize: 13, fontWeight: 500, cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                if (editKey) {
                  setLoading(true);
                  try {
                    await deleteCustomCategory(editKey);
                    setShowDelete(false);
                    onDeleted?.();
                  } catch (error) {
                    console.error('Error deleting category:', error);
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "#B85C5C", border: "none",
                color: "#FAF7F2", fontFamily: fontSans,
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