import { useState, useEffect, type CSSProperties } from "react";
import { supabase } from "../lib/supabase";
import { isValidHandleFormat, generateTasteProfile, splitConstraintsForDisplay, buildConstraintsString, composeAllergyBoxEdit, saveDrinkPreference, type StructuredAllergies } from "./data";
import { beginAccountDeletion, cancelAccountDeletion } from "../lib/events";

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  allergies: StructuredAllergies | null;
  display_name: string;
  handle: string;
  onboarding_complete: boolean;
  wants_pairings: boolean | null;
  drink_preference: string | null;
  alcohol_ok: boolean | null;
};

const KEYS = {
  name: "tipsyDinnerName",
  email: "tipsyDinnerEmail",
  palate: "tipsyDinnerPalate",
  inspiration: "tipsyDinnerInspiration",
  table: "tipsyDinnerTable",
  constraints: "tipsyDinnerConstraints",
} as const;

type FieldKey = "email" | "palate" | "inspiration" | "table" | "constraints" | "identity" | "drinks";

function read(k: string): string {
  try { return localStorage.getItem(k) ?? ""; } catch { return ""; }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ size = 28, onClick, name }: { size?: number; onClick?: () => void; name?: string }) {
  const initials = getInitials(name || read(KEYS.name));
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

function Row({ title, subtitle, onClick, muted = false, noBorder = false, attached = false }: { title: string; subtitle?: string; onClick?: () => void; muted?: boolean; noBorder?: boolean; attached?: boolean }) {
  return (
    <button
      style={{
        ...rowStyle,
        paddingTop: attached ? 2 : 14,
        paddingBottom: noBorder ? 8 : 14,
        borderBottom: noBorder ? "none" : rowStyle.borderBottom,
      }}
      onClick={onClick}
    >
      <div>
        <div style={muted ? subStyle : titleStyle}>{title}</div>
        {subtitle !== undefined && <div style={subStyle}>{subtitle}</div>}
      </div>
      <div style={chevStyle}>›</div>
    </button>
  );
}

// Switch visual/interaction pattern copied verbatim from App.tsx's
// share_show_name toggle (the only toggle in the codebase) — no shared
// toggle component exists to import, so the pixel values below are
// replicated rather than re-derived.
function ToggleRow({ title, on, onToggle }: { title: string; on: boolean; onToggle: () => void }) {
  return (
    <div style={rowStyle}>
      <div style={titleStyle}>{title}</div>
      <button
        onClick={onToggle}
        style={{
          width: 28, height: 16, borderRadius: 999, border: "none", padding: 0,
          cursor: "pointer", position: "relative",
          background: on ? "#233C00" : "rgba(35,60,0,0.15)",
          transition: "background 150ms ease",
        }}
      >
        <div
          style={{
            width: 12, height: 12, borderRadius: "50%", background: "#FAF7F2",
            position: "absolute", top: 2, left: 2,
            transform: on ? "translateX(12px)" : "translateX(0)",
            transition: "transform 150ms ease",
          }}
        />
      </button>
    </div>
  );
}

const FIELD_META: Record<FieldKey, { label: string; multiline: boolean }> = {
  email: { label: "Email", multiline: false },
  palate: { label: "Your palate", multiline: true },
  inspiration: { label: "Inspiration", multiline: true },
  table: { label: "Your table", multiline: true },
  constraints: { label: "Constraints", multiline: true },
  identity: { label: "Edit Profile", multiline: false },
  drinks: { label: "What you like to drink", multiline: true },
};

const fieldLabelStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  marginBottom: 6,
};

export default function Profile({ back, openEdit, isTabRoot = false, onSignOut, profile, onUpdate, openAccountPrivacy }: { back: () => void; openEdit: (k: FieldKey) => void; isTabRoot?: boolean; onSignOut: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void>; openAccountPrivacy: () => void }) {
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
        <button
          onClick={() => openEdit("identity")}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#233C00", lineHeight: 1.2 }}>
              {profile?.display_name || "Add your name"}
            </div>
            <div style={{ fontFamily: "'Fraunces', serif", fontStyle: "italic", fontWeight: 300, fontSize: 12, color: "rgba(35,60,0,0.45)", marginTop: 2 }}>
              {profile?.handle ? `@${profile.handle}` : "add a handle"}
            </div>
          </div>
          <div style={{ color: "rgba(35,60,0,0.25)", fontSize: 16 }}>›</div>
        </button>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Avatar name={profile?.display_name} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div style={sectionLabel}>Account</div>
        <Row title="Email" subtitle={read(KEYS.email) || "—"} onClick={() => openEdit("email")} />

        <div style={sectionLabel}>Your Kitchen</div>
        <Row title="Your palate" subtitle={trim30(profile?.palate || "")} onClick={() => openEdit("palate")} />
        <Row title="Inspiration" subtitle={trim30(profile?.inspiration || "")} onClick={() => openEdit("inspiration")} />
        <ToggleRow
          title="Drink pairings"
          on={profile?.wants_pairings ?? false}
          onToggle={() => {
            onUpdate({ wants_pairings: !(profile?.wants_pairings ?? false) }).catch((err) => console.error("Error updating wants_pairings:", err));
          }}
        />
        {(profile?.wants_pairings ?? false) && (
          <Row title="What you like to drink" subtitle={trim30(profile?.drink_preference || "")} onClick={() => openEdit("drinks")} />
        )}
        {(() => {
          const { allergyText, dislikeText } = splitConstraintsForDisplay(profile?.constraints);
          return (
            <>
              <Row title="Allergies" subtitle={allergyText ? trim30(allergyText) : "None added"} onClick={() => openEdit("constraints")} />
              <Row title="Dislikes" subtitle={dislikeText ? trim30(dislikeText) : "None added"} onClick={() => openEdit("constraints")} />
            </>
          );
        })()}

        <div style={sectionLabel}>Support</div>
        <Row title="Sign Out" onClick={handleSignOut} />
        <Row
          title="Contact us"
          onClick={() => {
            window.location.href = "mailto:info@tipsydinner.com?subject=Tipsy%20Dinner%20%E2%80%94%20question";
          }}
        />

        <div style={sectionLabel}>Privacy</div>
        <Row title="Account & privacy" onClick={openAccountPrivacy} noBorder />
      </div>
    </div>
  );
}

// Minimal settings screen (Phase 3 Step 7). Structured so future sections
// (e.g. membership) can be inserted between "Account" and the bottom
// delete-account link without disturbing either.
function PlaceholderRow({ title }: { title: string }) {
  return (
    <div style={{ ...rowStyle, cursor: "default" }}>
      <div style={titleStyle}>{title}</div>
      <div style={{ ...subStyle, marginTop: 0 }}>Coming soon</div>
    </div>
  );
}

function providerLabel(provider: string): string {
  if (provider === "google") return "Google";
  if (provider === "email") return "email & password";
  return provider;
}

export function AccountPrivacy({ back, openDeleteAccount }: { back: () => void; openDeleteAccount: () => void }) {
  // TODO(founder): no Privacy Policy / Terms of Service page exists anywhere
  // in the app yet (confirmed by repo-wide search) — these two rows are
  // inert placeholders until real pages/links exist. Flagged in the session
  // report; no policy copy was written here per instruction.
  const [authInfo, setAuthInfo] = useState<{ email: string; provider: string } | null>(null);

  useEffect(() => {
    let ignore = false;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (ignore) return;
      const user = data.user;
      if (!user) return;
      const provider = user.app_metadata?.provider || user.identities?.[0]?.provider || "email";
      setAuthInfo({ email: user.email || "", provider });
    }
    load();
    return () => { ignore = true; };
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }}>‹</button>
        <div style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }}>
          Account & Privacy
        </div>
        <div />
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        <div style={sectionLabel}>Account</div>
        <div style={{ ...rowStyle, cursor: "default" }}>
          <div>
            <div style={titleStyle}>
              {authInfo ? `Signed in with ${providerLabel(authInfo.provider)}` : "Signed in"}
            </div>
            {authInfo?.email && <div style={subStyle}>{authInfo.email}</div>}
          </div>
        </div>

        <div style={sectionLabel}>Legal</div>
        <PlaceholderRow title="Privacy Policy" />
        <PlaceholderRow title="Terms of Service" />

        <div style={{ flex: 1 }} />

        <div style={{ marginTop: 24, paddingTop: 24, paddingBottom: 32, borderTop: "1px solid rgba(35,60,0,0.06)", textAlign: "center" }}>
          <button
            onClick={openDeleteAccount}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontFamily: "'Inter', sans-serif", fontSize: 13, fontWeight: 500,
              color: "#B85C5C", textDecoration: "underline",
            }}
          >
            Delete account
          </button>
        </div>
      </div>
    </div>
  );
}

const DELETE_ACCOUNT_LOCAL_STORAGE_KEYS = [
  "tipsyDinnerName", "tipsyDinnerEmail", "tipsyDinnerPalate", "tipsyDinnerInspiration",
  "tipsyDinnerTable", "tipsyDinnerConstraints", "tipsyDinnerRecipes", "tipsyDinnerOccasions",
  "tipsyDinnerMenus", "tipsyDinnerCategories", "tipsyDinnerOnboardingComplete",
  "tipsyDinnerPendingShareToken", "tipsyDinnerAnonId",
];

// Best-effort only — the user is about to be signed out regardless, so a
// localStorage failure here (Safari private mode, quota) must never block
// the rest of the success path.
function purgeLocalAppState(userId?: string | null) {
  try {
    for (const key of DELETE_ACCOUNT_LOCAL_STORAGE_KEYS) localStorage.removeItem(key);
    if (userId) localStorage.removeItem(`recentlyShown:${userId}`);
  } catch {
    /* noop */
  }
}

type DeleteFlowState = "idle" | "deleting" | "failed" | "success";

export function DeleteAccountConfirm({ back, onSignOut, profile }: { back: () => void; onSignOut: () => void; profile: ProfileType | null }) {
  const [confirmText, setConfirmText] = useState("");
  const [state, setState] = useState<DeleteFlowState>("idle");

  const matchesDelete = confirmText.trim() === "DELETE";
  const canSubmit = state === "idle" || state === "failed";
  const isBusy = state === "deleting";

  // The ONLY place the account-deletion kill switch is turned back off —
  // per spec, a failed attempt leaves it on (nothing should log while a
  // retry might still happen); only backing out of this screen entirely
  // resumes normal logEvent/ai-chat behavior. Safe to call unconditionally:
  // it's a no-op if the flag was never set (e.g. idle Cancel, pre-attempt).
  const handleCancel = () => {
    if (isBusy) return;
    cancelAccountDeletion();
    back();
  };

  const handleDelete = async () => {
    if (!matchesDelete || !canSubmit) return;
    setState("deleting");
    beginAccountDeletion();
    try {
      const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
      // NOTE (flagged for founder review): the spec for this screen says to
      // treat only `{ success: true }` as success. The already-deployed
      // delete-account edge function (supabase/functions/delete-account/index.ts)
      // returns `{ deleted: true, user_id, data, storage, auth }` on success
      // and `{ success: false, step, message }` on failure — there is no
      // `success: true` success shape today. Checking both `deleted === true`
      // and `success === true` matches the actual deployed contract while
      // staying forward-compatible if that function is ever changed to add
      // `success: true`. Not redeploying the function as part of this step.
      const body = data as { deleted?: boolean; success?: boolean } | null;
      const ok = !error && !!body && (body.deleted === true || body.success === true);
      if (ok) {
        purgeLocalAppState(profile?.id);
        setState("success");
      } else {
        console.error("delete-account failed:", error?.message, data);
        setState("failed");
      }
    } catch (err) {
      console.error("delete-account threw:", err);
      setState("failed");
    }
  };

  // Deferred to the Done tap, not fired immediately on success: the app's
  // existing onAuthStateChange listener (App.tsx) reacts to session becoming
  // null by unmounting the whole app shell (back to AuthFlow) and resetting
  // tabStacks/profile — if signOut ran immediately on success, that teardown
  // would race the render of this very success screen and could make the
  // "your account has been deleted" confirmation flash by unseen or never
  // render at all. Waiting for an explicit Done tap guarantees the user
  // actually sees the confirmation before the session is torn down.
  const handleDone = async () => {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.error("local sign-out after account deletion failed:", err);
    }
    onSignOut();
  };

  if (state === "success") {
    return (
      <div style={{
        display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2",
        padding: "0 24px", justifyContent: "center", alignItems: "center", textAlign: "center", gap: 24,
      }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 18, fontWeight: 700, color: "#233C00", lineHeight: 1.4 }}>
          Your account and data have been deleted.
        </div>
        <button
          onClick={handleDone}
          style={{
            background: "#233C00", color: "#FAF7F2", border: "none",
            borderRadius: 100, padding: "14px 40px",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer",
          }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button
          onClick={handleCancel}
          disabled={isBusy}
          style={{
            background: "none", border: "none", color: "rgba(35,60,0,0.6)", fontSize: 22,
            padding: 0, textAlign: "left", cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.4 : 1,
          }}
        >
          ‹
        </button>
        <div />
        <div />
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, color: "#233C00" }}>
          Delete your account?
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#233C00", lineHeight: 1.5 }}>
          This permanently deletes your account and everything in it — your recipes, menus, grocery list, cooking history, and friend connections.
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, color: "#233C00", lineHeight: 1.5 }}>
          Recipes you've shared that friends already saved will stay in their libraries, but your name will be removed from them.
        </div>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 14, fontWeight: 600, color: "#233C00", lineHeight: 1.5 }}>
          This can't be undone.
        </div>

        <div style={{ marginTop: 12 }}>
          <div style={fieldLabelStyle}>Type DELETE to confirm</div>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            disabled={isBusy}
            type="text"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{
              width: "100%", background: "rgba(35,60,0,0.05)",
              border: "1px solid rgba(35,60,0,0.12)", borderRadius: 12,
              padding: "12px 14px", fontFamily: "'Inter', sans-serif", fontSize: 16,
              color: "#233C00", outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {state === "failed" && (
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "#B85C5C" }}>
            Something went wrong and your account was not deleted. Please try again.
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button
          onClick={handleCancel}
          disabled={isBusy}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 100,
            background: "#233C00", border: "none", color: "#FAF7F2",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            cursor: isBusy ? "default" : "pointer", opacity: isBusy ? 0.5 : 1,
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleDelete}
          disabled={!matchesDelete || !canSubmit}
          style={{
            width: "100%", padding: "14px 0", borderRadius: 100,
            background: "#B85C5C", border: "none", color: "#FAF7F2",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            cursor: (!matchesDelete || !canSubmit) ? "default" : "pointer",
            opacity: (!matchesDelete || !canSubmit) ? 0.4 : 1,
          }}
        >
          {isBusy ? "Deleting your account…" : "Delete my account"}
        </button>
      </div>
    </div>
  );
}

function ProfileEditIdentity({ back, profile, onUpdate }: { back: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void> }) {
  const [nameVal, setNameVal] = useState(profile?.display_name || "");
  const [handleVal, setHandleVal] = useState(profile?.handle || "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const inputBase: CSSProperties = {
    width: "100%",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'Inter', sans-serif",
    fontSize: 16,
    color: "#233C00",
    outline: "none",
    lineHeight: 1.6,
    boxSizing: "border-box",
  };

  const handleSave = async () => {
    const normalizedHandle = handleVal.trim().toLowerCase();
    if (!isValidHandleFormat(normalizedHandle)) {
      setError("That handle isn't a valid format.");
      return;
    }
    setSaving(true);
    try {
      await onUpdate({ display_name: nameVal, handle: normalizedHandle });
      back();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "23505") {
        setError("That handle is already taken.");
      } else {
        setError("Couldn't save your profile. Try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }}>‹</button>
        <div style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }}>
          Edit Profile
        </div>
        <div />
      </div>
      <div style={{ flex: 1, padding: "12px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={fieldLabelStyle}>Name</div>
          <input
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            type="text"
            style={inputBase}
          />
        </div>
        <div>
          <div style={fieldLabelStyle}>Username</div>
          <input
            value={handleVal}
            onChange={(e) => { setHandleVal(e.target.value); if (error) setError(""); }}
            type="text"
            style={inputBase}
          />
          <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 12, color: error ? "#B85C5C" : "rgba(35,60,0,0.35)", marginTop: 8 }}>
            {error || "3-20 characters: lowercase letters, numbers, underscores."}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <button
          disabled={saving}
          onClick={handleSave}
          style={{
            background: "#233C00", color: "#FAF7F2", border: "none",
            borderRadius: 100, padding: "14px 0", opacity: saving ? 0.6 : 1,
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

// Piece 3+4's dedicated two-box editor for the Allergies/Dislikes split.
// Mirrors ProfileEditIdentity's pattern (a standalone sub-component with its
// own multi-field state) rather than living inside the generic single-value
// ProfileEdit below — the save logic here is fundamentally different (two
// independently-tracked values, one of which triggers an AI composer call
// and one of which never does).
function ProfileEditConstraints({ back, profile, onUpdate }: { back: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void> }) {
  const initial = splitConstraintsForDisplay(profile?.constraints);
  const [allergyVal, setAllergyVal] = useState(initial.allergyText);
  const [dislikeVal, setDislikeVal] = useState(initial.dislikeText);
  const [isSaving, setIsSaving] = useState(false);

  const inputBase: CSSProperties = {
    width: "100%",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'Inter', sans-serif",
    fontSize: 16,
    color: "#233C00",
    outline: "none",
    lineHeight: 1.6,
    boxSizing: "border-box",
  };

  const handleSave = async () => {
    const allergyChanged = allergyVal !== initial.allergyText;
    const dislikeChanged = dislikeVal !== initial.dislikeText;
    if (!allergyChanged && !dislikeChanged) {
      back();
      return;
    }
    setIsSaving(true);
    try {
      const constraintsToWrite = buildConstraintsString(allergyVal, dislikeVal);
      const updates: Partial<ProfileType> = { constraints: constraintsToWrite };
      // Only touch profiles.allergies when the Allergies box itself changed —
      // a dislikes-only edit must never turn a legacy NULL (never asked) into
      // a confirmed value, and updateProfile's upsert only writes keys that
      // are actually present, so omitting it here leaves the column alone.
      if (allergyChanged) {
        updates.allergies = await composeAllergyBoxEdit(allergyVal);
      }
      await onUpdate(updates);
      if (profile) {
        generateTasteProfile(profile.id, {
          palate: profile.palate,
          inspiration: profile.inspiration,
          constraints: constraintsToWrite,
        });
      }
    } finally {
      setIsSaving(false);
    }
    back();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }}>‹</button>
        <div style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }}>
          Constraints
        </div>
        <div />
      </div>
      <div style={{ flex: 1, padding: "12px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div style={fieldLabelStyle}>Allergies</div>
          <textarea
            value={allergyVal}
            onChange={(e) => setAllergyVal(e.target.value)}
            placeholder="None added"
            style={{ ...inputBase, height: 100, resize: "none" }}
          />
        </div>
        <div>
          <div style={fieldLabelStyle}>Dislikes</div>
          <textarea
            value={dislikeVal}
            onChange={(e) => setDislikeVal(e.target.value)}
            placeholder="None added"
            style={{ ...inputBase, height: 100, resize: "none" }}
          />
        </div>
        <div style={{ flex: 1 }} />
        <button
          disabled={isSaving}
          onClick={handleSave}
          style={{
            background: "#233C00", color: "#FAF7F2", border: "none",
            borderRadius: 100, padding: "14px 0",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            width: "100%", cursor: isSaving ? "default" : "pointer",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// Standalone editor for drink_preference, pulled out of the generic
// ProfileEdit below for the same reason ProfileEditConstraints was: the save
// logic is fundamentally different (routes through saveDrinkPreference,
// which needs profile.id and owns its own background alcohol_ok write).
function ProfileEditDrinks({ back, profile, onUpdate }: { back: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void> }) {
  const initialVal = profile?.drink_preference || "";
  const [val, setVal] = useState(initialVal);
  const [isSaving, setIsSaving] = useState(false);

  const inputBase: CSSProperties = {
    width: "100%",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'Inter', sans-serif",
    fontSize: 16,
    color: "#233C00",
    outline: "none",
    lineHeight: 1.6,
    boxSizing: "border-box",
  };

  const handleSave = async () => {
    if (val !== initialVal) {
      if (!profile?.id) {
        console.error("ProfileEditDrinks: cannot save, no profile id");
      } else {
        setIsSaving(true);
        try {
          await saveDrinkPreference(val, onUpdate, profile.id);
        } finally {
          setIsSaving(false);
        }
      }
    }
    back();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div style={{
        display: "grid", gridTemplateColumns: "44px 1fr 44px", alignItems: "center",
        padding: "20px 16px 14px",
      }}>
        <button onClick={back} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(35,60,0,0.6)", fontSize: 22, padding: 0, textAlign: "left" }}>‹</button>
        <div style={{ textAlign: "center", fontFamily: "'Inter', sans-serif", fontSize: 20, fontWeight: 700, textTransform: "uppercase", color: "#233C00" }}>
          What you like to drink
        </div>
        <div />
      </div>
      <div style={{ flex: 1, padding: "12px 24px 24px", display: "flex", flexDirection: "column" }}>
        <textarea
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="Wine, cocktails, tea, fizzy stuff — whatever you reach for."
          style={{ ...inputBase, height: "45%", resize: "none" }}
        />
        <div style={{ flex: 1 }} />
        <button
          disabled={isSaving}
          onClick={handleSave}
          style={{
            background: "#233C00", color: "#FAF7F2", border: "none",
            borderRadius: 100, padding: "14px 0",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            width: "100%", cursor: isSaving ? "default" : "pointer",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

export function ProfileEdit({ fieldKey, back, profile, onUpdate }: { fieldKey: FieldKey; back: () => void; profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void> }) {
  if (fieldKey === "identity") {
    return <ProfileEditIdentity back={back} profile={profile} onUpdate={onUpdate} />;
  }
  if (fieldKey === "constraints") {
    return <ProfileEditConstraints back={back} profile={profile} onUpdate={onUpdate} />;
  }
  if (fieldKey === "drinks") {
    return <ProfileEditDrinks back={back} profile={profile} onUpdate={onUpdate} />;
  }
  const meta = FIELD_META[fieldKey];
  const storageKey = KEYS[fieldKey];

  // Get initial value from profile if it's one of the migrated fields, otherwise from localStorage
  const getInitialValue = () => {
    if (fieldKey === "palate") return profile?.palate || "";
    if (fieldKey === "inspiration") return profile?.inspiration || "";
    return read(storageKey);
  };

  const [val, setVal] = useState(getInitialValue());
  const [isSaving, setIsSaving] = useState(false);
  const inputBase: CSSProperties = {
    width: "100%",
    background: "rgba(35,60,0,0.05)",
    border: "1px solid rgba(35,60,0,0.12)",
    borderRadius: 12,
    padding: "12px 14px",
    fontFamily: "'Inter', sans-serif",
    fontSize: 16,
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
          disabled={isSaving}
          onClick={async () => {
            setIsSaving(true);
            try {
              // Use Supabase for migrated fields, localStorage for legacy fields
              if (fieldKey === "palate" || fieldKey === "inspiration") {
                const previousValue = fieldKey === "palate" ? (profile?.palate || "") : (profile?.inspiration || "");
                const changed = val !== previousValue;

                await onUpdate({ [fieldKey]: val });
                if (changed && profile) {
                  generateTasteProfile(profile.id, {
                    palate: fieldKey === "palate" ? val : profile.palate,
                    inspiration: fieldKey === "inspiration" ? val : profile.inspiration,
                    constraints: profile.constraints,
                  });
                }
              } else {
                // Legacy fields (email, table) still use localStorage
                try { localStorage.setItem(storageKey, val); } catch { /* noop */ }
              }
            } finally {
              setIsSaving(false);
            }
            back();
          }}
          style={{
            background: "#233C00", color: "#FAF7F2", border: "none",
            borderRadius: 100, padding: "14px 0",
            fontFamily: "'Inter', sans-serif", fontSize: 12, fontWeight: 500,
            letterSpacing: "0.12em", textTransform: "uppercase",
            width: "100%", cursor: isSaving ? "default" : "pointer",
            opacity: isSaving ? 0.6 : 1,
          }}
        >
          {isSaving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}