import { useState, useEffect, useRef, type CSSProperties } from "react";
import { generateTasteProfile } from "./data";
import { supabase } from "../lib/supabase";
import { ChatBubble, TypingBubble, CookInputBar } from "./ChatUI";

type ProfileType = {
  id: string;
  palate: string;
  inspiration: string;
  constraints: string;
  display_name: string;
  handle: string;
  onboarding_complete: boolean;
  taste_profile: string | null;
};

type Props = {
  onComplete: () => void;
  profile: ProfileType | null;
  onUpdate: (updates: Partial<ProfileType>) => Promise<void>;
};

// Bounded wait for generateTasteProfile to land before releasing to Home
// regardless — the fix for the confirmed handoff race (a brand-new user's
// first compute-slice call could previously run against a still-null
// taste_profile because navigation to Home never waited on this call at
// all). Never hangs past this. Tunable on-phone.
const TASTE_PROFILE_HANDOFF_TIMEOUT_MS = 9000;

// Non-allergy sessions may release to Home once this window elapses even if
// taste_profile hasn't landed yet, trusting Home's taste_profile-dependent
// self-correct effect (see Home.tsx) to pick up personalization once it does
// land. Allergy-flagged sessions (see containsAllergyMention below) ignore
// this and always hold for the full TASTE_PROFILE_HANDOFF_TIMEOUT_MS instead.
// Default matches the full timeout (i.e. no early release for anyone) until
// deliberately tuned down for the non-allergy path — keep both constants
// adjacent so they're trivially tunable together.
const NON_ALLERGY_EARLY_RELEASE_MS = TASTE_PROFILE_HANDOFF_TIMEOUT_MS;

// SEAM: placeholder allergy detection only, used to bias the handoff timing
// above. A real structured allergy/dislike parser (and the reactive
// reflections referenced elsewhere in this file) lands in a follow-up build —
// this does not change what gets written to `constraints`.
function containsAllergyMention(text: string): boolean {
  return /allerg(y|ies|ic)/i.test(text);
}

type ChatMessage = { id: number; role: "user" | "ai"; text: string };
type Stage = "palate" | "inspiration" | "constraints" | "done";

// Scripted conversational onboarding. Reuses Build's chat presentation
// (ChatBubble, the messages[] list shape, the input bar, typing indicator)
// as a visual shell around a hard-wired script — NOT the Build engine
// (fireAICall/sendMessage/handleChipClick). Writes the same three profile
// fields (palate/inspiration/constraints) via the same onUpdate path the
// rest of the app uses.
function OnboardingChat({
  profile, onUpdate, onNext,
}: { profile: ProfileType | null; onUpdate: (updates: Partial<ProfileType>) => Promise<void>; onNext: () => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [typing, setTyping] = useState(false);
  const [input, setInput] = useState("");
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [stage, setStage] = useState<Stage>("palate");
  const idRef = useRef(0);
  const startedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const answersRef = useRef({ palate: "", inspiration: "" });

  const pushMessage = (role: "user" | "ai", text: string) => {
    idRef.current += 1;
    setMessages((prev) => [...prev, { id: idRef.current, role, text }]);
  };

  const sayAI = (text: string, pauseMs = 550) =>
    new Promise<void>((resolve) => {
      setTyping(true);
      setTimeout(() => {
        setTyping(false);
        pushMessage("ai", text);
        resolve();
      }, pauseMs);
    });

  // Fail-soft: a write failure must never block/hang the conversation or
  // surface an error to a brand-new user — the script always proceeds.
  const safeUpdate = async (updates: Partial<ProfileType>) => {
    try {
      await onUpdate(updates);
    } catch (err) {
      console.error("Onboarding write failed:", err);
    }
  };

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const firstName = profile?.display_name?.trim().split(" ")[0] || "";
    (async () => {
      await sayAI(
        firstName
          ? `Hey ${firstName} — welcome to Tipsy Dinner, excited to cook together. Before we get going, I want to learn your taste a little. Three quick things, then I'll set up your kitchen around them.`
          : "Hey — welcome to Tipsy Dinner, excited to cook together. Before we get going, I want to learn your taste a little. Three quick things, then I'll set up your kitchen around them.",
        250
      );
      await sayAI("So: what makes your cooking yours? Cuisines you keep coming back to, flavors you lean on, the way you like to cook.");
      setAwaitingInput(true);
    })();
    // Run-once intro sequence — deliberately not re-keyed off profile/onUpdate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typing]);

  const handleSend = async () => {
    if (!awaitingInput) return;
    const val = input.trim();
    if (!val) return;
    pushMessage("user", val);
    setInput("");
    setAwaitingInput(false);

    if (stage === "palate") {
      answersRef.current.palate = val;
      await safeUpdate({ palate: val });
      // SEAM: reactive reflection on the palate answer slots in here (next
      // build) — for now this is a plain placeholder acknowledgment.
      await sayAI("Got it.");
      await sayAI("Who shapes how you cook? A chef, a cookbook, an account you save from, someone who taught you.");
      setStage("inspiration");
      setAwaitingInput(true);
      return;
    }

    if (stage === "inspiration") {
      answersRef.current.inspiration = val;
      await safeUpdate({ inspiration: val });
      // SEAM: reactive reflection on the inspiration answer slots in here
      // (next build) — for now this is a plain placeholder acknowledgment.
      await sayAI("Got it.");
      await sayAI("Last thing, and this one I'll always respect. Any allergies I should know about? And then, separately, anything you'd just rather not see.");
      setStage("constraints");
      setAwaitingInput(true);
      return;
    }

    if (stage === "constraints") {
      await safeUpdate({ constraints: val });
      // SEAM: structured allergy/dislike parsing + reactive reflection slots
      // in here (next build) — for now the raw no-gos text is written as-is
      // via the same onUpdate path the rest of onboarding uses, with only a
      // plain acknowledgment shown.
      await sayAI("Got it.");
      await sayAI(`Okay, here's what I've got: ${answersRef.current.palate} / ${answersRef.current.inspiration} / ${val}.`);
      await sayAI("Give me a second — setting up your kitchen around that.");
      setStage("done");
      onNext();
      return;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#FAF7F2" }}>
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "48px 20px 12px", display: "flex", flexDirection: "column", gap: 20 }}>
        {messages.map((m) => (
          <ChatBubble key={m.id} role={m.role} text={m.text} />
        ))}
        {typing && <TypingBubble />}
      </div>
      <CookInputBar
        value={input}
        onChange={setInput}
        onSend={handleSend}
        placeholder="Type here..."
        disabled={!awaitingInput}
      />
    </div>
  );
}

function Loader({ onUpdate, onDone, profile }: { onUpdate: (updates: Partial<ProfileType>) => Promise<void>; onDone: () => void; profile: ProfileType | null }) {
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        await onUpdate({ onboarding_complete: true });
      } catch (err) {
        console.error("Onboarding completion write failed:", err);
      }

      if (!profile) {
        if (!cancelled) onDone();
        return;
      }

      const hasAllergyMention = containsAllergyMention(profile.constraints || "");
      const releaseBoundMs = hasAllergyMention ? TASTE_PROFILE_HANDOFF_TIMEOUT_MS : NON_ALLERGY_EARLY_RELEASE_MS;

      const tasteProfileDone = generateTasteProfile(profile.id, {
        palate: profile.palate,
        inspiration: profile.inspiration,
        constraints: profile.constraints,
      }).then(async () => {
        // generateTasteProfile writes taste_profile directly via Supabase,
        // bypassing onUpdate — so nothing else refreshes local profile state.
        // Sync it back in via the existing onUpdate setter so Home's
        // taste_profile-dependent self-correct effect actually has something
        // to react to, including when this lands AFTER the bounded release
        // below (this continues running even after this component unmounts).
        try {
          const { data, error } = await supabase
            .from("profiles")
            .select("taste_profile")
            .eq("id", profile.id)
            .maybeSingle();
          if (!error && data) {
            await onUpdate({ taste_profile: data.taste_profile });
          }
        } catch (err) {
          console.error("Taste profile state sync failed:", err);
        }
      });

      const timeout = new Promise<void>((resolve) => setTimeout(resolve, releaseBoundMs));
      await Promise.race([tasteProfileDone, timeout]);
      if (!cancelled) onDone();
    })();

    return () => {
      cancelled = true;
    };
    // Run-once handoff sequence — deliberately not re-keyed off profile/
    // onUpdate/onDone, which all change identity mid-sequence as writes land.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const next = () => {
    setStep((s) => {
      const to = s + 1;
      setTransition({ from: s, to });
      return to;
    });
  };

  const renderStep = (s: number) => {
    if (s === 1) return <OnboardingChat key="chat" profile={profile} onUpdate={onUpdate} onNext={next} />;
    return <Loader key="loader" onUpdate={onUpdate} onDone={onComplete} profile={profile} />;
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
