import { useState, useEffect, type CSSProperties } from "react";

type Props = { onComplete: () => void };

const labelStyle: CSSProperties = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#185FA5",
  opacity: 0.75,
  textAlign: "center",
};

const btnStyle: CSSProperties = {
  background: "#0C447C",
  color: "#EEF4F8",
  border: "none",
  borderRadius: 100,
  padding: "14px 0",
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  width: "100%",
  cursor: "pointer",
  flexShrink: 0,
};

function QuestionScreen({
  label, question, hint, storageKey, onNext,
}: { label: string; question: string; hint: string; storageKey: string; onNext: () => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "44px 24px 28px" }}>
      <div style={{ ...labelStyle, marginBottom: 18 }}>{label}</div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 22, color: "#042C53", lineHeight: 1.3, marginBottom: 8 }}>
          {question}
        </div>
        <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: "#185FA5", opacity: 0.75, fontStyle: "italic", lineHeight: 1.5 }}>
          {hint}
        </div>
      </div>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        style={{
          height: "40%",
          width: "100%",
          background: "#D8E9F7",
          border: "1px solid #85B7EB",
          borderRadius: 12,
          padding: "12px 14px",
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13,
          color: "#042C53",
          resize: "none",
          lineHeight: 1.6,
          marginBottom: 16,
          outline: "none",
        }}
      />
      <div style={{ flex: 1 }} />
      <button
        style={btnStyle}
        onClick={() => {
          try { localStorage.setItem(storageKey, val); } catch { /* noop */ }
          setVal("");
          onNext();
        }}
      >
        Continue
      </button>
    </div>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const fieldLabel: CSSProperties = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#185FA5",
    opacity: 0.75,
    marginBottom: 6,
  };
  const fieldInput: CSSProperties = {
    width: "100%",
    height: 32,
    background: "transparent",
    border: "none",
    borderBottom: "1px solid #85B7EB",
    borderRadius: 0,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 14,
    color: "#042C53",
    outline: "none",
    padding: "0 2px",
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "56px 28px 28px" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, color: "#042C53", lineHeight: 1.1 }}>
          Tipsy Dinner
        </div>
        <div style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", fontSize: 13, color: "#185FA5", marginTop: 6, opacity: 0.85 }}>
          your personal kitchen HQ
        </div>
      </div>
      <div style={{ height: 0.5, background: "#85B7EB", opacity: 0.5, margin: "26px 0 22px" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 18 }}>
        <div>
          <div style={fieldLabel}>Name</div>
          <input style={fieldInput} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <div style={fieldLabel}>Email</div>
          <input style={fieldInput} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <div style={fieldLabel}>Password</div>
          <input style={fieldInput} type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
      </div>
      <button
        style={btnStyle}
        onClick={() => {
          try {
            if (name) localStorage.setItem("tipsyDinnerName", name);
            if (email) localStorage.setItem("tipsyDinnerEmail", email);
          } catch { /* noop */ }
          onNext();
        }}
      >
        Let's Get Started
      </button>
    </div>
  );
}

function Loader({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", gap: 28, padding: 32 }}>
      <style>{`@keyframes tipsyPulse {0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}`}</style>
      <div style={{
        width: 96, height: 96, background: "#D8E9F7", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "tipsyPulse 2.4s ease-in-out infinite",
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#185FA5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 13.5c-1.66 0-3-1.34-3-3 0-1.5 1.1-2.74 2.55-2.96A3.5 3.5 0 0 1 12 6a3.5 3.5 0 0 1 6.45 1.54A3 3 0 0 1 21 10.5c0 1.66-1.34 3-3 3" />
          <path d="M6 13.5h12V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5.5z" />
          <path d="M9 17h.01M12 17h.01M15 17h.01" />
        </svg>
      </div>
      <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "#185FA5", letterSpacing: "0.06em", opacity: 0.85, textAlign: "center" }}>
        Setting up your kitchen...
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [transition, setTransition] = useState<{ from: number; to: number } | null>(null);
  const next = () => {
    setStep((s) => {
      const to = s + 1;
      setTransition({ from: s, to });
      return to;
    });
  };

  const renderStep = (s: number) => {
    if (s === 1) return <Welcome key="s1" onNext={next} />;
    if (s === 2) return <QuestionScreen key="s2" label="Taste" question="Your palate" hint="Cuisines, flavors, techniques — what makes your cooking yours?" storageKey="tipsyDinnerPalate" onNext={next} />;
    if (s === 3) return <QuestionScreen key="s3" label="Inspiration" question="Where do you go for recipes?" hint="Sites, accounts, chefs, cookbooks — who shapes how you cook?" storageKey="tipsyDinnerInspiration" onNext={next} />;
    if (s === 4) return <QuestionScreen key="s4" label="Table" question="Who are you cooking for?" hint="Just the two of you, a crowd, somewhere in between?" storageKey="tipsyDinnerTable" onNext={next} />;
    if (s === 5) return <QuestionScreen key="s5" label="Constraints" question="Anything your kitchen never touches?" hint="Allergies, hard nos, things that never make the cut." storageKey="tipsyDinnerConstraints" onNext={next} />;
    return <Loader key="s6" onDone={() => {
      try { localStorage.setItem("tipsyDinnerOnboardingComplete", "true"); } catch { /* noop */ }
      onComplete();
    }} />;
  };

  const DURATION = 280;
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
  const transKey = transition ? `${transition.from}->${transition.to}` : null;
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const phase: "start" | "end" = transKey && armedKey !== transKey ? "start" : "end";

  useEffect(() => {
    if (!transKey) return;
    if (armedKey === transKey) return;
    let r2 = 0;
    let cancelled = false;
    const r1 = requestAnimationFrame(() => {
      if (cancelled) return;
      r2 = requestAnimationFrame(() => { if (!cancelled) setArmedKey(transKey); });
    });
    return () => { cancelled = true; cancelAnimationFrame(r1); if (r2) cancelAnimationFrame(r2); };
  }, [transKey, armedKey]);

  useEffect(() => {
    if (!transition) return;
    if (phase !== "end") return;
    const t = setTimeout(() => { setTransition(null); setArmedKey(null); }, DURATION + 20);
    return () => clearTimeout(t);
  }, [phase, transition]);

  const layerBase: CSSProperties = {
    position: "absolute", inset: 0, height: "100%",
    display: "flex", flexDirection: "column", background: "#EEF4F8",
    willChange: "transform",
  };

  if (!transition) {
    return <div style={{ ...layerBase, position: "relative" }}>{renderStep(step)}</div>;
  }

  const fromTransform = phase === "start" ? "translateX(0)" : "translateX(-25%)";
  const toTransform = phase === "start" ? "translateX(100%)" : "translateX(0)";
  const transitionStyle = phase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#EEF4F8" }}>
      <div style={{ ...layerBase, transform: fromTransform, transition: transitionStyle, zIndex: 1, pointerEvents: "none" }}>
        {renderStep(transition.from)}
      </div>
      <div style={{ ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: 2, pointerEvents: "none" }}>
        {renderStep(transition.to)}
      </div>
    </div>
  );
}
