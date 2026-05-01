import { useState, useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { categories, saveRecipe, updateSavedRecipe, deleteSavedRecipe, type Recipe } from "./data";

type Step = 1 | 2 | 3 | 4 | 6;

type Props = {
  back: () => void;
  goCategories: () => void;
  goRecipe: (recipe: Recipe, categoryLabel: string) => void;
  editRecipe?: Recipe;
  editCategoryLabel?: string;
  onSaveEdit?: (updated: Recipe, categoryLabel: string) => void;
  onDeleted?: () => void;
};

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
  stepMuted: "#B5D4F4",
};

const fontSerif = "'Playfair Display', serif";
const fontSans = "'DM Sans', sans-serif";

// Tray category gradients (per reference)
const trayGradients: Record<string, string> = {
  italian: "linear-gradient(135deg, #c8e6c0 0%, #8bc34a 100%)",
  spanish: "linear-gradient(135deg, #ffd59e 0%, #e8823a 100%)",
  mexican: "linear-gradient(135deg, #ffe082 0%, #e53935 100%)",
  greek: "linear-gradient(135deg, #bbdefb 0%, #1565c0 100%)",
  soups: "linear-gradient(135deg, #ffe0b2 0%, #bf6f00 100%)",
  salads: "linear-gradient(135deg, #dcedc8 0%, #388e3c 100%)",
  sandwiches: "linear-gradient(135deg, #fff3e0 0%, #c8862a 100%)",
  breakfast: "linear-gradient(135deg, #fff9c4 0%, #f9a825 100%)",
};

const trayEmoji: Record<string, string> = {
  italian: "🍝", spanish: "🥘", mexican: "🌮", greek: "🫒",
  soups: "🍲", salads: "🥗", sandwiches: "🥪", breakfast: "🍳",
};

export default function AddYourOwn({ back, goCategories, goRecipe, editRecipe, editCategoryLabel, onSaveEdit, onDeleted }: Props) {
  const isEdit = typeof editRecipe?.savedId === "number";
  const [showDelete, setShowDelete] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [title, setTitle] = useState(editRecipe?.title ?? "");
  const [desc, setDesc] = useState(editRecipe?.description ?? "");
  const [titleErr, setTitleErr] = useState(false);
  const [descErr, setDescErr] = useState(false);

  const [ingName, setIngName] = useState("");
  const [ingQty, setIngQty] = useState("");
  const [ingErr, setIngErr] = useState(false);
  const [ingredients, setIngredients] = useState<{ name: string; qty: string }[]>(editRecipe?.ingredients ?? []);

  const [stepInput, setStepInput] = useState("");
  const [stepErr, setStepErr] = useState(false);
  const [steps, setSteps] = useState<string[]>(editRecipe?.steps ?? []);

  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [trayOpen, setTrayOpen] = useState(false);
  const [savedCategory, setSavedCategory] = useState<{ key: string; label: string } | null>(null);

  // Inline edit state
  const [editing, setEditing] = useState<
    | { kind: "ingredient"; index: number; name: string; qty: string }
    | { kind: "step"; index: number; text: string }
    | null
  >(null);
  const editRowRef = useRef<HTMLDivElement | null>(null);

  const cancelEdit = () => setEditing(null);

  const startEditIngredient = (i: number) => {
    if (editing) cancelEdit();
    const it = ingredients[i];
    setEditing({ kind: "ingredient", index: i, name: it.name, qty: it.qty });
  };
  const confirmEditIngredient = () => {
    if (!editing || editing.kind !== "ingredient") return;
    if (!editing.name.trim()) return;
    const idx = editing.index;
    const next = { name: editing.name.trim(), qty: editing.qty.trim() };
    setIngredients((arr) => arr.map((v, i) => (i === idx ? next : v)));
    setEditing(null);
  };
  const startEditStep = (i: number) => {
    if (editing) cancelEdit();
    setEditing({ kind: "step", index: i, text: steps[i] });
  };
  const confirmEditStep = () => {
    if (!editing || editing.kind !== "step") return;
    if (!editing.text.trim()) return;
    const idx = editing.index;
    const text = editing.text.trim();
    setSteps((arr) => arr.map((v, i) => (i === idx ? text : v)));
    setEditing(null);
  };

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const node = editRowRef.current;
      if (node && !node.contains(e.target as Node)) cancelEdit();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [editing]);

  const headerLabel = step === 1 ? (isEdit ? "Back" : "Cook") : "Back";
  const onHeaderBack = () => {
    if (step === 1) back();
    else if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
    else if (step === 4) setStep(3);
    else if (step === 6) {
      // back from saved screen → reset and go to Cook
      reset();
      back();
    }
  };

  const reset = () => {
    setStep(1);
    setTitle(""); setDesc(""); setTitleErr(false); setDescErr(false);
    setIngName(""); setIngQty(""); setIngErr(false); setIngredients([]);
    setStepInput(""); setStepErr(false); setSteps([]);
    setTab("ingredients");
    setTrayOpen(false);
    setSavedCategory(null);
    setEditing(null);
  };

  const tryAdvance1 = () => {
    const tErr = !title.trim();
    const dErr = !desc.trim();
    setTitleErr(tErr); setDescErr(dErr);
    if (!tErr && !dErr) setStep(2);
  };

  const addIngredient = () => {
    if (!ingName.trim()) { setIngErr(true); return; }
    setIngredients((arr) => [...arr, { name: ingName.trim(), qty: ingQty.trim() }]);
    setIngName(""); setIngQty(""); setIngErr(false);
  };
  const removeIngredient = (i: number) => setIngredients((arr) => arr.filter((_, idx) => idx !== i));

  const addStep = () => {
    if (!stepInput.trim()) { setStepErr(true); return; }
    setSteps((arr) => [...arr, stepInput.trim()]);
    setStepInput(""); setStepErr(false);
  };
  const removeStep = (i: number) => setSteps((arr) => arr.filter((_, idx) => idx !== i));

  const tryAdvance3 = () => {
    if (steps.length === 0) { setStepErr(true); return; }
    setStep(4);
  };

  const onPickCategory = (key: string, label: string) => {
    saveRecipe({
      id: Date.now(),
      title: title.trim(),
      description: desc.trim(),
      category: key,
      ingredients,
      steps,
      createdAt: new Date().toISOString(),
    });
    setSavedCategory({ key, label });
    setTrayOpen(false);
    setStep(6);
  };

  const saveEdit = () => {
    if (!isEdit || !editRecipe || typeof editRecipe.savedId !== "number") return;
    updateSavedRecipe(editRecipe.savedId, {
      title: title.trim(),
      description: desc.trim(),
      ingredients,
      steps,
    });
    const updated: Recipe = {
      ...editRecipe,
      title: title.trim(),
      description: desc.trim(),
      ingredients,
      steps,
    };
    onSaveEdit?.(updated, editCategoryLabel ?? editRecipe.category);
  };

  const previewRecipe: Recipe = {
    title: title || "—",
    description: desc || "—",
    color: C.accent,
    category: savedCategory?.label.toLowerCase() ?? "your recipe",
    ingredients,
    steps,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: C.bg, position: "relative" }}>
      {/* Header */}
      <div style={{
        background: C.white, borderBottom: `1px solid ${C.borderLight}`,
        padding: "0 16px", height: 50,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", flexShrink: 0,
      }}>
        <button onClick={onHeaderBack} aria-label="Back" style={{
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

      {/* Progress */}
      {step >= 1 && step <= 3 && (
        <div style={{ background: C.white, borderBottom: `1px solid ${C.borderLight}`, padding: "10px 16px 12px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontFamily: fontSans, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted }}>Adding a recipe</span>
            <span style={{ fontFamily: fontSans, fontSize: 9, letterSpacing: "0.05em", color: C.muted }}>Step {step} of 3</span>
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {[1, 2, 3].map((p) => (
              <div key={p} style={{
                height: 3, flex: 1, borderRadius: 2,
                background: p < step ? C.btnBlue : p === step ? C.midBlue : C.borderLight,
                transition: "background 0.35s ease",
              }} />
            ))}
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px 28px" }}>
        <ScreenWrap key={step}>
          {step === 1 && (
            <>
              <Eyebrow>Step 1 — The recipe</Eyebrow>
              <Title>What are we making?</Title>
              <Sub>Give your recipe a name and a short description.</Sub>
              <Field>
                <Label>Recipe name</Label>
                <TextInput value={title} onChange={(v) => { setTitle(v); if (v.trim()) setTitleErr(false); }} placeholder="e.g. Spicy Tomato Pasta" />
                {titleErr && <ValMsg>Please give your recipe a name.</ValMsg>}
              </Field>
              <Field>
                <Label>Short description</Label>
                <TextArea value={desc} onChange={(v) => { setDesc(v); if (v.trim()) setDescErr(false); }} placeholder="One or two lines about the dish." />
                {descErr && <ValMsg>Please add a short description.</ValMsg>}
              </Field>
              <PrimaryBtn onClick={tryAdvance1}>Continue to Ingredients →</PrimaryBtn>
            </>
          )}

          {step === 2 && (
            <>
              <Eyebrow>Step 2 — Ingredients</Eyebrow>
              <Title>What goes in it?</Title>
              <Sub>Add each ingredient with a name and quantity.</Sub>

              {ingredients.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {ingredients.map((it, i) => {
                    const isEditing = editing?.kind === "ingredient" && editing.index === i;
                    if (isEditing && editing?.kind === "ingredient") {
                      return (
                        <div key={i} ref={editRowRef}>
                          <ListItem>
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 8, flex: 1 }}>
                              <EditInput
                                value={editing.name}
                                onChange={(v) => setEditing({ ...editing, name: v })}
                                placeholder="Ingredient"
                                autoFocus
                                onEnter={confirmEditIngredient}
                              />
                              <EditInput
                                value={editing.qty}
                                onChange={(v) => setEditing({ ...editing, qty: v })}
                                placeholder="Qty"
                                onEnter={confirmEditIngredient}
                              />
                            </div>
                            <ConfirmBtn onClick={confirmEditIngredient} />
                          </ListItem>
                        </div>
                      );
                    }
                    return (
                      <ListItem key={i}>
                        <div
                          onClick={() => startEditIngredient(i)}
                          style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
                        >
                          <span style={{ flex: 1, fontSize: 13, color: C.navy, lineHeight: 1.4 }}>{it.name}</span>
                          <span style={{ fontSize: 12, color: C.muted, textAlign: "right", minWidth: 60 }}>{it.qty}</span>
                        </div>
                        <DelBtn onClick={() => removeIngredient(i)} />
                      </ListItem>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 8, marginBottom: 8 }}>
                <TextInput
                  value={ingName}
                  onChange={(v) => { setIngName(v); if (v.trim()) setIngErr(false); }}
                  placeholder="Ingredient"
                  onEnter={() => {
                    const el = document.getElementById("qty-input") as HTMLInputElement | null;
                    el?.focus();
                  }}
                />
                <TextInput
                  id="qty-input"
                  value={ingQty}
                  onChange={setIngQty}
                  placeholder="Qty"
                  onEnter={addIngredient}
                />
              </div>
              {ingErr && <ValMsg>Please enter an ingredient name.</ValMsg>}

              <AddBtn onClick={addIngredient}>Add ingredient</AddBtn>
              <div style={{ height: 16 }} />
              <PrimaryBtn onClick={() => setStep(3)}>Continue to Steps →</PrimaryBtn>
              <GhostBtn onClick={() => setStep(1)}>← Back</GhostBtn>
            </>
          )}

          {step === 3 && (
            <>
              <Eyebrow>Step 3 — Method</Eyebrow>
              <Title>How do you make it?</Title>
              <Sub>Walk through each step in order.</Sub>

              {steps.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {steps.map((s, i) => {
                    const isEditing = editing?.kind === "step" && editing.index === i;
                    if (isEditing && editing?.kind === "step") {
                      return (
                        <div key={i} ref={editRowRef}>
                          <ListItem>
                            <span style={{ fontFamily: fontSerif, fontSize: 14, color: C.stepMuted, minWidth: 18, textAlign: "center" }}>{i + 1}</span>
                            <div style={{ flex: 1 }}>
                              <EditInput
                                value={editing.text}
                                onChange={(v) => setEditing({ ...editing, text: v })}
                                placeholder="Describe the step"
                                autoFocus
                                onEnter={confirmEditStep}
                              />
                            </div>
                            <ConfirmBtn onClick={confirmEditStep} />
                          </ListItem>
                        </div>
                      );
                    }
                    return (
                      <ListItem key={i}>
                        <span style={{ fontFamily: fontSerif, fontSize: 14, color: C.stepMuted, minWidth: 18, textAlign: "center" }}>{i + 1}</span>
                        <span
                          onClick={() => startEditStep(i)}
                          style={{ flex: 1, fontSize: 13, color: C.navy, lineHeight: 1.4, cursor: "pointer" }}
                        >{s}</span>
                        <DelBtn onClick={() => removeStep(i)} />
                      </ListItem>
                    );
                  })}
                </div>
              )}

              <TextInput
                value={stepInput}
                onChange={(v) => { setStepInput(v); if (v.trim()) setStepErr(false); }}
                placeholder="Describe the step"
                onEnter={addStep}
              />
              {stepErr && <ValMsg>{steps.length === 0 && !stepInput.trim() ? "Add at least one step to continue." : "Please enter a step."}</ValMsg>}

              <div style={{ height: 8 }} />
              <AddBtn onClick={addStep}>Add step</AddBtn>
              <div style={{ height: 16 }} />
              <PrimaryBtn onClick={tryAdvance3}>Preview recipe card →</PrimaryBtn>
              <GhostBtn onClick={() => setStep(2)}>← Back to Ingredients</GhostBtn>
            </>
          )}

          {step === 4 && (
            <>
              <Eyebrow>Almost there</Eyebrow>
              <Title>Here's your recipe</Title>
              <Sub>This is exactly how it will appear in Browse.</Sub>
              <PreviewCard recipe={previewRecipe} tab={tab} setTab={setTab} />
              {isEdit ? (
                <PrimaryBtn onClick={saveEdit}>Save changes</PrimaryBtn>
              ) : (
                <PrimaryBtn onClick={() => setTrayOpen(true)}>Save to Browse</PrimaryBtn>
              )}
              <GhostBtn onClick={() => setStep(3)}>← Edit recipe</GhostBtn>
              {isEdit && (
                <button onClick={() => setShowDelete(true)} style={{
                  width: "100%", background: "transparent", color: "#B85C5C",
                  border: "none", padding: "12px",
                  fontFamily: fontSans, fontSize: 12, fontWeight: 600,
                  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                  marginTop: 4,
                }}>Delete recipe</button>
              )}
            </>
          )}

          {step === 6 && savedCategory && (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "#e8f5ef", border: "1px solid #a8d9bf",
                borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#1a6e4a" }} />
                <span style={{ fontFamily: fontSans, fontSize: 12, color: "#1a6e4a", fontWeight: 500 }}>
                  Saved to {savedCategory.label}
                </span>
              </div>
              <Eyebrow>Your recipe</Eyebrow>
              <Title>{title}</Title>
              <Sub>Tap the card to view it in Browse.</Sub>
              <div onClick={() => goRecipe(previewRecipe, savedCategory.label)} style={{ cursor: "pointer" }}>
                <PreviewCard recipe={previewRecipe} tab={tab} setTab={setTab} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={reset} style={browseActionStyle(false)}>Add another</button>
                <button onClick={goCategories} style={browseActionStyle(true)}>Browse all</button>
              </div>
            </>
          )}
        </ScreenWrap>
      </div>

      {/* Bottom sheet */}
      {trayOpen && (
        <div
          onClick={() => setTrayOpen(false)}
          style={{
            position: "absolute", inset: 0, background: "rgba(4, 44, 83, 0.38)",
            zIndex: 20, display: "flex", alignItems: "flex-end", justifyContent: "center",
            animation: "tipsy-fade 0.22s ease",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: C.white, borderRadius: "20px 20px 0 0",
              padding: "16px 0 24px", width: "100%",
              animation: "tipsy-slideup 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
            }}
          >
            <div style={{ width: 32, height: 4, borderRadius: 2, background: C.borderLight, margin: "0 auto 14px" }} />
            <div style={{ padding: "0 18px 14px", borderBottom: `1px solid ${C.borderLight}` }}>
              <div style={{ fontFamily: fontSerif, fontSize: 17, color: C.navy, marginBottom: 2 }}>Where does it live?</div>
              <div style={{ fontFamily: fontSans, fontSize: 12, color: C.muted }}>Swipe to find the right category.</div>
            </div>
            <div style={{
              overflowX: "auto", padding: "14px 18px 4px", display: "flex", gap: 10,
              scrollbarWidth: "none",
            }}>
              {categories.map((c) => (
                <button
                  key={c.key}
                  onClick={() => onPickCategory(c.key, c.label)}
                  style={{
                    flexShrink: 0, width: 96, cursor: "pointer",
                    borderRadius: 12, overflow: "hidden",
                    border: "2px solid transparent", background: "none", padding: 0, textAlign: "left",
                  }}
                >
                  <div style={{
                    width: 96, height: 70, position: "relative",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: trayGradients[c.key],
                  }}>
                    <span style={{ fontSize: 26, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.15))" }}>{trayEmoji[c.key]}</span>
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
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes tipsy-fade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tipsy-slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes tipsy-fadeup { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      {isEdit && showDelete && (
        <div
          onClick={() => setShowDelete(false)}
          style={{
            position: "absolute", inset: 0, background: "rgba(4,44,83,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 30, padding: 24,
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
              Delete this recipe?
            </div>
            <div style={{ fontFamily: fontSans, fontSize: 13, color: C.midBlue, textAlign: "center", marginBottom: 12 }}>
              This can't be undone.
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
                if (editRecipe && typeof editRecipe.savedId === "number") {
                  deleteSavedRecipe(editRecipe.savedId);
                }
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

/* ---------- Small UI helpers ---------- */

function ScreenWrap({ children }: { children: React.ReactNode }) {
  return <div style={{ animation: "tipsy-fadeup 0.28s ease" }}>{children}</div>;
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
function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 18 }}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontFamily: fontSans, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.muted, marginBottom: 6 }}>{children}</label>;
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

function TextInput({
  value, onChange, placeholder, onEnter, id,
}: { value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void; id?: string }) {
  const [focused, setFocused] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); }
  };
  return (
    <input
      id={id}
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

function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      rows={3}
      style={{
        ...inputStyleBase, resize: "none", lineHeight: 1.55,
        borderColor: focused ? C.border : C.borderLight,
        boxShadow: focused ? "0 0 0 3px rgba(133,183,235,0.18)" : "none",
      }}
    />
  );
}

function PrimaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", background: C.btnBlue, color: C.white, border: "none",
      borderRadius: 12, padding: "14px",
      fontFamily: fontSans, fontSize: 12, fontWeight: 600,
      letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
      marginTop: 8,
    }}>{children}</button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", background: "none", color: C.muted,
      border: `1px solid ${C.borderLight}`, borderRadius: 12, padding: "12px",
      fontFamily: fontSans, fontSize: 12, fontWeight: 500,
      letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer",
      marginTop: 8,
    }}>{children}</button>
  );
}

function AddBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
      fontFamily: fontSans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em",
      color: C.midBlue, background: "none",
      border: `1.5px dashed ${C.border}`, borderRadius: 10,
      padding: "10px 14px", cursor: "pointer", width: "100%", marginTop: 4,
    }}>
      <span style={{
        width: 16, height: 16, borderRadius: "50%",
        background: C.accent, border: `1.5px solid ${C.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, lineHeight: 1, color: C.midBlue,
      }}>+</span>
      {children}
    </button>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: C.white, border: `1px solid ${C.borderLight}`,
      borderRadius: 10, padding: "10px 12px", marginBottom: 6, gap: 10,
      animation: "tipsy-fadeup 0.2s ease",
    }}>{children}</div>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Remove" style={{
      background: "none", border: "none", color: C.border, cursor: "pointer",
      fontSize: 15, padding: "0 0 0 4px", lineHeight: 1,
    }}>×</button>
  );
}

function EditInput({
  value, onChange, placeholder, onEnter, autoFocus,
}: { value: string; onChange: (v: string) => void; placeholder?: string; onEnter?: () => void; autoFocus?: boolean }) {
  const [focused, setFocused] = useState(false);
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onEnter) { e.preventDefault(); onEnter(); }
  };
  return (
    <input
      type="text"
      autoFocus={autoFocus}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      style={{
        ...inputStyleBase,
        padding: "8px 10px",
        fontSize: 13,
        borderColor: focused ? C.border : C.borderLight,
      }}
    />
  );
}

function ConfirmBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseDown={(e) => e.preventDefault()}
      aria-label="Confirm"
      style={{
        background: C.btnBlue, border: "none", color: C.white, cursor: "pointer",
        width: 28, height: 28, borderRadius: 8,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0, padding: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12l5 5L20 7" />
      </svg>
    </button>
  );
}

function browseActionStyle(primary: boolean): CSSProperties {
  return {
    flex: 1,
    background: primary ? C.btnBlue : "none",
    border: `1px solid ${primary ? C.btnBlue : C.borderLight}`,
    color: primary ? C.white : C.midBlue,
    borderRadius: 12, padding: "12px",
    fontFamily: fontSans, fontSize: 10, fontWeight: 600,
    letterSpacing: "0.1em", textTransform: "uppercase",
    cursor: "pointer",
  };
}

/* ---------- Preview card (matches Browse Recipe Card) ---------- */
function PreviewCard({
  recipe, tab, setTab,
}: { recipe: Recipe; tab: "ingredients" | "steps"; setTab: (t: "ingredients" | "steps") => void }) {
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  return (
    <div style={{
      background: C.white, border: `1px solid ${C.borderLight}`,
      borderRadius: 16, overflow: "hidden", marginBottom: 16,
    }}>
      <div style={{
        width: "100%", height: 140,
        background: "linear-gradient(145deg, #E6F1FB 0%, #C5DCF4 100%)",
        position: "relative",
      }}>
        <div style={{
          position: "absolute", top: 12, left: 14,
          fontFamily: fontSans, fontSize: 9, letterSpacing: "0.14em",
          textTransform: "uppercase", color: C.midBlue,
          background: "rgba(255,255,255,0.85)",
          padding: "3px 8px", borderRadius: 20, fontWeight: 600,
        }}>photo coming soon</div>
      </div>
      <div style={{ padding: "16px 18px" }}>
        <div style={{ fontFamily: fontSerif, fontSize: 19, fontWeight: 500, color: C.navy, marginBottom: 4, lineHeight: 1.25 }}>
          {recipe.title}
        </div>
        <div style={{ fontFamily: fontSans, fontSize: 12, color: C.muted, lineHeight: 1.55, marginBottom: 14 }}>
          {recipe.description}
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.borderLight}`, marginBottom: 12 }}>
          {(["ingredients", "steps"] as const).map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                flex: 1, padding: "8px 0",
                fontFamily: fontSans, fontSize: 10, letterSpacing: "0.1em",
                textTransform: "uppercase", fontWeight: 600,
                color: active ? C.navy : C.muted,
                background: "none", border: "none",
                borderBottom: `2px solid ${active ? C.btnBlue : "transparent"}`,
                cursor: "pointer",
              }}>{t}</button>
            );
          })}
        </div>
        {tab === "ingredients" && (
          ingredients.length === 0
            ? <div style={{ fontFamily: fontSans, fontSize: 12, color: C.stepMuted, fontStyle: "italic", textAlign: "center", padding: 14 }}>No ingredients added.</div>
            : ingredients.map((it, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 0", fontFamily: fontSans, fontSize: 13,
                  borderBottom: i === ingredients.length - 1 ? "none" : `1px solid ${C.borderLight}`,
                }}>
                  <span style={{ color: C.navy }}>{it.name}</span>
                  <span style={{ color: C.muted, fontSize: 12 }}>{it.qty}</span>
                </div>
              ))
        )}
        {tab === "steps" && (
          steps.length === 0
            ? <div style={{ fontFamily: fontSans, fontSize: 12, color: C.stepMuted, fontStyle: "italic", textAlign: "center", padding: 14 }}>No steps added.</div>
            : steps.map((s, i) => (
                <div key={i} style={{
                  display: "flex", gap: 14, padding: "12px 0", alignItems: "flex-start",
                  borderBottom: i === steps.length - 1 ? "none" : `1px solid ${C.borderLight}`,
                }}>
                  <span style={{ fontFamily: fontSerif, fontSize: 22, color: C.stepMuted, lineHeight: 1, minWidth: 22, paddingTop: 2 }}>{i + 1}</span>
                  <span style={{ fontFamily: fontSans, fontSize: 13, color: C.navy, lineHeight: 1.55, flex: 1 }}>{s}</span>
                </div>
              ))
        )}
      </div>
    </div>
  );
}
