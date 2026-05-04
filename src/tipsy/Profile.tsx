import { useState, type CSSProperties } from "react";

const KEYS = {
  name: "tipsyDinnerName",
  email: "tipsyDinnerEmail",
  palate: "tipsyDinnerPalate",
  inspiration: "tipsyDinnerInspiration",
  table: "tipsyDinnerTable",
  constraints: "tipsyDinnerConstraints",
} as const;

type FieldKey = keyof typeof KEYS;

function read(k: string): string {
  try { return localStorage.getItem(k) ?? ""; } catch { return ""; }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ size = 28, onClick }: { size?: number; onClick?: () => void }) {
  const initials = getInitials(read(KEYS.name));
  return (
    <button
      onClick={onClick}
      style={{
        width: size, height: size, borderRadius: "50%",
        background: "#185FA5", color: "#FFFFFF",
        border: "none", cursor: onClick ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
        padding: 0, lineHeight: 1,
      }}
    >
      {initials}
    </button>
  );
}

const sectionLabel: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#185FA5",
  opacity: 0.7,
  background: "#E6F1FB",
  padding: "16px 20px 8px",
};

const rowStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  background: "#EEF4F8", padding: "14px 20px",
  borderBottom: "0.5px solid #85B7EB",
  cursor: "pointer", border: "none", width: "100%", textAlign: "left",
};

const titleStyle: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#042C53",
};
const subStyle: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: "#185FA5",
  opacity: 0.7, marginTop: 2,
};
const chevStyle: CSSProperties = {
  color: "#85B7EB", fontSize: 18, fontFamily: "'DM Sans', sans-serif",
};

function trim30(s: string) {
  if (!s) return "—";
  return s.length > 30 ? s.slice(0, 30) + "…" : s;
}

function Row({ title, subtitle, onClick }: { title: string; subtitle?: string; onClick?: () => void }) {
  return (
    <button style={rowStyle} onClick={onClick}>
      <div>
        <div style={titleStyle}>{title}</div>
        {subtitle !== undefined && <div style={subStyle}>{subtitle}</div>}
      </div>
      <div style={chevStyle}>›</div>
    </button>
  );
}

const FIELD_META: Record<FieldKey, { label: string; multiline: boolean }> = {
  name: { label: "Name", multiline: false },
  email: { label: "Email", multiline: false },
  palate: { label: "Your palate", multiline: true },
  inspiration: { label: "Inspiration", multiline: true },
  table: { label: "Your table", multiline: true },
  constraints: { label: "Constraints", multiline: true },
};

export default function Profile({ back }: { back: () => void }) {
  const [, force] = useState(0);
  const [editing, setEditing] = useState<FieldKey | null>(null);
  const refresh = () => force((n) => n + 1);

  if (editing) {
    return (
      <EditField
        fieldKey={editing}
        back={() => { setEditing(null); refresh(); }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#EEF4F8" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "#185FA5", fontSize: 22, padding: 0, textAlign: "left" }}>
          ‹
        </button>
        <div style={{ textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#042C53" }}>
          Profile
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Avatar />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={sectionLabel}>Account</div>
        <Row title="Name" subtitle={read(KEYS.name) || "—"} onClick={() => setEditing("name")} />
        <Row title="Email" subtitle={read(KEYS.email) || "—"} onClick={() => setEditing("email")} />

        <div style={sectionLabel}>Your Kitchen</div>
        <Row title="Your palate" subtitle={trim30(read(KEYS.palate))} onClick={() => setEditing("palate")} />
        <Row title="Inspiration" subtitle={trim30(read(KEYS.inspiration))} onClick={() => setEditing("inspiration")} />
        <Row title="Your table" subtitle={trim30(read(KEYS.table))} onClick={() => setEditing("table")} />
        <Row title="Constraints" subtitle={trim30(read(KEYS.constraints))} onClick={() => setEditing("constraints")} />

        <div style={sectionLabel}>Support</div>
        <Row title="Contact us" />
      </div>
    </div>
  );
}

function EditField({ fieldKey, back }: { fieldKey: FieldKey; back: () => void }) {
  const meta = FIELD_META[fieldKey];
  const storageKey = KEYS[fieldKey];
  const [val, setVal] = useState(read(storageKey));
  const inputBase: CSSProperties = {
    width: "100%",
    background: "#D8E9F7",
    border: "1px solid #85B7EB",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13,
    color: "#042C53",
    outline: "none",
    lineHeight: 1.6,
    boxSizing: "border-box",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#EEF4F8" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "#185FA5", fontSize: 22, padding: 0, textAlign: "left" }}>‹</button>
        <div style={{ textAlign: "center", fontFamily: "'Playfair Display', serif", fontSize: 20, color: "#042C53" }}>
          {meta.label}
        </div>
        <div />
      </div>
      <div style={{ flex: 1, padding: "12px 24px 24px", display: "flex", flexDirection: "column" }}>
        {meta.multiline ? (
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            style={{ ...inputBase, height: "45%", resize: "none" }}
          />
        ) : (
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            type={fieldKey === "email" ? "email" : "text"}
            style={inputBase}
          />
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => {
            try { localStorage.setItem(storageKey, val); } catch { /* noop */ }
            back();
          }}
          style={{
            background: "#0C447C", color: "#EEF4F8", border: "none",
            borderRadius: 100, padding: "14px 0",
            fontFamily: "'DM Sans', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            width: "100%", cursor: "pointer",
          }}
        >
          Save
        </button>
      </div>
    </div>
  );
}