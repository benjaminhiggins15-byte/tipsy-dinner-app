import { useState, type CSSProperties, type KeyboardEvent } from "react";
import { categories, saveCustomCategory } from "./data";

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
  onSaved: () => void;
};

export default function NewCategory({ back, onSaved }: Props) {
  const [name, setName] = useState("");
  const [nameErr, setNameErr] = useState(false);
  const [gradientIdx, setGradientIdx] = useState(0);

  const trySave = () => {
    if (!name.trim()) {
      setNameErr(true);
      return;
    }
    saveCustomCategory(name.trim(), categories[gradientIdx].gradient);
    onSaved();
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
        <button onClick={back} style={{
          background: "none", border: "none", cursor: "pointer",
          fontFamily: fontSans, fontSize: 10, fontWeight: 500,
          letterSpacing: "0.1em", textTransform: "uppercase", color: C.midBlue,
          display: "flex", alignItems: "center", gap: 4, padding: 0,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <div style={{
          fontFamily: fontSerif, fontSize: 16, color: C.navy,
          position: "absolute", left: "50%", transform: "translateX(-50%)",
        }}>Tipsy Dinner</div>
        <div style={{ width: 50 }} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 28px", display: "flex", flexDirection: "column" }}>
        <Eyebrow>New category</Eyebrow>
        <Title>Create a category</Title>
        <Sub>Give it a name and pick a style.</Sub>

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
        }}>Save category</button>
      </div>
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