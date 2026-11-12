import { useEffect, useRef, useState } from "react";
import { IconCamera } from "@tabler/icons-react";
import { logGroupingCook } from "./data";
import { compressImageFile, UnsupportedImageError } from "./image";
import { logEvent } from "../lib/events";
import { FONT_SANS, FONT_SERIF_ITALIC, FOREST, CARD_BG, CARD_BORDER, MUTED_TEXT, BODY_BG } from "./DishScreen";
import { BottomSheet, DragHandle } from "./BottomSheet";

// Dishes & Menus v1.5 step 3c — the real "LOG THIS COOK" sheet for a saved
// dish/menu, replacing the "placeholder" slot step 3a/3b routed to.
// Dish/menu analog of App.tsx's single-recipe Log a cook sheet: reuses that
// sheet's date field and decimal keypad conventions, but is its own
// component (not a fork of the RecipeCard sheet) because logGroupingCook is
// a single atomic call — no separate cook_events row, no separate postCook
// step, and no edit mode (a grouping cook is always freshly created here).

function todayLocalDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function LogGroupingCookSheet({
  groupingId,
  planTitle,
  partCount,
  onClose,
  onLogged,
}: {
  groupingId: string;
  planTitle: string;
  partCount: number;
  onClose: () => void;
  // Called once the cook is durably saved — message is "Cook logged" or
  // "Posted" depending on the publicly-posted toggle at save time.
  onLogged: (message: string) => void;
}) {
  const [date, setDate] = useState(todayLocalDateString());
  const [scoreDigits, setScoreDigits] = useState("");
  const [note, setNote] = useState("");
  const [isPosted, setIsPosted] = useState(false);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoProcessing, setPhotoProcessing] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    if (saving) return;
    onClose();
  }

  function handlePhotoClick() {
    fileInputRef.current?.click();
  }

  async function handlePhotoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoError(null);
    setPhotoProcessing(true);
    try {
      const compressed = await compressImageFile(file);
      if (photoPreviewUrl) URL.revokeObjectURL(photoPreviewUrl);
      setPhotoBlob(compressed);
      setPhotoPreviewUrl(URL.createObjectURL(compressed));
    } catch (err) {
      setPhotoError(
        err instanceof UnsupportedImageError
          ? err.message
          : "Couldn't process this photo. Please try again."
      );
    } finally {
      setPhotoProcessing(false);
    }
  }

  // Decimal keypad: builds a string left-to-right, at most one decimal
  // digit, whole part capped at 10 — matches App.tsx's single-recipe Log
  // Cook sheet exactly (1.0-10.0 or empty).
  function handleKeypadDigit(digit: string) {
    setScoreDigits((current) => {
      const dotIndex = current.indexOf(".");
      if (dotIndex !== -1 && current.length - dotIndex > 1) return current;
      if (current === "" && digit === "0") return current;
      const candidate = current + digit;
      const wholePart = dotIndex !== -1 ? candidate.slice(0, candidate.indexOf(".")) : candidate;
      if (Number(wholePart) > 10) return current;
      return candidate;
    });
  }

  function handleKeypadDecimal() {
    setScoreDigits((current) => (current === "" || current.includes(".") ? current : current + "."));
  }

  function handleKeypadBackspace() {
    setScoreDigits((current) => current.slice(0, -1));
  }

  function parseScore(): number | null {
    if (scoreDigits === "" || scoreDigits === ".") return null;
    const parsed = parseFloat(scoreDigits);
    if (Number.isNaN(parsed)) return null;
    const clamped = Math.min(10, Math.max(1, parsed));
    return Number(clamped.toFixed(1));
  }

  const score = parseScore();

  async function handleLogCook() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    const result = await logGroupingCook(groupingId, {
      cookedOn: date || todayLocalDateString(),
      score,
      note: note.trim() || null,
      isPosted,
      photoFile: photoBlob,
    });
    setSaving(false);
    if (!result) {
      setSaveError("Couldn't log this cook. Please try again.");
      return;
    }
    logEvent("cook_logged", { grouping_id: groupingId });
    onLogged(isPosted ? "Posted" : "Cook logged");
  }

  return (
    <BottomSheet onClose={handleClose} portal zIndex={200} bottomInset={0} sizing="full" showClose closeOnBackdrop>
          <div style={{ flexShrink: 0, padding: "14px 20px 0" }}>
            <DragHandle onDismiss={handleClose} />
            <div style={{ fontFamily: FONT_SANS, fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: FOREST, textAlign: "center" }}>
              Log this cook
            </div>
            <div style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT, textAlign: "center", marginTop: 4, marginBottom: 4 }}>
              {planTitle || "Untitled"} · {partCount} {partCount === 1 ? "part" : "parts"}
            </div>
          </div>

          {/* Scrollable body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "12px 20px 16px" }}>
            {/* Post publicly */}
            <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", marginBottom: 6 }}>
              <span style={{ fontFamily: FONT_SANS, fontSize: 14, fontWeight: 500, color: FOREST }}>Post publicly</span>
              <span
                role="switch"
                aria-checked={isPosted}
                onClick={() => setIsPosted((v) => !v)}
                style={{
                  position: "relative",
                  width: 42,
                  height: 24,
                  borderRadius: 12,
                  background: isPosted ? FOREST : "rgba(35,60,0,0.15)",
                  transition: "background 150ms ease",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: isPosted ? 21 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#FAF7F2",
                    transition: "left 150ms ease",
                  }}
                />
              </span>
            </label>
            <div style={{ marginBottom: 20, fontFamily: FONT_SANS, fontSize: 12, color: MUTED_TEXT }}>
              {isPosted ? "Shows in the feed. Off keeps it in your private history." : "Only you see this. Turn on to share it in the feed."}
            </div>

            {/* Date */}
            <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 8 }}>
              Date
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 10,
                fontFamily: FONT_SANS,
                fontSize: 15,
                color: FOREST,
                outline: "none",
                marginBottom: 20,
              }}
            />

            {/* Photo */}
            <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 8 }}>
              Photo
            </div>
            {photoPreviewUrl ? (
              <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", borderRadius: 18, overflow: "hidden", marginBottom: 8 }}>
                <img src={photoPreviewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                <button
                  onClick={handlePhotoClick}
                  disabled={photoProcessing}
                  style={{
                    position: "absolute",
                    bottom: 10,
                    right: 10,
                    padding: "6px 14px",
                    borderRadius: 999,
                    background: FOREST,
                    border: "none",
                    color: "#FAF7F2",
                    fontFamily: FONT_SANS,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    cursor: photoProcessing ? "not-allowed" : "pointer",
                    opacity: photoProcessing ? 0.6 : 1,
                  }}
                >
                  {photoProcessing ? "…" : "Change"}
                </button>
              </div>
            ) : (
              <button
                onClick={handlePhotoClick}
                disabled={photoProcessing}
                style={{
                  width: "100%",
                  padding: "28px 20px",
                  borderRadius: 18,
                  background: "transparent",
                  border: "1.5px dashed rgba(35,60,0,0.22)",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  cursor: photoProcessing ? "not-allowed" : "pointer",
                  opacity: photoProcessing ? 0.6 : 1,
                  marginBottom: 8,
                }}
              >
                <IconCamera size={22} stroke={1.5} color={MUTED_TEXT} />
                <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 13, color: MUTED_TEXT }}>
                  {photoProcessing ? "Processing…" : "Add a photo"}
                </span>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoFileChange} style={{ display: "none" }} />
            {photoError && (
              <div style={{ marginBottom: 8, fontFamily: FONT_SANS, fontSize: 12, color: "#B85C5C" }}>{photoError}</div>
            )}
            <div style={{ marginBottom: 20 }} />

            {/* Rating */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
              <span style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT }}>
                Rating
              </span>
              <span style={{ fontFamily: FONT_SERIF_ITALIC, fontStyle: "italic", fontSize: 14, color: score != null ? FOREST : MUTED_TEXT }}>
                {score != null ? `${score.toFixed(1)} out of 10` : "Optional"}
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 20 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "back"].map((key) => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === "back") handleKeypadBackspace();
                    else if (key === ".") handleKeypadDecimal();
                    else handleKeypadDigit(key);
                  }}
                  style={{
                    padding: "14px 0",
                    background: CARD_BG,
                    border: `1px solid ${CARD_BORDER}`,
                    borderRadius: 10,
                    fontFamily: FONT_SANS,
                    fontSize: 16,
                    fontWeight: 500,
                    color: FOREST,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {key === "back" ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={FOREST} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 4H8l-7 8 7 8h13a2 2 0 002-2V6a2 2 0 00-2-2z" />
                      <line x1="18" y1="9" x2="12" y2="15" />
                      <line x1="12" y1="9" x2="18" y2="15" />
                    </svg>
                  ) : key}
                </button>
              ))}
            </div>

            {/* Note */}
            <div style={{ fontFamily: FONT_SANS, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED_TEXT, marginBottom: 8 }}>
              Note
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="How did it go?"
              rows={3}
              style={{
                width: "100%",
                padding: "12px 14px",
                background: CARD_BG,
                border: `1px solid ${CARD_BORDER}`,
                borderRadius: 10,
                fontFamily: FONT_SERIF_ITALIC,
                fontStyle: "italic",
                fontSize: 14,
                color: FOREST,
                outline: "none",
                resize: "none",
                marginBottom: 20,
              }}
            />

            {saveError && (
              <div style={{ marginTop: 16, fontFamily: FONT_SANS, fontSize: 13, color: "#B85C5C", textAlign: "center" }}>{saveError}</div>
            )}
          </div>

          {/* Pinned footer with a soft fade above the button */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              style={{
                position: "absolute",
                top: -28,
                left: 0,
                right: 0,
                height: 28,
                background: `linear-gradient(to bottom, rgba(250,247,242,0), ${BODY_BG})`,
                pointerEvents: "none",
              }}
            />
            <div style={{ padding: "0 20px 20px" }}>
              <button
                onClick={handleLogCook}
                disabled={saving}
                style={{
                  width: "100%",
                  padding: "16px 20px",
                  background: FOREST,
                  color: "#FAF7F2",
                  border: "none",
                  borderRadius: 14,
                  fontFamily: FONT_SANS,
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  cursor: saving ? "not-allowed" : "pointer",
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {saving ? "Logging…" : "Log cook"}
              </button>
            </div>
          </div>
    </BottomSheet>
  );
}
