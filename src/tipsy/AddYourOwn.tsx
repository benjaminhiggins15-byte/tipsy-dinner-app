import { useState, useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { saveRecipe, updateSavedRecipe, deleteSavedRecipe, loadCustomCategories, addRecipeToMenuSection, type Recipe, type MenuSection } from "./data";
import SaveRecipeFlow from "./SaveRecipeFlow";

type Step = 1 | 2 | 3 | 4 | 6;

type Props = {
  back: () => void;
  goCategories: () => void;
  goRecipe: (recipe: Recipe, categoryKey: string, categoryLabel: string) => void;
  editRecipe?: Recipe;
  editCategoryLabel?: string;
  onSaveEdit?: (updated: Recipe, categoryLabel: string) => void;
  onDeleted?: () => void;
  onCreateCategoryForRecipe?: (payload: {
    title: string;
    description: string;
    ingredients: { name: string; qty: string }[];
    steps: string[];
  }) => void;
  initialDraft?: {
    title: string;
    description: string;
    ingredients: { name: string; qty: string }[];
    steps: string[];
    step?: Step;
    trayOpen?: boolean;
  };
};

const C = {
  bg: "#FAF7F2",
  inputBg: "rgba(35,60,0,0.05)",
  inputBorder: "rgba(35,60,0,0.1)",
  inputBorderActive: "rgba(35,60,0,0.3)",
  text: "#233C00",
  textMuted: "rgba(35,60,0,0.35)",
  textLight: "rgba(35,60,0,0.6)",
  textVeryLight: "rgba(35,60,0,0.4)",
  textRemove: "rgba(35,60,0,0.2)",
  textDivider: "rgba(35,60,0,0.25)",
  dividerLine: "rgba(35,60,0,0.08)",
  progressTrack: "rgba(35,60,0,0.1)",
  progressFill: "#233C00",
  nextBtnBg: "#233C00",
  nextBtnText: "#FAF7F2",
  saveBtnBg: "#233C00",
  saveBtnText: "#FAF7F2",
  sheetHandle: "rgba(35,60,0,0.15)",
  chipBg: "rgba(35,60,0,0.05)",
  chipBorder: "rgba(35,60,0,0.1)",
  chipSelected: "rgba(35,60,0,0.1)",
  chipBorderSelected: "rgba(35,60,0,0.35)",
  menuBtnBg: "rgba(35,60,0,0.04)",
  menuBtnBorder: "rgba(35,60,0,0.1)",
  menuBtnText: "rgba(35,60,0,0.7)",
  stepNumBg: "rgba(35,60,0,0.06)",
  stepNumBorder: "rgba(35,60,0,0.1)",
  stepNumText: "rgba(35,60,0,0.4)",
  error: "#c0392b",
};

const fontSerif = "Fraunces, serif";
const fontSans = "Inter, sans-serif";
const fontDisplay = "Inter, sans-serif";

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

export default function AddYourOwn({ back, goCategories, goRecipe, editRecipe, editCategoryLabel, onSaveEdit, onDeleted, onCreateCategoryForRecipe, initialDraft }: Props) {
  const isEdit = typeof editRecipe?.savedId === "number";
  const [showDelete, setShowDelete] = useState(false);
  const [step, setStep] = useState<Step>(initialDraft?.step ?? 1);
  const [title, setTitle] = useState(initialDraft?.title ?? editRecipe?.title ?? "");
  const [desc, setDesc] = useState(initialDraft?.description ?? editRecipe?.description ?? "");
  const [titleErr, setTitleErr] = useState(false);
  const [descErr, setDescErr] = useState(false);

  const [ingName, setIngName] = useState("");
  const [ingQty, setIngQty] = useState("");
  const [ingErr, setIngErr] = useState(false);
  const [ingredients, setIngredients] = useState<{ name: string; qty: string }[]>(initialDraft?.ingredients ?? editRecipe?.ingredients ?? []);

  const [stepInput, setStepInput] = useState("");
  const [stepErr, setStepErr] = useState(false);
  const [steps, setSteps] = useState<string[]>(initialDraft?.steps ?? editRecipe?.steps ?? []);

  const [tab, setTab] = useState<"ingredients" | "steps">("ingredients");
  const [trayOpen, setTrayOpen] = useState(!!initialDraft?.trayOpen);
  const [newCategorySelection, setNewCategorySelection] = useState<{ key: string; label: string } | null>((initialDraft as any)?.newCategory || null);
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

  const headerLabel = step === 1 ? (isEdit ? "Back" : "Craft") : "Back";
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

  const onPickCategory = (key: string, label: string, menuInfo?: { menuId: number; section: MenuSection }) => {
    const id = Date.now();
    saveRecipe({
      id,
      title: title.trim(),
      description: desc.trim(),
      category: key,
      ingredients,
      steps,
      createdAt: new Date().toISOString(),
    });

    if (menuInfo) {
      addRecipeToMenuSection(menuInfo.menuId, menuInfo.section, id);
    }

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
      {/* Top Bar */}
      <div style={{
        height: 52,
        display: "flex", alignItems: "center",
        padding: "0 24px",
        position: "relative", flexShrink: 0,
      }}>
        <button onClick={onHeaderBack} aria-label="Back" style={{
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", padding: 0,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(35,60,0,0.6)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Progress */}
      {step >= 1 && step <= 3 && (
        <div style={{ padding: "0 24px 20px", flexShrink: 0 }}>
          <div style={{ height: 2, background: C.progressTrack, borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%",
              background: C.progressFill,
              borderRadius: 2,
              width: `${step * 20}%`,
              transition: "width 0.35s ease",
            }} />
          </div>
        </div>
      )}

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 24px 28px" }}>
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
              {isEdit && (
                <button onClick={() => setShowDelete(true)} style={{
                  width: "100%", background: "transparent", color: C.error,
                  border: "none", padding: "12px",
                  fontFamily: fontSans, fontSize: 12, fontWeight: 600,
                  letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
                  marginTop: 4,
                }}>Delete recipe</button>
              )}
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
                            <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "center" }}>
                              <div style={{ width: 80, flexShrink: 0 }}>
                                <EditInput
                                  value={editing.qty}
                                  onChange={(v) => setEditing({ ...editing, qty: v })}
                                  placeholder="Qty"
                                  onEnter={confirmEditIngredient}
                                />
                              </div>
                              <div style={{ flex: 1 }}>
                                <EditInput
                                  value={editing.name}
                                  onChange={(v) => setEditing({ ...editing, name: v })}
                                  placeholder="Ingredient"
                                  autoFocus
                                  onEnter={confirmEditIngredient}
                                />
                              </div>
                            </div>
                            <ConfirmBtn onClick={confirmEditIngredient} />
                          </ListItem>
                        </div>
                      );
                    }
                    return (
                      <ListItem key={i}>
                        <div style={{ width: 80, flexShrink: 0 }}>
                          <input
                            value={it.qty}
                            readOnly
                            onClick={() => startEditIngredient(i)}
                            style={{
                              width: 80,
                              minWidth: 80,
                              maxWidth: 80,
                              background: C.inputBg,
                              border: `1px solid ${C.inputBorder}`,
                              borderRadius: 10,
                              padding: "12px 14px",
                              fontSize: 15,
                              fontWeight: 500,
                              fontFamily: fontSans,
                              color: C.textVeryLight,
                              textAlign: "center",
                              fontVariantNumeric: "tabular-nums",
                              cursor: "pointer",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>
                        <div
                          onClick={() => startEditIngredient(i)}
                          style={{ flex: 1, cursor: "pointer" }}
                        >
                          <input
                            value={it.name}
                            readOnly
                            style={{
                              width: "100%",
                              background: C.inputBg,
                              border: `1px solid ${C.inputBorder}`,
                              borderRadius: 10,
                              padding: "12px 14px",
                              fontSize: 15,
                              fontWeight: 400,
                              fontFamily: fontSans,
                              color: C.text,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                        <DelBtn onClick={() => removeIngredient(i)} />
                      </ListItem>
                    );
                  })}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 80, flexShrink: 0 }}>
                  <input
                    id="qty-input"
                    type="text"
                    value={ingQty}
                    onChange={(e) => setIngQty(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addIngredient(); } }}
                    placeholder="Qty"
                    style={{
                      width: 80,
                      minWidth: 80,
                      maxWidth: 80,
                      background: C.inputBg,
                      border: `1px solid ${C.inputBorder}`,
                      borderRadius: 10,
                      padding: "12px 14px",
                      fontSize: 15,
                      fontWeight: 500,
                      fontFamily: fontSans,
                      color: C.textVeryLight,
                      textAlign: "center",
                      fontVariantNumeric: "tabular-nums",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <TextInput
                    value={ingName}
                    onChange={(v) => { setIngName(v); if (v.trim()) setIngErr(false); }}
                    placeholder="Ingredient"
                    onEnter={() => {
                      const el = document.getElementById("qty-input") as HTMLInputElement | null;
                      el?.focus();
                    }}
                  />
                </div>
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
                            <div style={{
                              width: 28,
                              height: 28,
                              borderRadius: "50%",
                              background: C.stepNumBg,
                              border: `1px solid ${C.stepNumBorder}`,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}>
                              <span style={{
                                fontFamily: fontSans,
                                fontSize: 11,
                                fontWeight: 500,
                                color: C.stepNumText,
                              }}>{i + 1}</span>
                            </div>
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
                        <div style={{
                          width: 28,
                          height: 28,
                          borderRadius: "50%",
                          background: C.stepNumBg,
                          border: `1px solid ${C.stepNumBorder}`,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}>
                          <span style={{
                            fontFamily: fontSans,
                            fontSize: 11,
                            fontWeight: 500,
                            color: C.stepNumText,
                          }}>{i + 1}</span>
                        </div>
                        <div style={{ flex: 1 }}>
                          <input
                            value={s}
                            readOnly
                            onClick={() => startEditStep(i)}
                            style={{
                              width: "100%",
                              background: C.inputBg,
                              border: `1px solid ${C.inputBorder}`,
                              borderRadius: 10,
                              padding: "12px 14px",
                              fontSize: 14,
                              fontWeight: 400,
                              fontFamily: fontSans,
                              color: C.text,
                              lineHeight: 1.5,
                              cursor: "pointer",
                            }}
                          />
                        </div>
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
              <div style={{ fontFamily: fontSans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(35,60,0,0.35)", marginBottom: 16 }}>Looking good.</div>
              <PreviewCard recipe={previewRecipe} tab={tab} setTab={setTab} />
              <div style={{ display: "flex", justifyContent: "center", marginTop: 20 }}>
                {isEdit ? (
                  <button onClick={saveEdit} style={{
                    padding: "12px 28px",
                    background: C.nextBtnBg,
                    color: C.nextBtnText,
                    border: "none",
                    borderRadius: 20,
                    fontFamily: fontSans,
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    textTransform: "lowercase",
                    cursor: "pointer",
                  }}>Save</button>
                ) : (
                  <button onClick={() => setTrayOpen(true)} style={{
                    padding: "12px 28px",
                    background: C.nextBtnBg,
                    color: C.nextBtnText,
                    border: "none",
                    borderRadius: 20,
                    fontFamily: fontSans,
                    fontSize: 12,
                    fontWeight: 500,
                    letterSpacing: "0.02em",
                    textTransform: "lowercase",
                    cursor: "pointer",
                  }}>Save</button>
                )}
              </div>
            </>
          )}

          {step === 6 && savedCategory && (
            <>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "rgba(35,60,0,0.06)", border: "1px solid rgba(35,60,0,0.14)",
                borderRadius: 10, padding: "10px 14px", marginBottom: 16,
              }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: C.text }} />
                <span style={{ fontFamily: fontSans, fontSize: 12, color: C.text, fontWeight: 500 }}>
                  Saved to {savedCategory.label}
                </span>
              </div>
              <Eyebrow>Your recipe</Eyebrow>
              <Title>{title}</Title>
              <Sub>Tap the card to view it in Explore.</Sub>
              <div onClick={() => goRecipe({ ...previewRecipe, categoryKey: savedCategory.key }, savedCategory.key, savedCategory.label)} style={{ cursor: "pointer" }}>
                <PreviewCard recipe={previewRecipe} tab={tab} setTab={setTab} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={reset} style={browseActionStyle(false)}>Add another</button>
                <button onClick={goCategories} style={browseActionStyle(true)}>Explore all</button>
              </div>
            </>
          )}
        </ScreenWrap>
      </div>

      {/* Bottom sheet */}
      {trayOpen && (
        <SaveRecipeFlow
          onClose={() => {
            setTrayOpen(false);
            setNewCategorySelection(null);
          }}
          onPick={onPickCategory}
          onNew={() => {
            setTrayOpen(false);
            onCreateCategoryForRecipe?.({
              title: title.trim(),
              description: desc.trim(),
              ingredients,
              steps,
            });
          }}
          initialSelectedCategory={newCategorySelection}
        />
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
            position: "absolute", inset: 0, background: "rgba(35,60,0,0.55)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 30, padding: 24,
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
            <div style={{
              fontFamily: fontDisplay,
              fontStyle: "normal",
              fontSize: 20,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              color: C.text,
              textAlign: "center",
            }}>
              Delete this recipe?
            </div>
            <div style={{ fontFamily: fontSans, fontSize: 13, color: C.textLight, textAlign: "center", marginBottom: 12 }}>
              This can't be undone.
            </div>
            <button
              onClick={() => setShowDelete(false)}
              style={{
                width: "100%", padding: "12px", borderRadius: 10,
                background: "transparent", border: `1px solid ${C.inputBorder}`,
                color: C.textLight, fontFamily: fontSans,
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
                background: C.error, border: "none",
                color: C.bg, fontFamily: fontSans,
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
  return <div style={{ fontFamily: fontSans, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontDisplay, fontStyle: "normal", fontSize: 26, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: C.text, marginBottom: 4, lineHeight: 1.1 }}>{children}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 12, color: C.textLight, lineHeight: 1.5, marginBottom: 20 }}>{children}</div>;
}
function Field({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: 18 }}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label style={{ display: "block", fontFamily: fontSans, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: C.textMuted, marginBottom: 6 }}>{children}</label>;
}
function ValMsg({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: fontSans, fontSize: 11, color: C.error, marginTop: 5 }}>{children}</div>;
}

const inputStyleBase: CSSProperties = {
  width: "100%", background: C.inputBg, border: `1px solid ${C.inputBorder}`,
  borderRadius: 10, padding: "12px 14px",
  fontFamily: fontSans, fontSize: 15, fontWeight: 400, color: C.text, lineHeight: 1.4,
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
        borderColor: focused ? C.inputBorderActive : C.inputBorder,
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
        ...inputStyleBase,
        fontFamily: fontSerif,
        fontStyle: "italic",
        fontWeight: 300,
        fontSize: 15,
        resize: "none",
        lineHeight: 1.5,
        minHeight: 80,
        borderColor: focused ? C.inputBorderActive : C.inputBorder,
      }}
    />
  );
}

function PrimaryBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", background: C.nextBtnBg, color: C.nextBtnText, border: "none",
      borderRadius: 12, padding: "14px",
      fontFamily: fontSans, fontSize: 12, fontWeight: 500,
      letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer",
      marginTop: 8,
    }}>{children}</button>
  );
}

function GhostBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: "100%", background: "none", color: C.textLight,
      border: `1px solid ${C.inputBorder}`, borderRadius: 12, padding: "12px",
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
      fontFamily: fontSans, fontSize: 13, fontWeight: 500,
      color: C.textMuted, background: "none",
      border: "none",
      padding: "4px 0", cursor: "pointer", width: "100%", marginTop: 4,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
      {children}
    </button>
  );
}

function ListItem({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: "flex", alignItems: "center",
      background: C.inputBg, border: `1px solid ${C.inputBorder}`,
      borderRadius: 10, padding: "10px 12px", marginBottom: 6, gap: 10,
      animation: "tipsy-fadeup 0.2s ease",
    }}>{children}</div>
  );
}

function DelBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Remove" style={{
      background: "none", border: "none", cursor: "pointer",
      width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
      flexShrink: 0, padding: 0,
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.textRemove} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
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
        padding: "12px 14px",
        fontSize: 15,
        borderColor: focused ? C.inputBorderActive : C.inputBorder,
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
        background: C.nextBtnBg, border: "none", color: C.nextBtnText, cursor: "pointer",
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
    background: primary ? C.text : "none",
    border: `1px solid ${primary ? C.text : "rgba(35,60,0,0.1)"}`,
    color: primary ? C.bg : C.text,
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
    <div style={{ marginBottom: 20 }}>
        <div style={{ fontFamily: fontDisplay, fontSize: 28, textTransform: "uppercase", color: C.text, marginBottom: 6, lineHeight: 1.2 }}>
          {recipe.title}
        </div>
        <div style={{ fontFamily: fontSerif, fontStyle: "italic", fontSize: 14, color: "rgba(35,60,0,0.55)", lineHeight: 1.5, marginBottom: 16 }}>
          {recipe.description}
        </div>
        <div style={{ display: "flex", gap: 24, borderBottom: `1px solid rgba(35,60,0,0.08)`, marginBottom: 12 }}>
          {(["ingredients", "steps"] as const).map((t) => {
            const active = tab === t;
            return (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: "10px 0",
                fontFamily: fontSans, fontSize: 11, letterSpacing: "0.08em",
                textTransform: "uppercase", fontWeight: 500,
                color: active ? C.text : "rgba(35,60,0,0.3)",
                background: "none", border: "none",
                borderBottom: active ? `1.5px solid ${C.text}` : "none",
                marginBottom: active ? -1 : 0,
                cursor: "pointer",
              }}>{t}</button>
            );
          })}
        </div>
        {tab === "ingredients" && (
          ingredients.length === 0
            ? <div style={{ fontFamily: fontSans, fontSize: 12, color: "rgba(35,60,0,0.35)", fontStyle: "italic", textAlign: "center", padding: 14 }}>No ingredients added.</div>
            : ingredients.map((it, i) => (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", fontFamily: fontSans, fontSize: 15,
                  borderBottom: i === ingredients.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)",
                }}>
                  <span style={{ color: C.text }}>{it.name}</span>
                  <span style={{ color: "rgba(35,60,0,0.45)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}>{it.qty}</span>
                </div>
              ))
        )}
        {tab === "steps" && (
          steps.length === 0
            ? <div style={{ fontFamily: fontSans, fontSize: 12, color: "rgba(35,60,0,0.35)", fontStyle: "italic", textAlign: "center", padding: 14 }}>No steps added.</div>
            : steps.map((s, i) => (
                <div key={i} style={{
                  display: "flex", gap: 14, padding: "12px 0", alignItems: "flex-start",
                  borderBottom: i === steps.length - 1 ? "none" : "1px dotted rgba(35,60,0,0.1)",
                }}>
                  <div style={{
                    width: 28, height: 28, minWidth: 28,
                    borderRadius: "50%",
                    background: "rgba(35,60,0,0.06)",
                    border: "1px solid rgba(35,60,0,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: fontSans, fontSize: 11, fontWeight: 500,
                    color: "rgba(35,60,0,0.45)",
                  }}>{i + 1}</div>
                  <span style={{ fontFamily: fontSans, fontSize: 14, color: C.text, lineHeight: 1.5, flex: 1, paddingTop: 3 }}>{s}</span>
                </div>
              ))
        )}
    </div>
  );
}
