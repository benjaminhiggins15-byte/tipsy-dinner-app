import { useState, useEffect, type CSSProperties } from "react";

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  display_name: string;
  onboarding_complete: boolean;
};

type Props = {
  onComplete: () => void;
  profile: ProfileType | null;
  onUpdate: (updates: Partial<ProfileType>) => Promise<void>;
};

const labelStyle: CSSProperties = {
  fontFamily: "'Inter', sans-serif",
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(35,60,0,0.35)",
  textAlign: "center",
};

const btnStyle: CSSProperties = {
  background: "#233C00",
  color: "#FAF7F2",
  border: "none",
  borderRadius: 14,
  padding: "14px 0",
  fontFamily: "'Inter', sans-serif",
  fontSize: 12,
  fontWeight: 500,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  width: "100%",
  cursor: "pointer",
  flexShrink: 0,
};

function QuestionScreen({
  question, hint, field, onUpdate, onNext,
}: { label?: string; question: string; hint: string; field: "palate" | "inspiration" | "constraints"; onUpdate: (updates: Partial<ProfileType>) => Promise<void>; onNext: () => void }) {
  const [val, setVal] = useState("");
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", padding: "44px 24px 28px" }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 22, fontWeight: 700, color: "#233C00", textTransform: "uppercase", lineHeight: 1.3, marginBottom: 8 }}>
          {question}
        </div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 12, color: "rgba(35,60,0,0.55)", fontWeight: 300, fontStyle: "italic", lineHeight: 1.5 }}>
          {hint}
        </div>
      </div>
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Type here..."
        style={{
          height: "40%",
          width: "100%",
          background: "rgba(35,60,0,0.05)",
          border: "1px solid rgba(35,60,0,0.1)",
          borderRadius: 12,
          padding: "12px 14px",
          fontFamily: "'Inter', sans-serif",
          fontSize: 13,
          color: "#233C00",
          resize: "none",
          lineHeight: 1.6,
          marginBottom: 16,
          outline: "none",
        }}
      />
      <div style={{ flex: 1 }} />
      <button
        style={btnStyle}
        onClick={async () => {
          await onUpdate({ [field]: val });
          setVal("");
          onNext();
        }}
      >
        Continue
      </button>
    </div>
  );
}

function Loader({ onUpdate, onDone }: { onUpdate: (updates: Partial<ProfileType>) => Promise<void>; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(async () => {
      await onUpdate({ onboarding_complete: true });
      onDone();
    }, 2500);
    return () => clearTimeout(t);
  }, [onDone, onUpdate]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", alignItems: "center", justifyContent: "center", gap: 28, padding: 32 }}>
      <style>{`@keyframes tipsyPulse {0%,100%{transform:scale(1);opacity:.85}50%{transform:scale(1.08);opacity:1}}`}</style>
      <div style={{
        width: 96, height: 96, background: "rgba(35,60,0,0.1)", borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        animation: "tipsyPulse 2.4s ease-in-out infinite",
      }}>
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#233C00" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 13.5c-1.66 0-3-1.34-3-3 0-1.5 1.1-2.74 2.55-2.96A3.5 3.5 0 0 1 12 6a3.5 3.5 0 0 1 6.45 1.54A3 3 0 0 1 21 10.5c0 1.66-1.34 3-3 3" />
          <path d="M6 13.5h12V19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-5.5z" />
          <path d="M9 17h.01M12 17h.01M15 17h.01" />
        </svg>
      </div>
      <div style={{ fontFamily: "'Inter', sans-serif", fontSize: 13, color: "rgba(35,60,0,0.45)", letterSpacing: "0.06em", textAlign: "center" }}>
        Setting up your kitchen...
      </div>
    </div>
  );
}

export default function Onboarding({ onComplete, profile, onUpdate }: Props) {
  const [step, setStep] = useState(1);
  const [transition, setTransition] = useState<{ from: number; to: number } | null>(null);

  // Global styles for inputs and placeholders
  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      input::placeholder, textarea::placeholder {
        color: rgba(35,60,0,0.3);
        opacity: 1;
      }
      input:focus {
        border-bottom-color: #233C00 !important;
      }
      textarea:focus {
        border-color: #233C00 !important;
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);
  const next = () => {
    setStep((s) => {
      const to = s + 1;
      setTransition({ from: s, to });
      return to;
    });
  };

  const renderStep = (s: number) => {
    if (s === 1) return <QuestionScreen key="s1" label="Taste" question="Your palate" hint="Cuisines, flavors, techniques — what makes your cooking yours?" field="palate" onUpdate={onUpdate} onNext={next} />;
    if (s === 2) return <QuestionScreen key="s2" label="Inspiration" question="Your inspiration" hint="Sites, accounts, chefs, cookbooks — who shapes how you cook?" field="inspiration" onUpdate={onUpdate} onNext={next} />;
    if (s === 3) return <QuestionScreen key="s3" label="Constraints" question="Your no-gos" hint="Allergies, aversions, or anything that never makes your plate?" field="constraints" onUpdate={onUpdate} onNext={next} />;
    return <Loader key="s4" onUpdate={onUpdate} onDone={onComplete} />;
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
    display: "flex", flexDirection: "column", background: "#FAF7F2",
    willChange: "transform",
  };

  if (!transition) {
    return <div style={{ ...layerBase, position: "relative" }}>{renderStep(step)}</div>;
  }

  const fromTransform = phase === "start" ? "translateX(0)" : "translateX(-25%)";
  const toTransform = phase === "start" ? "translateX(100%)" : "translateX(0)";
  const transitionStyle = phase === "start" ? "none" : `transform ${DURATION}ms ${EASE}`;

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#FAF7F2" }}>
      <div style={{ ...layerBase, transform: fromTransform, transition: transitionStyle, zIndex: 1, pointerEvents: "none" }}>
        {renderStep(transition.from)}
      </div>
      <div style={{ ...layerBase, transform: toTransform, transition: transitionStyle, zIndex: 2, pointerEvents: "none" }}>
        {renderStep(transition.to)}
      </div>
    </div>
  );
}
