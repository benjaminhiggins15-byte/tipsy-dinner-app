import { useState, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  display_name: string;
  onboarding_complete: boolean;
};

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
        background: "#233C00", color: "#FAF7F2",
        border: "none", cursor: onClick ? "pointer" : "default",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
        padding: 0, lineHeight: 1,
      }}
    >
      {initials}
    </button>
  );
}

const sectionLabel: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  padding: "16px 20px 8px",
};

const rowStyle: CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "space-between",
  background: "transparent", padding: "14px 20px",
  borderBottom: "1px solid rgba(35,60,0,0.06)",
  cursor: "pointer", border: "none", width: "100%", textAlign: "left",
};

const titleStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 15, fontWeight: 500, color: "#233C00",
};
const subStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 400, color: "rgba(35,60,0,0.45)",
  marginTop: 2,
};
const chevStyle: CSSProperties = {
  color: "rgba(35,60,0,0.2)", fontSize: 18, fontFamily: "'Inter', sans-serif",
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

export default function Profile({ back, openEdit, isTabRoot = false, onSignOut, profile, onUpdate }: { back: () => void; openEdit: (k: FieldKey) => void; isTabRoot?: boolean; onSignOut: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void> }) {
  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.error("Sign out error:", error);
        return;
      }
      onSignOut();
    } catch (err) {
      console.error("Unexpected sign out error:", err);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        {!isTabRoot ? (
          <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }}>
            ‹
          </button>
        ) : (
          <div />
        )}
        <div style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }}>
          Profile
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Avatar />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={sectionLabel}>Account</div>
        <Row title="Name" subtitle={profile?.display_name || read(KEYS.name) || "—"} onClick={() => openEdit("name")} />
        <Row title="Email" subtitle={read(KEYS.email) || "—"} onClick={() => openEdit("email")} />

        <div style={sectionLabel}>Your Kitchen</div>
        <Row title="Your palate" subtitle={trim30(profile?.palate || "")} onClick={() => openEdit("palate")} />
        <Row title="Inspiration" subtitle={trim30(profile?.inspiration || "")} onClick={() => openEdit("inspiration")} />
        <Row title="Constraints" subtitle={trim30(profile?.constraints || "")} onClick={() => openEdit("constraints")} />

        <div style={sectionLabel}>Support</div>
        <Row title="Sign Out" onClick={handleSignOut} />
        <Row title="Contact us" />
      </div>
    </div>
  );
}

export function ProfileEdit({ fieldKey, back, profile, onUpdate }: { fieldKey: FieldKey; back: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void> }) {
  const meta = FIELD_META[fieldKey];
  const storageKey = KEYS[fieldKey];

  // Get initial value from profile if it's one of the migrated fields, otherwise from localStorage
  const getInitialValue = () => {
    if (fieldKey === "name") return profile?.display_name || read(storageKey);
    if (fieldKey === "palate") return profile?.palate || "";
    if (fieldKey === "inspiration") return profile?.inspiration || "";
    if (fieldKey === "constraints") return profile?.constraints || "";
    return read(storageKey);
  };

  const [val, setVal] = useState(getInitialValue());
  const inputBase: CSSProperties = {
    width: "100%",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'Inter', sans-serif",
    fontSize: 13,
    color: "#233C00",
    outline: "none",
    lineHeight: 1.6,
    boxSizing: "border-box",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }}>‹</button>
        <div style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }}>
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
          onClick={async () => {
            // Use Supabase for migrated fields, localStorage for legacy fields
            if (fieldKey === "name") {
              await onUpdate({ display_name: val });
            } else if (fieldKey === "palate" || fieldKey === "inspiration" || fieldKey === "constraints") {
              await onUpdate({ [fieldKey]: val });
            } else {
              // Legacy fields (email, table) still use localStorage
              try { localStorage.setItem(storageKey, val); } catch { /* noop */ }
            }
            back();
          }}
          style={{
            background: "#233C00", color: "#FAF7F2", border: "none",
            borderRadius: 100, padding: "14px 0",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
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